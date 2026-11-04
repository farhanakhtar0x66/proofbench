import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ProofBenchAgent,
  BifrostClient,
  EmbeddedBifrostGateway,
  TavilyDocumentationVerifier,
  createDefaultPolicy,
  createScopedPriorApprovalHandler,
  getCodingTasksDir,
} from '../implementations/bifrost-01/src/index';
import { TaskSpec } from '../packages/contracts/src/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  process.loadEnvFile?.();
} catch {
  // Ignore missing .env or node versions without loadEnvFile
}

const GATEWAY_URL = process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089';
const ACTIVE_VIRTUAL_KEY = process.env.BIFROST_VIRTUAL_KEY;
const isLiveRequested = process.argv.includes('--live');
const isSimulationRequested = process.argv.includes('--simulation');

async function checkLiveGateway(): Promise<boolean> {
  if (isSimulationRequested) return false;
  if (isLiveRequested) {
    if (!ACTIVE_VIRTUAL_KEY) throw new Error('--live flag passed but BIFROST_VIRTUAL_KEY is missing');
    return true;
  }
  try {
    const res = await fetch(`${GATEWAY_URL}/health`);
    return res.ok && Boolean(ACTIVE_VIRTUAL_KEY);
  } catch {
    return false;
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('ProofBench — Tavily Freshness & Deprecation Comparative Verification');
  console.log('Scenario: Version-Sensitive API Deprecation (#![deny(deprecated)])');
  console.log('='.repeat(80));

  const isGatewayLive = await checkLiveGateway();
  const gatewayMode = isGatewayLive && !isSimulationRequested ? 'live' : 'simulation';
  const hasTavilyKey = Boolean(process.env.TAVILY_API_KEY);
  const tavilyMode = process.env.TAVILY_MODE === 'live' && hasTavilyKey ? 'live' : 'fixture';

  console.log('\n[RUNTIME CONFIGURATION]');
  console.log(`  Bifrost Gateway Mode:     ${gatewayMode.toUpperCase()} (${gatewayMode === 'live' ? GATEWAY_URL : 'Embedded in-process'})`);
  console.log(`  Tavily Search Mode:       ${tavilyMode.toUpperCase()} (${hasTavilyKey ? 'Live Web Search' : 'Deterministic exact fixture'})`);

  const tasksDir = getCodingTasksDir();
  const taskPath = path.join(tasksDir, 'task-4-version-freshness', 'task.json');
  const taskRaw = await fs.readFile(taskPath, 'utf8');
  const taskSpec = TaskSpec.parse(JSON.parse(taskRaw));

  console.log(`\n[TARGET TASK SPECIFICATION]`);
  console.log(`  Task ID:     ${taskSpec.id}`);
  console.log(`  Title:       ${taskSpec.title}`);
  console.log(`  Prompt:      "${taskSpec.prompt}"`);

  const evidenceReport: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    scenario: 'task-4-version-freshness',
    runtimeMode: gatewayMode,
    tavilyMode,
    claimExtraction: null,
    confidentialityCheck: null,
    trialA_withoutTavily: null,
    trialB_withTavily: null,
    comparativeAnalysis: null,
  };

  // --------------------------------------------------------------------------
  // STEP 1: Direct Claim Extraction and Documentation Verification
  // --------------------------------------------------------------------------
  console.log('\n' + '-'.repeat(80));
  console.log('STEP 1: Claim Extraction & Documentation Verification');
  console.log('-'.repeat(80));

  const standardPolicy = createDefaultPolicy({ confidential: false });
  const verificationResult = await TavilyDocumentationVerifier.verifyCodePlanClaims(taskSpec.prompt, standardPolicy);

  console.log(`  Claims Extracted Count:   ${verificationResult.claimsVerified.length}`);
  for (const claim of verificationResult.claimsVerified) {
    console.log(`  Extracted Claim:        "${claim.claimText}"`);
    console.log(`  Outcome:                ${claim.outcome.toUpperCase()}`);
    console.log(`  Freshness:              ${claim.freshness.toUpperCase()}`);
    console.log(`  Uncertainty Note:       "${claim.uncertainty || 'None'}"`);
    for (const source of claim.sources) {
      console.log(`  Source Title:           ${source.title}`);
      console.log(`  Source URL:             ${source.url}`);
      console.log(`  Recorded Date:          ${source.recordedAt || 'N/A'}`);
      console.log(`  Excerpt:                "${source.excerpt}"`);
    }
  }

  evidenceReport.claimExtraction = {
    claimsVerified: verificationResult.claimsVerified,
    injectedContext: verificationResult.injectedContext,
  };

  // --------------------------------------------------------------------------
  // STEP 2: Confidentiality Mode Verification (Adversarial Data Exfiltration Prevention)
  // --------------------------------------------------------------------------
  console.log('\n' + '-'.repeat(80));
  console.log('STEP 2: Confidentiality Enforcement (IP & Code Privacy)');
  console.log('-'.repeat(80));

  const confidentialPolicy = createDefaultPolicy({ confidential: true });
  const confidentialResult = await TavilyDocumentationVerifier.verifyCodePlanClaims(taskSpec.prompt, confidentialPolicy);

  console.log(`  Confidential Query Allowed: ${confidentialResult.allowed ? 'YES (UNSAFE)' : 'NO (BLOCKED BY POLICY)'}`);
  console.log(`  Enforcement Reason:         "${confidentialResult.reason}"`);

  if (confidentialResult.allowed) {
    throw new Error('Confidential policy failed: external documentation query was not blocked!');
  }

  evidenceReport.confidentialityCheck = {
    allowed: confidentialResult.allowed,
    reason: confidentialResult.reason,
    passed: !confidentialResult.allowed,
  };

  // Helper function to build a Bifrost client
  function buildClient(): BifrostClient {
    if (gatewayMode === 'live' && ACTIVE_VIRTUAL_KEY) {
      return new BifrostClient({
        mode: 'live',
        gatewayUrl: GATEWAY_URL,
        virtualKey: ACTIVE_VIRTUAL_KEY,
        timeoutMs: 30_000,
      });
    }
    const embeddedGateway = new EmbeddedBifrostGateway();
    return new BifrostClient({
      mode: 'simulation',
      embeddedGateway,
      userBudgetLimitUsd: 1.0,
    });
  }

  const approvalHandler = createScopedPriorApprovalHandler({
    allowedFiles: ['src/lib.rs'],
    maxWritesPerFile: 5,
    maxTotalModifications: 5,
  });

  // --------------------------------------------------------------------------
  // STEP 3: Trial A — Governed Agent Execution WITHOUT Tavily
  // --------------------------------------------------------------------------
  console.log('\n' + '-'.repeat(80));
  console.log('STEP 3: Trial A — Agent Execution WITHOUT Tavily Documentation Verification');
  console.log('-'.repeat(80));

  const clientA = buildClient();
  const agentA = new ProofBenchAgent({
    bifrostClient: clientA,
    approvalHandler,
    enableM1ContextBounding: true,
    enableM2StagnationBreaker: true,
    enableM3aAutopsyEscalation: false,
    enableTavilyDocumentation: false, // EXPLICITLY DISABLED
  });

  console.log('  Running Trial A on frozen task...');
  const resultA = await agentA.runTask(taskSpec, 42);
  const turnsA = resultA.trace.events.filter((e) => e.type === 'output' && e.message.includes('Dispatching')).length;
  const inValA = (resultA.run.usage.inputTokens.status === 'known' || resultA.run.usage.inputTokens.status === 'estimated')
    ? resultA.run.usage.inputTokens.value : null;
  const outValA = (resultA.run.usage.outputTokens.status === 'known' || resultA.run.usage.outputTokens.status === 'estimated')
    ? resultA.run.usage.outputTokens.value : null;

  console.log(`  Trial A Status:             ${resultA.run.status.toUpperCase()}`);
  console.log(`  Trial A Acceptance:         ${resultA.run.acceptance.status.toUpperCase()}`);
  console.log(`  Trial A Turns:              ${turnsA}`);
  console.log(`  Trial A Input Tokens:       ${inValA ?? 'N/A'}`);
  console.log(`  Trial A Output Tokens:      ${outValA ?? 'N/A'}`);

  evidenceReport.trialA_withoutTavily = {
    status: resultA.run.status,
    acceptance: resultA.run.acceptance,
    turns: turnsA,
    inputTokens: inValA,
    outputTokens: outValA,
    output: resultA.run.output,
  };

  // --------------------------------------------------------------------------
  // STEP 4: Trial B — Governed Agent Execution WITH Tavily
  // --------------------------------------------------------------------------
  console.log('\n' + '-'.repeat(80));
  console.log('STEP 4: Trial B — Agent Execution WITH Tavily Documentation Verification');
  console.log('-'.repeat(80));

  const clientB = buildClient();
  const agentB = new ProofBenchAgent({
    bifrostClient: clientB,
    approvalHandler,
    enableM1ContextBounding: true,
    enableM2StagnationBreaker: true,
    enableM3aAutopsyEscalation: false,
    enableTavilyDocumentation: true, // EXPLICITLY ENABLED
  });

  console.log('  Running Trial B on frozen task...');
  const resultB = await agentB.runTask(taskSpec, 42);
  const turnsB = resultB.trace.events.filter((e) => e.type === 'output' && e.message.includes('Dispatching')).length;
  const inValB = (resultB.run.usage.inputTokens.status === 'known' || resultB.run.usage.inputTokens.status === 'estimated')
    ? resultB.run.usage.inputTokens.value : null;
  const outValB = (resultB.run.usage.outputTokens.status === 'known' || resultB.run.usage.outputTokens.status === 'estimated')
    ? resultB.run.usage.outputTokens.value : null;

  const tavilyEventsB = resultB.trace.events.filter(
    (e) => e.type === 'output' && e.message.includes('Tavily documentation')
  );

  console.log(`  Trial B Status:             ${resultB.run.status.toUpperCase()}`);
  console.log(`  Trial B Acceptance:         ${resultB.run.acceptance.status.toUpperCase()}`);
  console.log(`  Trial B Turns:              ${turnsB}`);
  console.log(`  Trial B Input Tokens:       ${inValB ?? 'N/A'}`);
  console.log(`  Trial B Output Tokens:      ${outValB ?? 'N/A'}`);
  console.log(`  Trial B Tavily Event:       ${tavilyEventsB[0]?.message ?? 'None found'}`);

  evidenceReport.trialB_withTavily = {
    status: resultB.run.status,
    acceptance: resultB.run.acceptance,
    turns: turnsB,
    inputTokens: inValB,
    outputTokens: outValB,
    tavilyEvent: tavilyEventsB[0]?.message,
    output: resultB.run.output,
  };

  // --------------------------------------------------------------------------
  // STEP 5: Objective Comparative Assessment
  // --------------------------------------------------------------------------
  console.log('\n' + '-'.repeat(80));
  console.log('STEP 5: Objective Comparative Assessment');
  console.log('-'.repeat(80));

  const trialAPassed = resultA.run.acceptance.status === 'passed';
  const trialBPassed = resultB.run.acceptance.status === 'passed';

  let assessmentSummary = '';
  if (!trialAPassed && trialBPassed) {
    assessmentSummary = 'Tavily documentation verification provided actionable deprecation evidence that enabled the agent to avoid the deprecated API and pass acceptance tests under #![deny(deprecated)]. Without Tavily, the agent failed acceptance checks.';
  } else if (trialAPassed && trialBPassed) {
    assessmentSummary = 'Both trials passed acceptance checks. The model avoided deprecated APIs in both cases; Tavily verified the deprecation status but was not solely decisive in this specific run.';
  } else {
    assessmentSummary = `Trial A status: ${resultA.run.acceptance.status}, Trial B status: ${resultB.run.acceptance.status}. Observed differences recorded in telemetry.`;
  }

  console.log(`  Assessment: ${assessmentSummary}`);
  console.log('  Caution: Observations reflect this specific configuration and prompt; single-run outcomes must not be cited as universal causation.');

  evidenceReport.comparativeAnalysis = {
    trialAPassed,
    trialBPassed,
    summary: assessmentSummary,
    disclaimer: 'Observations reflect matched frozen trials; causation must not be inferred universally from single-run trials without multi-trial replication.',
  };

  // --------------------------------------------------------------------------
  // STEP 6: Write Structured Evidence Artifact
  // --------------------------------------------------------------------------
  const outDir = path.resolve(__dirname, '../.local/data');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'tavily-freshness-evidence.json');
  await fs.writeFile(outPath, JSON.stringify(evidenceReport, null, 2), 'utf8');

  console.log('\n' + '='.repeat(80));
  console.log(`Evidence artifact written to: ${outPath}`);
  console.log('Tavily Freshness Comparative Demonstration: COMPLETED');
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('Fatal demonstration error:', err);
  process.exit(1);
});
