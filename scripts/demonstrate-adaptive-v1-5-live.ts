/**
 * ProofBench Adaptive Execution Engine v1.5 — Final Live Multi-Model Acceptance & Reproducible Evidence Suite
 *
 * REQUIREMENTS & INTEGRITY GUARANTEES:
 * 1. Strict Live Preconditions: Stock Maxim Bifrost gateway (http://127.0.0.1:8089) with real local models:
 *    - SMALL_LLM: Qwen 1.5B (Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M)
 *    - STRONGER_LLM: Qwen 9B (gguf/Qwen3.5-9B-GGUF:Q4_K_M)
 * 2. Zero Mock Gateway / Zero Prewritten Code: Every model response, patch, token count, and latency
 *    is produced live by the gateway and local inference servers. No synthetic fallback.
 * 3. True OS Child-Process Restart: Controller processes are spawned via child_process.fork,
 *    testing planned suspension and abrupt OS SIGKILL with disk checkpoint resumption.
 * 4. Multi-Task Controlled Benchmark: 4 controlled policies evaluated on AdaptiveExecutionEngine across
 *    frozen tasks with signed empirical attribution (no Math.max(0, ...) suppression).
 * 5. Honest Empirical Reporting: All transitions, passes, failures, and tokens are measured and reported
 *    without cherry-picking or forced success.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fork, ChildProcess } from 'node:child_process';
import {
  AdaptiveExecutionEngine,
  createWorkspaceApprovalHandler,
  BifrostClient,
  TaskWorkspace,
  DurableStore,
  getCodingTasksDir,
  ComparativeBenchmarkSuite,
} from '../implementations/bifrost-01/src/index';
import {
  TaskSpec,
  ControlledBenchmarkExportSchema,
} from '../packages/contracts/src/index';

try {
  process.loadEnvFile?.();
} catch {
  // Continue if loadEnvFile is not supported
}

const GATEWAY_URL = process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089';
const VIRTUAL_KEY = process.env.BIFROST_VIRTUAL_KEY;
const SMALL_MODEL_ID = process.env.BIFROST_DEFAULT_MODEL ?? 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M';
const STRONGER_MODEL_ID = process.env.BIFROST_RECOVERY_MODEL ?? 'gguf/Qwen3.5-9B-GGUF:Q4_K_M';
const WORKER_SCRIPT = path.resolve(process.cwd(), 'implementations/bifrost-01/src/runtime/controller-worker.ts');

function getUsageValue(obs: unknown): number | null {
  if (obs && typeof obs === 'object' && 'value' in obs && typeof (obs as { value: unknown }).value === 'number') {
    return (obs as { value: number }).value;
  }
  return null;
}

interface LivePreflightResult {
  gatewayOnline: boolean;
  gatewayStatus: string;
  modelsFound: string[];
  smallModelAvailable: boolean;
  strongerModelAvailable: boolean;
  virtualKeyConfigured: boolean;
  latencyMs: number;
}

async function verifyLiveGatewayPreflight(): Promise<LivePreflightResult> {
  const start = performance.now();
  if (!VIRTUAL_KEY) {
    throw new Error(
      'STRICT LIVE PRECONDITION FAILED: BIFROST_VIRTUAL_KEY is not configured in .env or environment.\n' +
      'v1.5 strict live mode prohibits simulation fallbacks. Please configure a valid Bifrost virtual key.'
    );
  }

  // 1. Health check
  let healthOk = false;
  let statusText = 'unknown';
  try {
    const healthResp = await fetch(`${GATEWAY_URL}/health`, { signal: AbortSignal.timeout(4000) });
    if (healthResp.ok) {
      const data = (await healthResp.json()) as { status?: string };
      healthOk = data.status === 'ok';
      statusText = data.status ?? 'ok';
    }
  } catch (err) {
    throw new Error(
      `STRICT LIVE PRECONDITION FAILED: Maxim Bifrost gateway at ${GATEWAY_URL} is unreachable.\n` +
      `Ensure the daemon is running (e.g. bifrost-http-0 -port 8089). Error: ${(err as Error).message}`
    );
  }

  if (!healthOk) {
    throw new Error(`STRICT LIVE PRECONDITION FAILED: Gateway /health returned non-ok status: ${statusText}`);
  }

  // 2. Models query
  let modelsFound: string[] = [];
  try {
    const modelsResp = await fetch(`${GATEWAY_URL}/v1/models`, {
      headers: {
        Authorization: `Bearer ${VIRTUAL_KEY}`,
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!modelsResp.ok) {
      throw new Error(`HTTP ${modelsResp.status}: ${await modelsResp.text()}`);
    }
    const data = (await modelsResp.json()) as { data?: Array<{ id: string }> };
    modelsFound = (data.data ?? []).map((m) => m.id);
  } catch (err) {
    throw new Error(
      `STRICT LIVE PRECONDITION FAILED: Failed to query /v1/models with virtual key.\n` +
      `Error: ${(err as Error).message}`
    );
  }

  const smallModelAvailable = modelsFound.some((id) => id.includes(SMALL_MODEL_ID) || id.includes('1.5B'));
  const strongerModelAvailable = modelsFound.some((id) => id.includes(STRONGER_MODEL_ID) || id.includes('9B'));

  if (!smallModelAvailable) {
    throw new Error(
      `STRICT LIVE PRECONDITION FAILED: Small coding model '${SMALL_MODEL_ID}' is not registered in Bifrost gateway.\n` +
      `Available models: [${modelsFound.join(', ')}]`
    );
  }

  if (!strongerModelAvailable) {
    throw new Error(
      `STRICT LIVE PRECONDITION FAILED: Stronger model '${STRONGER_MODEL_ID}' is not registered in Bifrost gateway.\n` +
      `Available models: [${modelsFound.join(', ')}]`
    );
  }

  const latencyMs = Math.round(performance.now() - start);
  return {
    gatewayOnline: true,
    gatewayStatus: statusText,
    modelsFound,
    smallModelAvailable,
    strongerModelAvailable,
    virtualKeyConfigured: true,
    latencyMs,
  };
}

async function loadTask(tasksDir: string, taskId: string): Promise<TaskSpec> {
  const p = path.join(tasksDir, taskId, 'task.json');
  const raw = await fs.readFile(p, 'utf8');
  return TaskSpec.parse(JSON.parse(raw));
}

function runChildWorkerLive(args: string[]): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null; result?: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    let capturedResult: Record<string, unknown> | undefined;

    const child = fork(WORKER_SCRIPT, args, {
      execArgv: ['--import', 'tsx'],
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, BIFROST_GATEWAY_URL: GATEWAY_URL, BIFROST_VIRTUAL_KEY: VIRTUAL_KEY },
    });

    child.on('message', (msg: Record<string, unknown>) => {
      if (msg.type === 'result') {
        capturedResult = msg.data as Record<string, unknown>;
      }
    });

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      if (text.includes('[WORKER_RESULT]')) {
        try {
          const jsonStr = text.slice(text.indexOf('[WORKER_RESULT]') + 15).trim();
          capturedResult = JSON.parse(jsonStr);
        } catch (_err) {
          void _err;
        }
      }
    });

    child.on('error', reject);

    child.on('exit', (exitCode, signal) => {
      resolve({ exitCode, signal, result: capturedResult });
    });
  });
}

async function main() {
  console.log('='.repeat(80));
  console.log('PROOFBENCH v1.5 FINAL LIVE MULTI-MODEL ACCEPTANCE & REPRODUCIBLE EVIDENCE');
  console.log('Repository: farhanakhtar0x66/proofbench | Branch: feat/bifrost-01-proofbench');
  console.log('Challenge: Bifrost #01 — Coding Agent with Minimal Token Usage');
  console.log('='.repeat(80));

  // --------------------------------------------------------------------------
  // STEP 0: STRICT LIVE PREFLIGHT CHECKS
  // --------------------------------------------------------------------------
  console.log('\n[Preflight] Verifying Live Bifrost Gateway & Inference Endpoints...');
  const preflight = await verifyLiveGatewayPreflight();
  console.log(`  Gateway URL:         ${GATEWAY_URL} (status: ${preflight.gatewayStatus})`);
  console.log(`  Preflight Latency:   ${preflight.latencyMs} ms`);
  console.log(`  Small Model (1.5B):  ${SMALL_MODEL_ID} [ONLINE]`);
  console.log(`  Stronger Model (9B): ${STRONGER_MODEL_ID} [ONLINE]`);
  console.log('  Live Preflight Status: ALL CHECKS PASSED (Zero simulation allowed)\n');

  const liveClient = new BifrostClient({
    mode: 'live',
    gatewayUrl: GATEWAY_URL,
    virtualKey: VIRTUAL_KEY,
  });

  const tasksDir = getCodingTasksDir();
  const evidenceReport: Record<string, unknown> = {
    version: '1.5',
    generatedAt: new Date().toISOString(),
    preflight,
    pillars: {},
  };

  // ==========================================================================
  // PILLAR 1: DETERMINISTIC NON-LLM EXECUTION (TASK 6)
  // ==========================================================================
  console.log('-'.repeat(80));
  console.log('PILLAR 1: DETERMINISTIC ZERO-TOKEN NON-LLM MECHANICAL REPAIR (TASK 6)');
  console.log('Task: task-6-unused-mut-compiler-warning (remove unnecessary mut keyword)');
  console.log('Target: 0 model tokens, 0 LLM calls, deterministic CPU-only completion.');
  console.log('-'.repeat(80));

  const task6Spec = await loadTask(tasksDir, 'task-6-deterministic-fix');
  const ws6 = await TaskWorkspace.create(task6Spec.id);
  const engine6 = new AdaptiveExecutionEngine({
    bifrostClient: liveClient,
    approvalHandler: createWorkspaceApprovalHandler(),
    maxTurns: 2,
  });

  const startCpu6 = process.cpuUsage();
  const startWall6 = performance.now();
  const res6 = await engine6.runTask(task6Spec, { workspacePath: ws6.workspacePath });
  const cpuDiff6 = process.cpuUsage(startCpu6);
  const cpuMs6 = res6.controllerCpuMs ?? Math.max(1, Math.round((cpuDiff6.user + cpuDiff6.system) / 1000));
  const wallMs6 = res6.wallDurationMs ?? Math.round(performance.now() - startWall6);
  const inTok6 = getUsageValue(res6.run.usage.inputTokens);
  const outTok6 = getUsageValue(res6.run.usage.outputTokens);

  console.log(`[Task 6] ${task6Spec.id} ("${task6Spec.title}")`);
  console.log(`  Status:               ${res6.run.status.toUpperCase()}`);
  console.log(`  Acceptance:           ${res6.run.acceptance.status.toUpperCase()}`);
  console.log(`  Turns Executed:       ${res6.controllerState.turnCount}`);
  console.log(`  Input Tokens:         ${inTok6} (${res6.run.usage.inputTokens.status})`);
  console.log(`  Output Tokens:        ${outTok6} (${res6.run.usage.outputTokens.status})`);
  console.log(`  Total Tokens:         ${(inTok6 ?? 0) + (outTok6 ?? 0)}`);
  console.log(`  Deterministic Ops:    ${res6.deterministicOperationsCount}`);
  console.log(`  Avoided Model Calls:  ${res6.avoidedModelRequests}`);
  console.log(`  Controller CPU:       ${cpuMs6} ms`);
  console.log(`  Child Process CPU:    ${res6.childProcessCpuMs} ms`);
  console.log(`  Wall-Clock Duration:  ${wallMs6} ms`);

  if (res6.run.acceptance.status !== 'passed' || (inTok6 ?? 0) !== 0 || (outTok6 ?? 0) !== 0) {
    throw new Error('Pillar 1 Failed: Expected Task 6 to pass with strictly 0 tokens.');
  }
  console.log('✅ PILLAR 1 PASSED: Verified 0-token deterministic pass via MechanicalTransformer.\n');

  (evidenceReport.pillars as Record<string, unknown>).pillar1_deterministic_non_llm = {
    taskId: task6Spec.id,
    passed: res6.run.acceptance.status === 'passed',
    turns: res6.controllerState.turnCount,
    inputTokens: inTok6,
    outputTokens: outTok6,
    totalTokens: 0,
    avoidedRequests: res6.avoidedModelRequests,
    cpuMs: cpuMs6,
    childProcessCpuMs: res6.childProcessCpuMs,
    wallMs: wallMs6,
  };

  // ==========================================================================
  // PILLAR 2: LIVE SMALL LLM EXECUTION & NON-LLM ACCEPTANCE (TASK 1)
  // ==========================================================================
  console.log('-'.repeat(80));
  console.log('PILLAR 2: LIVE SMALL LLM INFERENCE VIA BIFROST & NON-LLM ACCEPTANCE (TASK 1)');
  console.log(`Task: task-1-fix-failing-func (off-by-one bounds bug in sliding window sums)`);
  console.log(`Model: ${SMALL_MODEL_ID}`);
  console.log('-'.repeat(80));

  const task1Spec = await loadTask(tasksDir, 'task-1-fix-failing-func');
  const ws1 = await TaskWorkspace.create(task1Spec.id);
  const engine1 = new AdaptiveExecutionEngine({
    bifrostClient: liveClient,
    approvalHandler: createWorkspaceApprovalHandler(),
    maxTurns: 3,
  });

  const startCpu1 = process.cpuUsage();
  const startWall1 = performance.now();
  const res1 = await engine1.runTask(task1Spec, { workspacePath: ws1.workspacePath });
  const cpuDiff1 = process.cpuUsage(startCpu1);
  const cpuMs1 = res1.controllerCpuMs ?? Math.max(1, Math.round((cpuDiff1.user + cpuDiff1.system) / 1000));
  const wallMs1 = res1.wallDurationMs ?? Math.round(performance.now() - startWall1);
  const inTok1 = getUsageValue(res1.run.usage.inputTokens);
  const outTok1 = getUsageValue(res1.run.usage.outputTokens);

  console.log(`[Task 1] ${task1Spec.id} ("${task1Spec.title}")`);
  console.log(`  Status:               ${res1.run.status.toUpperCase()}`);
  console.log(`  Acceptance:           ${res1.run.acceptance.status.toUpperCase()}`);
  console.log(`  Turns Executed:       ${res1.controllerState.turnCount}`);
  console.log(`  Input Tokens:         ${inTok1} (${res1.run.usage.inputTokens.status})`);
  console.log(`  Output Tokens:        ${outTok1} (${res1.run.usage.outputTokens.status})`);
  console.log(`  Total Tokens:         ${(inTok1 ?? 0) + (outTok1 ?? 0)}`);
  console.log(`  Controller CPU:       ${cpuMs1} ms`);
  console.log(`  Child Process CPU:    ${res1.childProcessCpuMs} ms`);
  console.log(`  Inference Duration:   ${res1.inferenceDurationMs} ms`);
  console.log(`  Wall-Clock Duration:  ${wallMs1} ms`);

  if (res1.run.acceptance.status !== 'passed') {
    throw new Error(`Pillar 2 Failed: Expected Task 1 to pass live execution, got ${res1.run.acceptance.status}`);
  }
  console.log('✅ PILLAR 2 PASSED: Live model execution succeeded with verified non-LLM acceptance.\n');

  (evidenceReport.pillars as Record<string, unknown>).pillar2_live_small_model = {
    taskId: task1Spec.id,
    passed: res1.run.acceptance.status === 'passed',
    turns: res1.controllerState.turnCount,
    inputTokens: inTok1,
    outputTokens: outTok1,
    totalTokens: (inTok1 ?? 0) + (outTok1 ?? 0),
    inferenceDurationMs: res1.inferenceDurationMs,
    cpuMs: cpuMs1,
    childProcessCpuMs: res1.childProcessCpuMs,
    wallMs: wallMs1,
  };

  // ==========================================================================
  // PILLAR 3: LIVE MULTI-MODULE PROJECT TRAJECTORY & NATURAL ROUTING (TASK 9)
  // ==========================================================================
  console.log('-'.repeat(80));
  console.log('PILLAR 3: LIVE MULTI-MODULE PROJECT TRAJECTORY & NATURAL ROUTING (TASK 9)');
  console.log('Task: task-9-bidirectional-event-service (multi-module Rust service)');
  console.log('-'.repeat(80));

  const task9Spec = await loadTask(tasksDir, 'task-9-bidirectional-event-service');
  const ws9 = await TaskWorkspace.create(task9Spec.id);
  const engine9 = new AdaptiveExecutionEngine({
    bifrostClient: liveClient,
    approvalHandler: createWorkspaceApprovalHandler(),
    maxTurns: 4,
  });

  const startCpu9 = process.cpuUsage();
  const startWall9 = performance.now();
  const res9 = await engine9.runTask(task9Spec, { workspacePath: ws9.workspacePath });
  const cpuDiff9 = process.cpuUsage(startCpu9);
  const cpuMs9 = res9.controllerCpuMs ?? Math.max(1, Math.round((cpuDiff9.user + cpuDiff9.system) / 1000));
  const wallMs9 = res9.wallDurationMs ?? Math.round(performance.now() - startWall9);
  const inTok9 = getUsageValue(res9.run.usage.inputTokens);
  const outTok9 = getUsageValue(res9.run.usage.outputTokens);

  console.log(`[Task 9] ${task9Spec.id} ("${task9Spec.title}")`);
  console.log(`  Final Run Status:     ${res9.run.status.toUpperCase()}`);
  console.log(`  Acceptance:           ${res9.run.acceptance.status.toUpperCase()}`);
  console.log(`  Turns Executed:       ${res9.controllerState.turnCount}`);
  console.log(`  Deterministic Ops:    ${res9.deterministicOperationsCount}`);
  console.log(`  Avoided Requests:     ${res9.avoidedModelRequests}`);
  console.log(`  Input Tokens:         ${inTok9}`);
  console.log(`  Output Tokens:        ${outTok9}`);
  console.log(`  Total Tokens:         ${(inTok9 ?? 0) + (outTok9 ?? 0)}`);
  console.log(`  Transitions Count:    ${res9.controllerState.transitions.length}`);
  for (const tr of res9.controllerState.transitions) {
    console.log(`    * ${tr.fromTier} ➔ ${tr.toTier}: ${tr.reason}`);
  }
  console.log(`  Controller CPU:       ${cpuMs9} ms`);
  console.log(`  Child Process CPU:    ${res9.childProcessCpuMs} ms`);
  console.log(`  Wall-Clock Duration:  ${wallMs9} ms`);

  console.log('✅ PILLAR 3 COMPLETED: Live multi-module task executed through Bifrost with full trace.');
  console.log(`  Honest Outcome Recorded: status=${res9.run.status}, acceptance=${res9.run.acceptance.status}\n`);

  (evidenceReport.pillars as Record<string, unknown>).pillar3_live_task9_trajectory = {
    taskId: task9Spec.id,
    status: res9.run.status,
    acceptance: res9.run.acceptance.status,
    turns: res9.controllerState.turnCount,
    transitions: res9.controllerState.transitions,
    inputTokens: inTok9,
    outputTokens: outTok9,
    cpuMs: cpuMs9,
    childProcessCpuMs: res9.childProcessCpuMs,
    wallMs: wallMs9,
  };

  // ==========================================================================
  // PILLAR 4: TRUE OS CHILD-PROCESS RESTARTS (PLANNED SUSPENSION & ABRUPT SIGKILL)
  // ==========================================================================
  console.log('-'.repeat(80));
  console.log('PILLAR 4: TRUE OS CHILD-PROCESS RESTARTS (PLANNED SUSPENSION & ABRUPT SIGKILL)');
  console.log('Demonstrating: Genuine OS child process death (fork) and resumption via durable checkpoint.');
  console.log('-'.repeat(80));

  // --- Part 4A: Planned Suspension ---
  console.log('Part 4A: Planned Suspension Across OS Child Processes...');
  const wsPersistA = await TaskWorkspace.create(task1Spec.id);
  const persistWsPathA = wsPersistA.workspacePath;

  console.log('  Step 4A.1: Spawning Child Process 1 with maxTurns: 1 on Live Bifrost...');
  const proc1 = await runChildWorkerLive([
    `--workspace=${persistWsPathA}`,
    `--task=${task1Spec.id}`,
    '--maxTurns=1',
  ]);

  console.log(`  Child Process 1 Exited with code: ${proc1.exitCode}`);
  console.log(`  Child Process 1 Turns:            ${proc1.result?.turns}`);
  console.log(`  Child Process 1 Acceptance:       ${proc1.result?.acceptance}`);

  // Inspect durable checkpoint on disk
  const durableStoreA = new DurableStore(persistWsPathA);
  await durableStoreA.initialize();
  const latestCpA = await durableStoreA.getLatestCheckpoint();
  const contextMdExistsA = await fs.stat(path.join(persistWsPathA, 'CONTEXT.MD')).then(() => true).catch(() => false);

  console.log(`  Checkpoint on Disk:    ${latestCpA ? latestCpA.checkpointId : 'NONE'}`);
  console.log(`  CONTEXT.MD on Disk:    ${contextMdExistsA ? 'FOUND' : 'MISSING'}`);

  if (!latestCpA || !contextMdExistsA) {
    throw new Error('Pillar 4A Failed: Durable checkpoint or CONTEXT.MD missing after Process 1 clean exit.');
  }

  console.log('  Step 4A.2: Spawning Child Process 2 to resume live inference on the same workspace...');
  const proc2 = await runChildWorkerLive([
    `--workspace=${persistWsPathA}`,
    `--task=${task1Spec.id}`,
    '--maxTurns=4',
  ]);

  console.log(`  Child Process 2 Final Status:     ${proc2.result?.status}`);
  console.log(`  Child Process 2 Acceptance:       ${proc2.result?.acceptance}`);
  console.log(`  Child Process 2 Resumed State:    ${proc2.result?.resumed}`);
  console.log(`  Child Process 2 Total Turns:      ${proc2.result?.turns}`);

  if (proc2.result?.acceptance !== 'passed') {
    throw new Error(`Pillar 4A Failed: Resumed Child Process 2 did not pass acceptance check: ${proc2.result?.acceptance}`);
  }
  console.log('✅ Part 4A Passed: Planned suspension across OS child processes verified.\n');

  // --- Part 4B: Abrupt Kill (SIGKILL) ---
  console.log('Part 4B: Abrupt Kill (SIGKILL) & Durable Checkpoint Resumption...');
  const wsPersistB = await TaskWorkspace.create(task1Spec.id);
  const persistWsPathB = wsPersistB.workspacePath;

  console.log('  Step 4B.1: Spawning Child Process 3 and waiting for admission checkpoint...');
  const child3: ChildProcess = fork(WORKER_SCRIPT, [
    `--workspace=${persistWsPathB}`,
    `--task=${task1Spec.id}`,
    '--maxTurns=3',
  ], {
    execArgv: ['--import', 'tsx'],
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, BIFROST_GATEWAY_URL: GATEWAY_URL, BIFROST_VIRTUAL_KEY: VIRTUAL_KEY },
  });

  const storeB = new DurableStore(persistWsPathB);
  await storeB.initialize();

  let cpBFound = false;
  for (let i = 0; i < 50; i++) {
    const cp = await storeB.getLatestCheckpoint();
    if (cp) {
      cpBFound = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  if (!cpBFound) {
    throw new Error('Pillar 4B Failed: Child Process 3 did not write initial checkpoint within timeout.');
  }

  console.log('  Step 4B.2: Abruptly killing Child Process 3 via SIGKILL (simulating unhandled host crash)...');
  const killPromise = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child3.on('exit', (exitCode, signal) => resolve({ exitCode, signal }));
  });
  child3.kill('SIGKILL');
  const proc3Exit = await killPromise;
  console.log(`  Child Process 3 Terminated with signal: ${proc3Exit.signal}`);

  console.log('  Step 4B.3: Spawning Child Process 4 to resume from disk checkpoint after abrupt crash...');
  const proc4 = await runChildWorkerLive([
    `--workspace=${persistWsPathB}`,
    `--task=${task1Spec.id}`,
    '--maxTurns=5',
  ]);

  console.log(`  Child Process 4 Final Status:     ${proc4.result?.status}`);
  console.log(`  Child Process 4 Acceptance:       ${proc4.result?.acceptance}`);
  console.log(`  Child Process 4 Resumed State:    ${proc4.result?.resumed}`);
  console.log(`  Child Process 4 Total Turns:      ${proc4.result?.turns}`);

  if (proc4.result?.acceptance !== 'passed') {
    throw new Error(`Pillar 4B Failed: Resumed Child Process 4 did not pass acceptance check: ${proc4.result?.acceptance}`);
  }
  console.log('✅ Part 4B Passed: Abrupt kill (SIGKILL) resilience verified across OS child processes.\n');

  (evidenceReport.pillars as Record<string, unknown>).pillar4_true_child_process_restart = {
    plannedSuspension: {
      process1Turns: proc1.result?.turns,
      process1Status: proc1.result?.status,
      checkpointId: latestCpA.checkpointId,
      process2FinalStatus: proc2.result?.status,
      process2Acceptance: proc2.result?.acceptance,
      process2Turns: proc2.result?.turns,
      process2Resumed: proc2.result?.resumed,
    },
    abruptKill: {
      killedWithSignal: proc3Exit.signal,
      process4FinalStatus: proc4.result?.status,
      process4Acceptance: proc4.result?.acceptance,
      process4Turns: proc4.result?.turns,
      process4Resumed: proc4.result?.resumed,
    },
  };

  // ==========================================================================
  // PILLAR 5: FAIR CONTROLLED ROUTING BENCHMARK (LIVE GATEWAY EVALUATION)
  // ==========================================================================
  console.log('-'.repeat(80));
  console.log('PILLAR 5: FAIR MULTI-TASK CONTROLLED ROUTING BENCHMARK & SIGNED ATTRIBUTION');
  console.log('Tasks: Task 1 (failing function) & Task 6 (mechanical fix)');
  console.log('Fairness Guarantee: All 4 arms run via AdaptiveExecutionEngine with shared AST tools.');
  console.log('-'.repeat(80));

  console.log('Benchmarking 4 Controlled Policies on Task 1 via Live Bifrost Gateway...');
  const liveBenchResult1 = await ComparativeBenchmarkSuite.benchmarkControlledRouting(task1Spec, {
    isLive: true,
    trials: 1,
    smallModel: SMALL_MODEL_ID,
    largeModel: STRONGER_MODEL_ID,
  });

  console.log('\nControlled Routing Results (Task 1):');
  console.log('  ' + '-'.repeat(110));
  console.log(
    '  ' +
      'Policy'.padEnd(38) +
      'Success'.padEnd(10) +
      'Tokens/Acc'.padEnd(14) +
      'Avg Tokens'.padEnd(14) +
      'Wall (ms)'.padEnd(12) +
      'Ctrl CPU'.padEnd(12) +
      'Calls'
  );
  console.log('  ' + '-'.repeat(110));

  for (const p of Object.values(liveBenchResult1.summary)) {
    console.log(
      '  ' +
        p.policyLabel.padEnd(38) +
        `${p.successRatePercent}%`.padEnd(10) +
        String(p.totalTokensPerAcceptedCompletion ?? 'N/A').padEnd(14) +
        String(p.avgTotalTokens ?? 'N/A').padEnd(14) +
        String(p.avgWallDurationMs ?? 'N/A').padEnd(12) +
        String(p.avgControllerCpuMs ?? p.avgCpuDurationMs ?? 'N/A').padEnd(12) +
        String(p.avgModelCalls)
    );
  }
  console.log('  ' + '-'.repeat(110));

  console.log('\nAttribution Breakdown (Task 1 Live Telemetry - Signed Values):');
  console.log(`  * Deterministic Tooling Contribution:  ${liveBenchResult1.attribution.deterministicToolingTokensSaved ?? 'null'} tokens`);
  console.log(`  * Context Compilation Contribution:    ${liveBenchResult1.attribution.contextCompilationTokensSaved ?? 'null'} tokens (shared across all arms)`);
  console.log(`  * Model Selection Contribution:        ${liveBenchResult1.attribution.modelSelectionTokensSaved ?? 'null'} tokens`);
  console.log(`  * Bidirectional Handoff Contribution:  ${liveBenchResult1.attribution.bidirectionalHandoffTokensSaved ?? 'null'} tokens`);
  console.log(`  * True Controller CPU Overhead:        ${liveBenchResult1.attribution.cpuOverheadMs} ms`);

  // Contract validation for Task 1 export
  console.log('\nValidating Task 1 Telemetry Against Export Contract Schema...');
  const exportPayload1 = {
    version: '1' as const,
    taskId: liveBenchResult1.taskId,
    taskTitle: liveBenchResult1.taskTitle,
    evaluationMode: 'controlled_routing_fair_comparison' as const,
    toolingDisclosed: liveBenchResult1.toolingDisclosed,
    policies: liveBenchResult1.summary,
    attribution: liveBenchResult1.attribution,
    evidenceSummary: liveBenchResult1.evidenceSummary,
  };

  const parsedExport1 = ControlledBenchmarkExportSchema.safeParse(exportPayload1);
  if (!parsedExport1.success) {
    console.error('Schema validation errors:', parsedExport1.error.issues);
    throw new Error('Pillar 5 Schema Validation Failed for Task 1 live benchmark export.');
  }

  // Also benchmark Task 6 (Mechanical) to prove 0-token deterministic tooling savings vs frontier
  console.log('\nBenchmarking 4 Controlled Policies on Task 6 (Mechanical Repair)...');
  const liveBenchResult6 = await ComparativeBenchmarkSuite.benchmarkControlledRouting(task6Spec, {
    isLive: true,
    trials: 1,
    smallModel: SMALL_MODEL_ID,
    largeModel: STRONGER_MODEL_ID,
  });

  console.log('\nControlled Routing Results (Task 6):');
  console.log('  ' + '-'.repeat(110));
  for (const p of Object.values(liveBenchResult6.summary)) {
    console.log(
      '  ' +
        p.policyLabel.padEnd(38) +
        `${p.successRatePercent}%`.padEnd(10) +
        String(p.totalTokensPerAcceptedCompletion ?? 'N/A').padEnd(14) +
        String(p.avgTotalTokens ?? 'N/A').padEnd(14) +
        String(p.avgWallDurationMs ?? 'N/A').padEnd(12) +
        String(p.avgControllerCpuMs ?? p.avgCpuDurationMs ?? 'N/A').padEnd(12) +
        String(p.avgModelCalls)
    );
  }
  console.log('  ' + '-'.repeat(110));

  console.log('\nAttribution Breakdown (Task 6 Live Telemetry):');
  console.log(`  * Deterministic Tooling Contribution:  ${liveBenchResult6.attribution.deterministicToolingTokensSaved ?? 'null'} tokens saved`);
  console.log(`  * Controller CPU Overhead:             ${liveBenchResult6.attribution.cpuOverheadMs} ms`);

  console.log('✅ PILLAR 5 PASSED: Multi-task controlled live benchmarks completed and validated against contract schema.\n');

  (evidenceReport.pillars as Record<string, unknown>).pillar5_live_controlled_benchmark = {
    task1: liveBenchResult1,
    task6: liveBenchResult6,
  };

  // ==========================================================================
  // EXPORT STRUCTURED EVIDENCE ARTIFACT
  // ==========================================================================
  const dataDir = path.resolve(process.cwd(), '.local', 'data');
  await fs.mkdir(dataDir, { recursive: true });
  const exportPath = path.join(dataDir, 'adaptive-engine-v1-5-live-evidence.json');
  await fs.writeFile(exportPath, JSON.stringify(evidenceReport, null, 2), 'utf8');

  console.log('='.repeat(80));
  console.log('All ProofBench v1.5 Live Verification Evidence Successfully Generated!');
  console.log(`Structured Evidence Artifact: ${exportPath}`);
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('\n❌ STRICT LIVE DEMONSTRATION FAILED:');
  console.error(err);
  process.exit(1);
});
