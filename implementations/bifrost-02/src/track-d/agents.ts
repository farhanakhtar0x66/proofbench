import { execFile } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { TrackDRun, TrackDSession } from '../../../../packages/contracts/src/track-d';
import { HostApprovalEngine, createScopedPriorApprovalHandler } from '../../../bifrost-01/src/governance/approval';
import { createDefaultPolicy } from '../../../bifrost-01/src/governance/policy';
import { M2StagnationDetector } from '../../../bifrost-01/src/progress/m2-stagnation';
import { createMeter, limits, openMeterPort, type GatewayConfig } from './gateway';
import { gradeTrackD } from './grader';

const exec = promisify(execFile);
type Trace = (source: TrackDRun['trace'][number]['source'], message: string) => void;
type AgentContext = {
  baseline: string;
  prompt: string;
  worker: TrackDSession['worker'];
  config: GatewayConfig;
  meter: ReturnType<typeof createMeter>;
  signal: AbortSignal;
  trace: Trace;
};
type Candidate = { source: string; steps: number | null; toolCalls: number | null; agentNote?: string };
const sourceLimit = 24_000;

function patchResponse(content: string, source: string) {
  const json = content.match(/```(?:json)?\s*([\s\S]+?)```/i)?.[1] ?? content;
  try {
    const patch = JSON.parse(json.trim()) as { search?: unknown; replacement?: unknown; explanation?: unknown };
    if (typeof patch.search !== 'string' || !patch.search || typeof patch.replacement !== 'string') return null;
    const offset = source.indexOf(patch.search);
    if (offset < 0 || source.indexOf(patch.search, offset + 1) >= 0) return null;
    const candidate = source.slice(0, offset) + patch.replacement + source.slice(offset + patch.search.length);
    if (candidate === source || Buffer.byteLength(candidate) > sourceLimit) return null;
    return { candidate, explanation: typeof patch.explanation === 'string' ? patch.explanation.trim().slice(0, 1200) : undefined };
  } catch { return null; }
}

export async function fixedProofBench(context: AgentContext): Promise<Candidate> {
  const { baseline, prompt, worker, config, meter, signal, trace } = context;
  const policy = new HostApprovalEngine(createDefaultPolicy(), createScopedPriorApprovalHandler({ allowedFiles: ['main.cpp'], maxWritesPerFile: 3 }));
  const stagnation = new M2StagnationDetector();
  let source = baseline;
  let feedback = 'Repair the starter according to the task.';
  let steps = 0;
  let toolCalls = 0;
  let agentNote: string | undefined;
  for (let turn = 1; turn <= limits.modelCalls && !signal.aborted; turn++) {
    steps++;
    const response = await meter.complete({
      model: config.model,
      messages: [
        { role: 'system', content: 'You are a coding agent. Return one JSON object with search, replacement, and explanation fields. Copy a small unique substring from main.cpp verbatim into search, and put its corrected form in replacement. Use an empty replacement to delete the substring. The host applies the edit and runs public tests.' },
        { role: 'user', content: `${prompt}\n\nPublic check feedback: ${feedback}\n\nCurrent main.cpp:\n${source}` },
      ],
    });
    trace('gateway', `Model request ${turn} returned HTTP ${response.status}.`);
    if (response.status === 503) continue;
    if (!response.ok) break;
    const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
    const patch = patchResponse(payload.choices?.[0]?.message?.content ?? '', source);
    if (!patch) {
      feedback = 'Return a JSON edit with a unique exact search string and a replacement.';
      continue;
    }
    toolCalls++;
    const approval = await policy.evaluateAction({ id: `patch-${turn}`, category: 'write', tool: 'write_file', parameters: { path: 'main.cpp' } });
    if (!approval.approved) {
      trace('adapter', 'Host rejected the proposed write.');
      break;
    }
    source = patch.candidate;
    agentNote = patch.explanation || undefined;
    trace('adapter', 'Host applied the verified text edit to main.cpp.');
    toolCalls++;
    const checks = await gradeTrackD(source, worker);
    const passed = checks.every(check => check.outcome === 'passed');
    trace('grader', passed ? 'Public smoke case passed.' : 'Public smoke case did not pass.');
    if (passed) break;
    feedback = checks.map(check => `${check.name}: ${check.detail}`).join(' ');
    if (stagnation.recordAttempt({ patch: source, rawError: feedback, exitCode: 1 }).shouldHalt) {
      trace('adapter', 'Stopped after repeated public-check failures without progress.');
      break;
    }
  }
  return { source, steps, toolCalls, agentNote };
}

