import { execFile } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { trackDAdapterRevision, trackDAgentLabels, trackDAgentsByMode, type TrackDAgent, type TrackDCheck, type TrackDRequest,
  type TrackDRun, type TrackDSession, type TrackDTask } from '../../../../packages/contracts/src/track-d';
import { liveAgents, taskPrompt, TrackDPublicCheckUnavailableError } from './agents';
import { createMeter, isPinnedReceipt, limits, type GatewayConfig } from './gateway';
import { gradeTrackD, hash, oracleRevision, publicSuiteRevision, starter, trackTasks } from './grader';

const exec = promisify(execFile);

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
    model: config?.model ?? null, comparable: false, worker, oracle: oracleRevision, publicSuiteRevision, adapterRevision: trackDAdapterRevision,
    ...(config?.reasoningEffort ? { reasoningEffort: config.reasoningEffort } : {}), limits, runs: [] };
}

async function runTrial(session: TrackDSession, task: TrackDTask, repeat: number, agentId: TrackDAgent,
  seed: number, config: GatewayConfig | null, shutdown?: AbortSignal): Promise<TrackDRun> {
  const baseline = starter(task);
  const deadline = AbortSignal.timeout(limits.agentSeconds * 1000);
  const signal = shutdown ? AbortSignal.any([shutdown, deadline]) : deadline;
  const meter = config ? createMeter(config, session.request.fault === 'model-outage', signal) : null;
  const trace: TrackDRun['trace'] = [];
  const log = (source: TrackDRun['trace'][number]['source'], message: string) => trace.push({ source, message, at: new Date().toISOString() });
  log('adapter', 'Fresh workspace initialized from the frozen Track D starter.');
  if (session.request.fault === 'misleading-input') log('adapter', 'Added an unverified issue comment to the task prompt.');
  let source = baseline;
  let steps = null;
  let toolCalls = null;
  let agentNote: string | undefined;
  let adapterFailed = false;
  let publicCheckUnavailable = false;
  const start = performance.now();
  try {
    if (config && meter) {
      if (agentId !== 'proofbench' && agentId !== 'opencode') throw new Error('Unknown live Track D adapter.');
      const result = await liveAgents[agentId]({ baseline, worker: session.worker, config, meter, signal, trace: log,
        prompt: taskPrompt(trackTasks[task], session.request.fault === 'misleading-input') });
      ({ source, steps, toolCalls, agentNote } = result);
    } else {
      source = starter(task, agentId === 'reference-repair');
      log('adapter', 'Loaded a predetermined source fixture. No coding agent or model ran.');
    }
  } catch (error) {
    publicCheckUnavailable = error instanceof TrackDPublicCheckUnavailableError;
    adapterFailed = !publicCheckUnavailable;
    log(publicCheckUnavailable ? 'grader' : 'adapter', publicCheckUnavailable
      ? 'Public checks were unavailable. The trial stopped without submitting an unvalidated edit.'
      : 'Adapter did not produce a usable source artifact.');
  }
  const agentMs = performance.now() - start;
  const receipts = meter?.receipts ?? [];
  for (const receipt of receipts) {
    log('gateway', receipt.relayRejection ? 'Relay rejected a request after the model-call cap. No Bifrost request was made.' :
      receipt.injected ? 'Injected HTTP 503 before the Bifrost request.' :
      `HTTP ${receipt.status}${receipt.model ? ` · ${receipt.model}` : ''}${receipt.requestId ? ` · ${receipt.requestId}` : ''}`);
  }
  let unavailableReason: TrackDRun['unavailableReason'];
  if (shutdown?.aborted) unavailableReason = 'interrupted';
  else if (deadline.aborted) unavailableReason = 'agent-timeout';
  else if (publicCheckUnavailable) unavailableReason = 'grader-error';
  else if (source === baseline && receipts.some(receipt => !receipt.injected && receipt.status >= 400) &&
    !receipts.some(receipt => receipt.status === 200)) unavailableReason = 'gateway-error';
  else if (adapterFailed) unavailableReason = 'agent-error';

  let checks: TrackDCheck[] = [];
  if (!unavailableReason) {
    try {
      const grade = () => gradeTrackD(source, session.worker, seed);
      if (session.request.fault === 'tool-error') {
        const failedAttempt = Promise.reject(new Error('Injected grader tool error.'));
        checks = await failedAttempt.catch(() => {
          log('grader', 'Injected grader tool error. The harness retried grading once.');
          return grade();
        });
      } else {
        checks = await grade();
      }
    } catch {
      checks = [{ name: 'Grader infrastructure', outcome: 'unavailable', detail: 'The pinned oracle or worker could not complete this trial.' }];
    }
    if (checks.some(check => check.outcome === 'unavailable')) unavailableReason = 'grader-error';
  }
  for (const check of checks) log('grader', `${check.name}: ${check.outcome}.`);
  const verdict = unavailableReason ? 'unavailable'
    : checks.every(check => check.outcome === 'passed') ? 'passed' : 'failed';
  const verdictMs = performance.now() - start;
  const total = (key: 'input' | 'output' | 'costUsd') =>
    config && receipts.length > 0 && receipts.every(receipt => receipt.injected || receipt[key] !== null)
      ? receipts.reduce((sum, receipt) => sum + (receipt[key] ?? 0), 0)
      : null;
  return { id: randomUUID(), agent: trackDAgentLabels[agentId], agentId, task, repeat, seed, verdict, unavailableReason,
    agentMs, verdictMs, steps, toolCalls, agentNote, receipts, trace, checks,
    inputTokens: total('input'), outputTokens: total('output'), costUsd: total('costUsd'),
    sourceSha256: hash(source), diff: await sourceDiff(baseline, source) };
}

export async function executeTrackD(session: TrackDSession, config: GatewayConfig | null,
  publish: (session: TrackDSession) => Promise<void>, shutdown?: AbortSignal) {
  try {
    const agents = session.request.agents ?? trackDAgentsByMode[session.request.mode];
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
      run.receipts.every(receipt => receipt.injected ||
        (receipt.relayRejection === 'model-call-limit' && receipt.status === 429) || isPinnedReceipt(receipt, config.model)));
    session.status = 'completed';
  } catch {
    session.status = 'failed';
    session.message = shutdown?.aborted
      ? 'The server stopped before the benchmark finished. Start a new run to finish the comparison.'
      : 'The benchmark was interrupted before all runs could be recorded.';
  }
  await publish(session);
  return session;
}
