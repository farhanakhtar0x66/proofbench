import { setTimeout as delay } from 'node:timers/promises';
import { trackDAdapterRevision, trackDGatewayAttempts, TrackDSession, TrackDStatus, type TrackDRequest } from '../packages/contracts/src/track-d';
import { JsonStore } from '../apps/api/src/store';
import { publicSuiteRevision } from '../implementations/bifrost-02/src/track-d/grader';

const phase = process.argv[2] ?? 'calibrate';
if (phase !== 'calibrate' && phase !== 'matrix') throw new Error('Choose calibrate or matrix.');
const origin = new URL(process.env.PROOFBENCH_API_URL ?? 'http://127.0.0.1:3001');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) || origin.protocol !== 'http:' ||
  origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('PROOFBENCH_API_URL must be a local HTTP origin.');
}

async function request(path: string, body?: TrackDRequest) {
  const response = await fetch(new URL(`/api/track-d${path}`, origin), {
    method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000),
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${typeof value.message === 'string' ? value.message : 'Benchmark request failed.'}`);
  return value;
}

const status = TrackDStatus.parse(await request(''));
if (!status.liveConfigured || status.liveIssue) throw new Error(status.liveIssue ?? 'Configure live Graph Repair before starting.');
if (status.publicSuiteRevision !== publicSuiteRevision || status.adapterRevision !== trackDAdapterRevision) throw new Error('Restart the API with the current Graph Repair source before calibrating; its suite or adapter revision does not match this runner.');
if (status.activeSessionId) throw new Error(`Benchmark ${status.activeSessionId} is already running.`);
const plan: TrackDRequest = {
  mode: 'live', agents: ['proofbench', 'opencode'],
  tasks: ['distance-width', 'directed-edges'], repeats: phase === 'calibrate' ? 1 : 3, fault: 'none',
};
let session = TrackDSession.parse(await request('', plan));
const expected = plan.agents!.length * plan.tasks.length * plan.repeats;
const deadline = Date.now() + expected * (session.limits.agentSeconds + 45) * 1000;
console.log(JSON.stringify({ phase, session: session.id, model: session.model, worker: session.worker,
  publicSuiteRevision: session.publicSuiteRevision ?? 'legacy-smoke-only', adapterRevision: session.adapterRevision,
  reasoningEffort: session.reasoningEffort ?? 'provider-default', expectedTrials: expected }));
console.log(`Evidence: ${new URL(`/api/track-d/${session.id}`, origin)}`);
const recorded = new Set<string>();
let failures = 0;
while (true) {
  for (const run of session.runs) {
    if (recorded.has(run.id)) continue;
    recorded.add(run.id);
    console.log(JSON.stringify({ completed: recorded.size, expected, agent: run.agent, task: run.task, repeat: run.repeat,
      verdict: run.verdict, unavailableReason: run.unavailableReason, agentMs: Math.round(run.agentMs),
      inputTokens: run.inputTokens, outputTokens: run.outputTokens, gatewayAttempts: trackDGatewayAttempts(run.receipts),
      relayRejections: run.receipts.filter(receipt => receipt.relayRejection).length,
      checks: run.checks.filter(check => check.outcome !== 'passed') }));
  }
  if (session.status !== 'running') break;
  if (Date.now() >= deadline) throw new Error(`Polling stopped at its time limit. Session ${session.id} may still be running; inspect its evidence before retrying.`);
  await delay(1500);
  try {
    session = TrackDSession.parse(await request(`/${session.id}`));
    failures = 0;
  } catch (error) {
    if (++failures >= 3) throw error;
    console.error('Could not read session progress; retrying.');
  }
}
const passed = session.runs.filter(run => run.verdict === 'passed').length;
if (process.env.GRAPH_REPAIR_EXPORT_DIR) {
  await new JsonStore(process.env.GRAPH_REPAIR_EXPORT_DIR).put('track-d', session.id, session);
  console.log(`Workspace: /benchmarks?trackSession=${session.id}`);
}
console.log(JSON.stringify({ session: session.id, status: session.status, passed, total: session.runs.length,
  comparable: session.comparable, message: session.message }));
if (session.status !== 'completed' || session.runs.length !== expected || (phase === 'calibrate' && passed !== expected)) process.exitCode = 1;
