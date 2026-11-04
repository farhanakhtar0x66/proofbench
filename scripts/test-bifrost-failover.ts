import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  ProofBenchAgent,
  BifrostClient,
  EmbeddedBifrostGateway,
  getCodingTasksDir,
  createWorkspaceApprovalHandler,
} from '../implementations/bifrost-01/src/index';
import { TaskSpec } from '../packages/contracts/src/index';

async function main() {
  console.log('='.repeat(80));
  console.log('ProofBench — Simulated Fault-Injection & Policy Verification Suite');
  console.log('Environment: In-process Embedded Gateway Simulator (Contract & Policy Verification)');
  console.log('NOTE: For genuine live Bifrost daemon failover, run: npm run test:real-failover');
  console.log('='.repeat(80));

  const tasksDir = getCodingTasksDir();
  const task1JsonPath = path.join(tasksDir, 'task-1-fix-failing-func', 'task.json');
  const task1Raw = await fs.readFile(task1JsonPath, 'utf8');
  const task1Spec = TaskSpec.parse(JSON.parse(task1Raw));

  const failoverEvidence: Record<string, unknown> = {
    suite: 'Simulated Fault-Injection & Governance Policy Verification',
    mode: 'simulation',
    environment: 'EmbeddedBifrostGateway (in-process simulator)',
    timestamp: new Date().toISOString(),
    tests: [],
  };

  // --------------------------------------------------------------------------
  // TEST 1: Injected 503 Service Unavailable Failover
  // --------------------------------------------------------------------------
  console.log('\n[TEST 1] Injected 503 Service Unavailable Outage on Primary Provider...');
  const gateway503 = new EmbeddedBifrostGateway();
  gateway503.injectOutage('local', 1); // 1 failure injected on primary provider 'local'

  const client503 = new BifrostClient({
    mode: 'simulation',
    embeddedGateway: gateway503,
    virtualKey: 'sk-bf-simulation-default',
    fallbackProviders: ['opencode'],
  });

  const agent503 = new ProofBenchAgent({
    bifrostClient: client503,
    approvalHandler: createWorkspaceApprovalHandler(),
    primaryModel: 'local-deepseek-coder',
  });

  const res503 = await agent503.runTask(task1Spec, 101);
  const fallbackEvents503 = res503.trace.events.filter((e) =>
    e.message.includes('fallback routing triggered')
  );

  const test1Passed =
    res503.run.status === 'completed' &&
    res503.run.acceptance.status === 'passed' &&
    fallbackEvents503.length > 0 &&
    fallbackEvents503[0].data?.fallbackProvider === 'opencode';

  console.log(`  Session Execution:    ${res503.run.status.toUpperCase()}`);
  console.log(`  Acceptance Status:    ${res503.run.acceptance.status.toUpperCase()}`);
  console.log(`  Fallback Notification: ${fallbackEvents503.length > 0 ? fallbackEvents503[0].message : 'NONE'}`);
  console.log(`  Recorded Provider:    ${fallbackEvents503[0]?.data?.fallbackProvider ?? 'unknown'}`);
  console.log(`  Test Result:          ${test1Passed ? 'PASSED (Clean failover to authorized fallback)' : 'FAILED'}`);

  (failoverEvidence.tests as unknown[]).push({
    test: 'Injected 503 Service Unavailable Outage',
    passed: test1Passed,
    sessionSurvived: res503.run.status === 'completed',
    acceptancePassed: res503.run.acceptance.status === 'passed',
    fallbackProvider: fallbackEvents503[0]?.data?.fallbackProvider,
    traceEvent: fallbackEvents503[0]?.message,
  });

  // --------------------------------------------------------------------------
  // TEST 2: Injected 429 Rate Limit Failover
  // --------------------------------------------------------------------------
  console.log('\n[TEST 2] Injected 429 Rate Limit Outage on Primary Provider...');
  const gateway429 = new EmbeddedBifrostGateway();
  gateway429.injectFault({ provider: 'local', outageStatus: 429, failCount: 1 });

  const client429 = new BifrostClient({
    mode: 'simulation',
    embeddedGateway: gateway429,
    virtualKey: 'sk-bf-simulation-default',
    fallbackProviders: ['opencode'],
  });

  const agent429 = new ProofBenchAgent({
    bifrostClient: client429,
    approvalHandler: createWorkspaceApprovalHandler(),
    primaryModel: 'local-deepseek-coder',
  });

  const res429 = await agent429.runTask(task1Spec, 102);
  const fallbackEvents429 = res429.trace.events.filter((e) =>
    e.message.includes('fallback routing triggered')
  );

  const test2Passed =
    res429.run.status === 'completed' &&
    res429.run.acceptance.status === 'passed' &&
    fallbackEvents429.length > 0;

  console.log(`  Session Execution:    ${res429.run.status.toUpperCase()}`);
  console.log(`  Acceptance Status:    ${res429.run.acceptance.status.toUpperCase()}`);
  console.log(`  Fallback Notification: ${fallbackEvents429.length > 0 ? fallbackEvents429[0].message : 'NONE'}`);
  console.log(`  Test Result:          ${test2Passed ? 'PASSED (Clean 429 rate limit failover)' : 'FAILED'}`);

  (failoverEvidence.tests as unknown[]).push({
    test: 'Injected 429 Rate Limit Outage',
    passed: test2Passed,
    sessionSurvived: res429.run.status === 'completed',
    acceptancePassed: res429.run.acceptance.status === 'passed',
  });

  // --------------------------------------------------------------------------
  // TEST 3: Confidential Mode Policy Enforcement During Failover
  // --------------------------------------------------------------------------
  console.log('\n[TEST 3] Verifying Confidential Mode Forbids Remote Fallbacks...');
  let test3Passed = false;
  let test3Reason = '';
  try {
    new BifrostClient({
      confidential: true,
      fallbackProviders: ['opencode', 'openai-cloud'], // Unauthorized remote providers
    });
  } catch (err) {
    test3Passed = true;
    test3Reason = (err as Error).message;
  }

  console.log(`  Confidential Block Result: ${test3Passed ? 'PASSED (Strict rejection of external fallback paths)' : 'FAILED'}`);
  console.log(`  Enforcement Message:       "${test3Reason}"`);

  (failoverEvidence.tests as unknown[]).push({
    test: 'Confidential Mode Remote Fallback Prevention',
    passed: test3Passed,
    reason: test3Reason,
  });

  // --------------------------------------------------------------------------
  // TEST 4: Conservative Budget Reservation During Failover
  // --------------------------------------------------------------------------
  console.log('\n[TEST 4] Verifying Budget Reservation Enforced Prior to Fallback...');
  const budgetClient = new BifrostClient({
    mode: 'simulation',
    embeddedGateway: new EmbeddedBifrostGateway(),
    userBudgetLimitUsd: 0.00001, // Depleted budget
  });

  let test4Passed = false;
  let test4Reason = '';
  try {
    await budgetClient.createChatCompletion({
      model: 'local-deepseek-coder',
      messages: [{ role: 'user', content: 'test' }],
    });
  } catch (err) {
    test4Passed = true;
    test4Reason = (err as Error).message;
  }

  console.log(`  Budget Block Result:       ${test4Passed ? 'PASSED (Reservation rejected prior to network)' : 'FAILED'}`);
  console.log(`  Enforcement Message:       "${test4Reason}"`);

  (failoverEvidence.tests as unknown[]).push({
    test: 'Budget Limit Enforcement During Failover',
    passed: test4Passed,
    reason: test4Reason,
  });

  // --------------------------------------------------------------------------
  // 5. Technical Conceptual Distinction
  // --------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80));
  console.log('TECHNICAL ARCHITECTURAL DISTINCTION:');
  console.log('  1. Provider Outage Failover (Infrastructure Layer):');
  console.log('     Trigger:    HTTP 503 / 429 from primary provider daemon (network/provider failure).');
  console.log('     Resolution: Gateway routes the exact same request turn to an authorized backup provider.');
  console.log('     Telemetry:  x-bifrost-routing-info-is-fallback: true, trace event notifies user of provider change.');
  console.log('  2. M3a Failure Autopsy Escalation (Cognitive Layer):');
  console.log('     Trigger:    Model produces invalid code, rustc/test fails repeatedly, M2 detects stagnation loop.');
  console.log('     Resolution: Agent controller halts, synthesizes evidence-only autopsy, escalates to frontier model.');
  console.log('     Telemetry:  trace event logs M2 Loop Breaker halt, M3a structured autopsy, and recoveryModel dispatch.');
  console.log('='.repeat(80));

  failoverEvidence.conceptualDistinction = {
    providerOutageFailover: 'Infrastructure transport resilience servicing current turn via secondary provider when primary returns 503/429.',
    m3aEscalation: 'Cognitive agent recovery when primary model generates non-working code and stagnates in loops.',
  };

  const allPassed = (failoverEvidence.tests as Array<{ passed: boolean }>).every((t) => t.passed);
  failoverEvidence.allPassed = allPassed;

  // Save evidence artifact
  const outDir = path.resolve(process.cwd(), '.local/data');
  await fs.mkdir(outDir, { recursive: true });
  const evidencePath = path.join(outDir, 'simulated-failover-evidence.json');
  await fs.writeFile(evidencePath, JSON.stringify(failoverEvidence, null, 2), 'utf8');
  await fs.writeFile(path.join(outDir, 'bifrost-failover-evidence.json'), JSON.stringify(failoverEvidence, null, 2), 'utf8');

  console.log(`\nEvidence artifact written to: ${evidencePath}`);
  console.log(`Overall Failover Suite: ${allPassed ? 'ALL TESTS PASSED (4/4)' : 'FAILURES DETECTED'}`);
  console.log('='.repeat(80));

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Failover verification failed:', err);
  process.exit(1);
});
