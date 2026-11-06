import { execFile } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { TrackDCheck, TrackDRequest, TrackDRun, TrackDSession, TrackDTask } from '../../../../packages/contracts/src/track-d';
import { liveAgents, taskPrompt } from './agents';
import { createMeter, isPinnedReceipt, limits, type GatewayConfig } from './gateway';
import { gradeTrackD, hash, oracleRevision, starter, trackTasks } from './grader';

const exec = promisify(execFile);
const fixtures = ['Reference repair fixture', 'Unpatched starter fixture'];

async function sourceDiff(before: string, after: string) {
  if (before === after) return '';
  const root = await mkdtemp(join(tmpdir(), 'proofbench-diff-'));
  try {
    await writeFile(join(root, 'starter.cpp'), before);
    await writeFile(join(root, 'submission.cpp'), after);
    const result = await exec('git', ['-c', 'core.autocrlf=false', 'diff', '--no-index', '--no-ext-diff', '--no-color',
      '--', 'starter.cpp', 'submission.cpp'], { cwd: root, timeout: 5000 })
      .catch((error: { code?: number; stdout?: string }) => {
        if (error.code !== 1 || typeof error.stdout !== 'string') throw error;
        return { stdout: error.stdout };
      });
    return result.stdout;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export function createTrackDSession(request: TrackDRequest, worker: TrackDSession['worker'], config: GatewayConfig | null): TrackDSession {
  return { id: randomUUID(), createdAt: new Date().toISOString(), request, status: 'running',
    model: config?.model ?? null, comparable: false, worker, oracle: oracleRevision, limits, runs: [] };
}

async function runTrial(session: TrackDSession, task: TrackDTask, repeat: number, agent: string,
  seed: number, config: GatewayConfig | null, shutdown?: AbortSignal): Promise<TrackDRun> {
  const baseline = starter(task);
  const deadline = AbortSignal.timeout(limits.agentSeconds * 1000);
  const signal = shutdown ? AbortSignal.any([shutdown, deadline]) : deadline;
  const meter = config ? createMeter(config, session.request.fault === 'model-outage', signal) : null;
  const trace: TrackDRun['trace'] = [];
  const log = (source: TrackDRun['trace'][number]['source'], message: string) => trace.push({ source, message, at: new Date().toISOString() });
  log('adapter', 'Fresh workspace initialized from the frozen Track D starter.');
  if (session.request.fault === 'misleading-input') log('adapter', 'Added the same unverified issue comment to both agent prompts.');
  let source = baseline;
  let steps = null;
  let toolCalls = null;
  let agentNote: string | undefined;
  let adapterFailed = false;
  const start = performance.now();
  try {
    if (config && meter) {
      const adapter = liveAgents.find(item => item.name === agent);
      if (!adapter) throw new Error('Unknown Track D adapter.');
      const result = await adapter.run({ baseline, worker: session.worker, config, meter, signal, trace: log,
        prompt: taskPrompt(trackTasks[task], session.request.fault === 'misleading-input') });
      ({ source, steps, toolCalls, agentNote } = result);
    } else {
      source = starter(task, agent === fixtures[0]);
      log('adapter', 'Loaded a predetermined source fixture. No coding agent or model ran.');
    }
  } catch {
    adapterFailed = true;
    log('adapter', 'Adapter did not produce a usable source artifact.');
  }
  const agentMs = performance.now() - start;
  const receipts = meter?.receipts ?? [];
  for (const receipt of receipts) {
    log('gateway', receipt.injected ? 'Injected HTTP 503 before the Bifrost request.' :
      `HTTP ${receipt.status}${receipt.model ? ` · ${receipt.model}` : ''}${receipt.requestId ? ` · ${receipt.requestId}` : ''}`);
  }
  let checks: TrackDCheck[];
  try {
    const grade = () => gradeTrackD(source, session.worker, seed);
    let failOnce = session.request.fault === 'tool-error';
    const invokeGrader = () => {
      if (failOnce) {
        failOnce = false;
        return Promise.reject(new Error('Injected grader tool error.'));
      }
      return grade();
    };
    checks = await invokeGrader().catch(error => {
      if (session.request.fault !== 'tool-error') throw error;
      log('grader', 'Injected grader tool error. The harness retried grading once.');
      return invokeGrader();
    });
  } catch {
    checks = [{ name: 'Grader infrastructure', outcome: 'unavailable', detail: 'The pinned oracle or worker could not complete this trial.' }];
  }
  for (const check of checks) log('grader', `${check.name}: ${check.outcome}.`);
  const verdict = checks.some(check => check.outcome === 'unavailable') || adapterFailed ? 'unavailable'
    : checks.every(check => check.outcome === 'passed') ? 'passed' : 'failed';
  const verdictMs = performance.now() - start;
  const total = (key: 'input' | 'output' | 'costUsd') =>
    config && receipts.length > 0 && receipts.every(receipt => receipt.injected || receipt[key] !== null)
      ? receipts.reduce((sum, receipt) => sum + (receipt[key] ?? 0), 0)
      : null;
  return { id: randomUUID(), agent, task, repeat, seed, verdict, agentMs, verdictMs, steps, toolCalls, agentNote, receipts, trace, checks,
    inputTokens: total('input'), outputTokens: total('output'), costUsd: total('costUsd'),
    sourceSha256: hash(source), diff: await sourceDiff(baseline, source) };
}

export async function executeTrackD(session: TrackDSession, config: GatewayConfig | null,
  publish: (session: TrackDSession) => Promise<void>, shutdown?: AbortSignal) {
  try {
    const agents = config ? liveAgents.map(agent => agent.name) : fixtures;
    for (const task of session.request.tasks) {
      for (let repeat = 1; repeat <= session.request.repeats; repeat++) {
        const seed = randomInt(1, 0xffffffff);
        // Alternate execution order to reduce warm-cache bias.
        for (const agent of repeat % 2 === 1 ? agents : [...agents].reverse()) {
          shutdown?.throwIfAborted();
          session.runs.push(await runTrial(session, task, repeat, agent, seed, config, shutdown));
          await publish(session);
        }
      }
    }
    shutdown?.throwIfAborted();
    session.comparable = config !== null && session.runs.every(run => run.verdict !== 'unavailable' &&
      run.receipts.some(receipt => isPinnedReceipt(receipt, config.model)) &&
      run.receipts.every(receipt => receipt.injected || isPinnedReceipt(receipt, config.model)));
    session.status = 'completed';
  } catch {
    session.status = 'failed';
    session.message = 'The benchmark was interrupted before all runs could be recorded.';
  }
  await publish(session);
  return session;
}