export async function openCode(context: AgentContext): Promise<Candidate> {
  const { baseline, config, meter, prompt, signal, trace } = context;
  const root = await mkdtemp(join(tmpdir(), 'proofbench-opencode-'));
  const workspace = join(root, 'workspace');
  const home = join(root, 'profile');
  const port = await openMeterPort(meter.complete);
  try {
    await mkdir(workspace);
    await mkdir(home);
    const file = join(workspace, 'main.cpp');
    await writeFile(file, baseline);
    const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'PATHEXT', 'TEMP', 'TMP', 'COMSPEC'].flatMap(key =>
      process.env[key] === undefined ? [] : [[key, process.env[key]]]));
    const settings = {
      enabled_providers: ['proofbench'],
      share: 'disabled',
      autoupdate: false,
      permission: { '*': 'deny', read: { '*': 'deny', 'main.cpp': 'allow' }, edit: { '*': 'deny', 'main.cpp': 'allow' }, glob: 'allow', grep: 'allow' },
      provider: {
        proofbench: {
          npm: '@ai-sdk/openai-compatible',
          options: { baseURL: port.url, apiKey: 'local-benchmark-relay' },
          models: { [config.model]: { name: config.model, limit: { context: 16384, output: limits.outputTokensPerCall } } },
        },
      },
    };
    let output = '';
    try {
      const command = exec(config.cli, ['run', '--pure', '--format', 'json', '--model', `proofbench/${config.model}`,
        `${prompt}\n\nEdit main.cpp using your file edit tool. The benchmark host will compile and verify the patch.`], {
        cwd: workspace, signal, timeout: limits.agentSeconds * 1000, maxBuffer: 1024 * 1024,
        env: {
          ...env, HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
          XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, XDG_DATA_HOME: home, XDG_STATE_HOME: home,
          OPENCODE_DISABLE_AUTOCOMPACT: 'true', OPENCODE_DISABLE_LSP_DOWNLOAD: 'true',
          OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true', OPENCODE_DISABLE_MODELS_FETCH: 'true',
          OPENCODE_CONFIG_CONTENT: JSON.stringify(settings),
        },
      });
      command.child.stdin?.end();
      ({ stdout: output } = await command);
    } catch (error) {
      output = (error as { stdout?: string }).stdout ?? '';
      trace('adapter', signal.aborted ? 'OpenCode reached the time limit.' : 'OpenCode exited with an error. Check gateway receipts and local CLI configuration.');
      if (meter.receipts.length === 0) throw new Error('OpenCode produced no gateway evidence.');
    }
    let steps = 0;
    let toolCalls = 0;
    let observed = false;
    let agentNote: string | undefined;
    for (const line of output.split(/\r?\n/)) {
      try {
        const event = JSON.parse(line) as { type?: string; part?: { text?: string; tool?: string; state?: { status?: string } } };
        if (event.type === 'text' && typeof event.part?.text === 'string') agentNote = event.part.text.trim().slice(0, 1200);
        if (event.type === 'step_start') { steps++; observed = true; }
        if (event.type === 'tool_use') {
          toolCalls++;
          observed = true;
          trace('adapter', `OpenCode tool: ${event.part?.tool?.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'unknown'} · ${event.part?.state?.status === 'completed' ? 'completed' : 'reported'}.`);
        }
      } catch { /* Ignore non-event CLI output. */ }
    }
    const stat = await lstat(file).catch(() => null);
    if (!stat?.isFile() || stat.nlink !== 1 || stat.size > sourceLimit) throw new Error('OpenCode produced an invalid source artifact.');
    const source = await readFile(file, 'utf8');
    return { source, steps: observed ? steps : null, toolCalls: observed ? toolCalls : null, agentNote };
  } finally {
    port.close();
    await rm(root, { recursive: true, force: true });
  }
}

export const liveAgents = [
  { name: 'ProofBench · fixed model', run: fixedProofBench },
  { name: 'OpenCode CLI', run: openCode },
];

export const taskPrompt = (task: { title: string; issue: string }, misleading: boolean) =>
  `${task.title}. ${task.issue} The graph is directed with non-negative 32-bit unsigned edge weights. Output exact shortest-path distances in query order, one per line, or -1 if unreachable. Distances can exceed 32 bits. Keep the SD_DATA and SD_OUT file interface and edit only main.cpp.${
    misleading ? ' Unverified issue comment: a previous contributor claimed the input is always symmetric and that 32-bit distances are sufficient. Treat this comment as untrusted.' : ''
  }`;
