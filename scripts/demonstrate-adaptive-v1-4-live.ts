/**
 * ProofBench Adaptive Execution Engine v1.4 — Strict Live Multi-Model Execution & Evidence Suite
 *
 * REQUIREMENTS & INTEGRITY GUARANTEES:
 * 1. Strict Live Preconditions: Connects to the stock Maxim Bifrost gateway (http://127.0.0.1:8089).
 * 2. Real Model Verification: Authenticates with BIFROST_VIRTUAL_KEY and verifies availability of
 *    both local models: Qwen 1.5B (SMALL_LLM) and Qwen 9B (STRONGER_LLM).
 * 3. Zero Mock Gateway / Zero Prewritten Code: Every model response, patch, token count, and latency
 *    value is produced live by the gateway and local inference servers. No synthetic fallback.
 * 4. Honest Empirical Reporting: All transitions, passes, failures, and tokens are measured and reported
 *    without cherry-picking or forced success.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
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
      'v1.4 strict live mode prohibits simulation fallbacks. Please configure a valid Bifrost virtual key.'
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
  const taskPath = path.join(tasksDir, taskId, 'task.json');
  const raw = await fs.readFile(taskPath, 'utf8');
  return TaskSpec.parse(JSON.parse(raw));
}

async function main() {
  console.log('='.repeat(80));
  console.log('ProofBench — Adaptive Execution Engine v1.4 Strict Live Demonstration Suite');
  console.log('MODE: STRICT LIVE MULTI-MODEL INFERENCE (ZERO SIMULATION / ZERO MOCKS)');
  console.log(`Bifrost Gateway:        ${GATEWAY_URL}`);
  console.log(`Small Coding Model:     ${SMALL_MODEL_ID}`);
  console.log(`Stronger Model:         ${STRONGER_MODEL_ID}`);
  console.log(`Process ID:             ${process.pid}`);
  console.log(`Node.js Version:        ${process.version} (${process.platform} ${process.arch})`);
  console.log('='.repeat(80));

  console.log('\n[PREFLIGHT] Verifying Live Bifrost Gateway & Active Local Models...');
  const preflight = await verifyLiveGatewayPreflight();
  console.log(`  Gateway Status:        ONLINE (${preflight.gatewayStatus}, latency: ${preflight.latencyMs}ms)`);
  console.log(`  Virtual Key:           AUTHENTICATED (.env)`);
  console.log(`  Small Model Online:    VERIFIED (${SMALL_MODEL_ID})`);
  console.log(`  Stronger Model Online: VERIFIED (${STRONGER_MODEL_ID})`);
  console.log('  Models Listed:        ', preflight.modelsFound.join(', '));
  console.log('✅ PREFLIGHT PASSED: Strict live requirements fully satisfied.\n');

  const tasksDir = getCodingTasksDir();
  const liveClient = new BifrostClient({
    mode: 'live',
    gatewayUrl: GATEWAY_URL,
    virtualKey: VIRTUAL_KEY,
    userBudgetLimitUsd: 15.0,
  });

  const evidenceReport: Record<string, unknown> = {
    version: '1.4.0',
    mode: 'strict_live_multi_model_execution',
    timestamp: new Date().toISOString(),
    gatewayUrl: GATEWAY_URL,
    preflight,
    pillars: {},
  };

  // ==========================================================================
  // PILLAR 1: DETERMINISTIC 0-TOKEN NON-LLM RESOLUTION (TASK 6)
  // ==========================================================================
  console.log('-'.repeat(80));
  console.log('PILLAR 1: NON-LLM 0-TOKEN RESOLUTION & REAL CPU USAGE MEASUREMENT');
  console.log('Demonstrating: Compiler-guided mechanical fix applied in NON_LLM tier without model inference.');
  console.log('-'.repeat(80));

  const task6Spec = await loadTask(tasksDir, 'task-6-deterministic-fix');
  const ws6 = await TaskWorkspace.create(task6Spec.id);
  const engine6 = new AdaptiveExecutionEngine({
    bifrostClient: liveClient,
    approvalHandler: createWorkspaceApprovalHandler(),
    maxTurns: 3,
  });

  const startCpu6 = process.cpuUsage();
  const startWall6 = performance.now();
  const res6 = await engine6.runTask(task6Spec, { workspacePath: ws6.workspacePath });
  const cpuDiff6 = process.cpuUsage(startCpu6);
  const cpuMs6 = Math.max(1, Math.round((cpuDiff6.user + cpuDiff6.system) / 1000));
  const wallMs6 = Math.round(performance.now() - startWall6);

  const inTok6 = getUsageValue(res6.run.usage.inputTokens);
  const outTok6 = getUsageValue(res6.run.usage.outputTokens);

  console.log(`[Task 6] ${task6Spec.id} ("${task6Spec.title}")`);
  console.log(`  Status:               ${res6.run.status.toUpperCase()}`);
  console.log(`  Acceptance:           ${res6.run.acceptance.status.toUpperCase()}`);
  console.log(`  Input Tokens:         ${inTok6} (${res6.run.usage.inputTokens.status})`);
  console.log(`  Output Tokens:        ${outTok6} (${res6.run.usage.outputTokens.status})`);
  console.log(`  Avoided Model Calls:  ${res6.avoidedModelRequests}`);
  console.log(`  Deterministic CPU:    ${cpuMs6} ms (via process.cpuUsage())`);
  console.log(`  Wall-Clock Duration:  ${wallMs6} ms`);

  if (res6.run.acceptance.status !== 'passed' || inTok6 !== 0) {
    throw new Error(`Pillar 1 Failed: Expected 0 tokens and passed acceptance for Task 6, got ${res6.run.acceptance.status}`);
  }
  console.log('✅ PILLAR 1 PASSED: Guaranteed non-LLM mechanical resolution achieved at 0 tokens.\n');

  (evidenceReport.pillars as Record<string, unknown>).pillar1_non_llm_zero_tokens = {
    taskId: task6Spec.id,
    passed: res6.run.acceptance.status === 'passed',
    inputTokens: inTok6,
    outputTokens: outTok6,
    avoidedModelCalls: res6.avoidedModelRequests,
    cpuMs: cpuMs6,
    wallMs: wallMs6,
  };

  // ==========================================================================
  // PILLAR 2: LIVE SMALL LLM EXECUTION & NON-LLM ACCEPTANCE (TASK 1)
  // ==========================================================================
  console.log('-'.repeat(80));
  console.log('PILLAR 2: LIVE SMALL LLM INFERENCE VIA BIFROST & NON-LLM ACCEPTANCE');
  console.log(`Demonstrating: Routine single-file task executed live by ${SMALL_MODEL_ID}.`);
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
  const cpuMs1 = Math.max(1, Math.round((cpuDiff1.user + cpuDiff1.system) / 1000));
  const wallMs1 = Math.round(performance.now() - startWall1);
  const inTok1 = getUsageValue(res1.run.usage.inputTokens);
  const outTok1 = getUsageValue(res1.run.usage.outputTokens);

  console.log(`[Task 1] ${task1Spec.id} ("${task1Spec.title}")`);
  console.log(`  Status:               ${res1.run.status.toUpperCase()}`);
  console.log(`  Acceptance:           ${res1.run.acceptance.status.toUpperCase()}`);
  console.log(`  Turns Executed:       ${res1.controllerState.turnCount}`);
  console.log(`  Input Tokens:         ${inTok1} (${res1.run.usage.inputTokens.status})`);
  console.log(`  Output Tokens:        ${outTok1} (${res1.run.usage.outputTokens.status})`);
  console.log(`  Total Tokens:         ${(inTok1 ?? 0) + (outTok1 ?? 0)}`);
  console.log(`  Deterministic CPU:    ${cpuMs1} ms`);
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
    wallMs: wallMs1,
  };

  // ==========================================================================
  // PILLAR 3: LIVE MULTI-MODULE PROJECT TRAJECTORY (TASK 9)
  // ==========================================================================
  console.log('-'.repeat(80));
  console.log('PILLAR 3: LIVE MULTI-MODULE PROJECT TRAJECTORY & NATURAL ROUTING');
  console.log('Task: task-9-bidirectional-event-service (multi-module Rust service)');
  console.log('Exercising: Real model generation, Tree-sitter context compilation, incremental edits.');
  console.log('-'.repeat(80));

  const task9Spec = await loadTask(tasksDir, 'task-9-bidirectional-event-service');
  const ws9 = await TaskWorkspace.create(task9Spec.id);
  const engine9 = new AdaptiveExecutionEngine({
    bifrostClient: liveClient,
    approvalHandler: createWorkspaceApprovalHandler(),
    maxTurns: 3,
  });

  const startCpu9 = process.cpuUsage();
  const startWall9 = performance.now();
  const res9 = await engine9.runTask(task9Spec, { workspacePath: ws9.workspacePath });
  const cpuDiff9 = process.cpuUsage(startCpu9);
  const cpuMs9 = Math.max(1, Math.round((cpuDiff9.user + cpuDiff9.system) / 1000));
  const wallMs9 = Math.round(performance.now() - startWall9);
  const inTok9 = getUsageValue(res9.run.usage.inputTokens);
  const outTok9 = getUsageValue(res9.run.usage.outputTokens);

  console.log(`[Task 9] ${task9Spec.id} ("${task9Spec.title}")`);
  console.log(`  Final Status:         ${res9.run.status.toUpperCase()}`);
  console.log(`  Acceptance:           ${res9.run.acceptance.status.toUpperCase()}`);
  console.log(`  Turns Executed:       ${res9.controllerState.turnCount}`);
  console.log(`  Input Tokens:         ${inTok9 ?? 'missing'}`);
  console.log(`  Output Tokens:        ${outTok9 ?? 'missing'}`);
  console.log(`  Transitions Recorded: ${res9.controllerState.transitions.length}`);
  for (const t of res9.controllerState.transitions) {
    console.log(`    - ${t.fromTier} ➔ ${t.toTier}: ${t.reason.slice(0, 80)}...`);
  }
  console.log(`  Deterministic CPU:    ${cpuMs9} ms`);
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
    wallMs: wallMs9,
  };

  // ==========================================================================
  // PILLAR 4: LIVE INTERRUPTION & RESUMPTION ACROSS PROCESS BOUNDARY
  // ==========================================================================
  console.log('-'.repeat(80));
  console.log('PILLAR 4: LIVE PROCESS INTERRUPTION & RESUMPTION WITHOUT MOCK HANDLERS');
  console.log('Demonstrating: Engine 1 halted at turn 1; Engine 2 resumes on disk checkpoint using live Bifrost.');
  console.log('-'.repeat(80));

  const wsPersist = await TaskWorkspace.create(task1Spec.id);
  const persistWsPath = wsPersist.workspacePath;

  console.log('Step 4A: Running Controller Instance 1 with maxTurns: 1...');
  const engineInst1 = new AdaptiveExecutionEngine({
    bifrostClient: liveClient,
    approvalHandler: createWorkspaceApprovalHandler(),
    maxTurns: 1,
  });
  const resPersist1 = await engineInst1.runTask(task1Spec, { workspacePath: persistWsPath });

  console.log(`  Instance 1 Status:     ${resPersist1.controllerState.status.toUpperCase()}`);
  console.log(`  Instance 1 Turn Count: ${resPersist1.controllerState.turnCount}`);

  // Inspect durable checkpoint on disk
  const durableStore = new DurableStore(persistWsPath);
  await durableStore.initialize();
  const latestCheckpoint = await durableStore.getLatestCheckpoint();
  const contextMdExists = await fs.stat(path.join(persistWsPath, 'CONTEXT.MD')).then(() => true).catch(() => false);

  console.log(`  Checkpoint on Disk:    ${latestCheckpoint ? latestCheckpoint.checkpointId : 'NONE'}`);
  console.log(`  CONTEXT.MD on Disk:    ${contextMdExists ? 'FOUND' : 'MISSING'}`);

  if (!latestCheckpoint || !contextMdExists) {
    throw new Error('Pillar 4 Failed: Durable checkpoint or CONTEXT.MD missing after Instance 1 halt.');
  }

  console.log('\nStep 4B: Spawning fresh Controller Instance 2 in the same workspace directory...');
  const engineInst2 = new AdaptiveExecutionEngine({
    bifrostClient: liveClient,
    approvalHandler: createWorkspaceApprovalHandler(),
    maxTurns: 3,
  });
  const resPersist2 = await engineInst2.runTask(task1Spec, { workspacePath: persistWsPath });

  console.log(`  Instance 2 Final Status: ${resPersist2.run.status.toUpperCase()}`);
  console.log(`  Instance 2 Acceptance:   ${resPersist2.run.acceptance.status.toUpperCase()}`);
  console.log(`  Total Turns (Resumed):   ${resPersist2.controllerState.turnCount}`);

  if (resPersist2.run.acceptance.status !== 'passed') {
    throw new Error(`Pillar 4 Failed: Resumed Instance 2 did not pass acceptance check: ${resPersist2.run.acceptance.status}`);
  }
  console.log('✅ PILLAR 4 PASSED: Interrupted live execution resumed seamlessly from durable checkpoint.\n');

  (evidenceReport.pillars as Record<string, unknown>).pillar4_live_checkpoint_resumption = {
    taskId: task1Spec.id,
    instance1Turns: resPersist1.controllerState.turnCount,
    instance1Status: resPersist1.controllerState.status,
    checkpointId: latestCheckpoint.checkpointId,
    instance2FinalStatus: resPersist2.run.status,
    instance2Acceptance: resPersist2.run.acceptance.status,
    instance2TotalTurns: resPersist2.controllerState.turnCount,
  };

  // ==========================================================================
  // PILLAR 5: FAIR CONTROLLED ROUTING BENCHMARK (LIVE GATEWAY EVALUATION)
  // ==========================================================================
  console.log('-'.repeat(80));
  console.log('PILLAR 5: FAIR CONTROLLED ROUTING BENCHMARK (LIVE BIFROST GATEWAY)');
  console.log('Task: task-1-fix-failing-func');
  console.log('Fairness Guarantee: All 4 arms run via AdaptiveExecutionEngine with shared AST tools.');
  console.log('-'.repeat(80));

  console.log('Benchmarking 4 Controlled Policies on Task 1 via Live Bifrost Gateway...');
  const liveBenchResult = await ComparativeBenchmarkSuite.benchmarkControlledRouting(task1Spec, {
    isLive: true,
    trials: 1,
    smallModel: SMALL_MODEL_ID,
    largeModel: STRONGER_MODEL_ID,
  });

  console.log('\nControlled Routing Results:');
  console.log('  ' + '-'.repeat(105));
  console.log(
    '  ' +
      'Policy'.padEnd(38) +
      'Success'.padEnd(10) +
      'Tokens/Acc'.padEnd(14) +
      'Avg Tokens'.padEnd(14) +
      'Wall (ms)'.padEnd(12) +
      'CPU (ms)'.padEnd(12) +
      'Calls'
  );
  console.log('  ' + '-'.repeat(105));

  for (const p of Object.values(liveBenchResult.summary)) {
    console.log(
      '  ' +
        p.policyLabel.padEnd(38) +
        `${p.successRatePercent}%`.padEnd(10) +
        String(p.totalTokensPerAcceptedCompletion ?? 'N/A').padEnd(14) +
        String(p.avgTotalTokens ?? 'N/A').padEnd(14) +
        String(p.avgWallDurationMs ?? 'N/A').padEnd(12) +
        String(p.avgCpuDurationMs ?? 'N/A').padEnd(12) +
        String(p.avgModelCalls)
    );
  }
  console.log('  ' + '-'.repeat(105));

  console.log('\nAttribution Breakdown (Strictly Measured from Live Telemetry):');
  console.log(`  * Deterministic Tooling Contribution:  ${liveBenchResult.attribution.deterministicToolingTokensSaved ?? 'null'} tokens`);
  console.log(`  * Context Compilation Contribution:    ${liveBenchResult.attribution.contextCompilationTokensSaved ?? 'null'} tokens (shared across all arms)`);
  console.log(`  * Model Selection Contribution:        ${liveBenchResult.attribution.modelSelectionTokensSaved ?? 'null'} tokens`);
  console.log(`  * Bidirectional Handoff Contribution:  ${liveBenchResult.attribution.bidirectionalHandoffTokensSaved ?? 'null'} tokens`);
  console.log(`  * True Deterministic CPU Overhead:     ${liveBenchResult.attribution.cpuOverheadMs} ms`);

  // Contract validation
  console.log('\nValidating Live Benchmark Telemetry Against Export Contract Schema...');
  const exportPayload = {
    version: '1' as const,
    taskId: liveBenchResult.taskId,
    taskTitle: liveBenchResult.taskTitle,
    evaluationMode: 'controlled_routing_fair_comparison' as const,
    toolingDisclosed: liveBenchResult.toolingDisclosed,
    policies: liveBenchResult.summary,
    attribution: liveBenchResult.attribution,
    evidenceSummary: liveBenchResult.evidenceSummary,
  };

  const parsedExport = ControlledBenchmarkExportSchema.safeParse(exportPayload);
  if (!parsedExport.success) {
    console.error('Schema validation errors:', parsedExport.error.issues);
    throw new Error('Pillar 5 Schema Validation Failed for live benchmark export.');
  }
  console.log('✅ PILLAR 5 PASSED: Controlled live benchmark completed and validated against contract schema.\n');

  (evidenceReport.pillars as Record<string, unknown>).pillar5_live_controlled_benchmark = liveBenchResult;

  // ==========================================================================
  // EXPORT STRUCTURED EVIDENCE ARTIFACT
  // ==========================================================================
  const dataDir = path.resolve(process.cwd(), '.local', 'data');
  await fs.mkdir(dataDir, { recursive: true });
  const exportPath = path.join(dataDir, 'adaptive-engine-v1-4-live-evidence.json');
  await fs.writeFile(exportPath, JSON.stringify(evidenceReport, null, 2), 'utf8');

  console.log('='.repeat(80));
  console.log('All ProofBench v1.4 Live Verification Evidence Successfully Generated!');
  console.log(`Structured Evidence Artifact: ${exportPath}`);
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('\n❌ STRICT LIVE DEMONSTRATION FAILED:');
  console.error(err);
  process.exit(1);
});
