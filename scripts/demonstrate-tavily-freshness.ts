import * as fs from 'node:fs/promises';
import * as path from 'node:path';
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

try {
  process.loadEnvFile?.();
} catch {
  // Ignore missing .env or node versions without loadEnvFile
}

async function main() {
  console.log('='.repeat(80));
  console.log('ProofBench — Tavily Freshness & Deprecation Scenario Demonstration');
  console.log('Scenario: Version-Sensitive API Deprecation (#![deny(deprecated)])');
  console.log('='.repeat(80));

  const hasTavilyKey = Boolean(process.env.TAVILY_API_KEY);
  const tavilyMode = process.env.TAVILY_MODE === 'live' && hasTavilyKey ? 'live' : 'fixture';
  console.log(`\n[TAVILY CONFIGURATION]`);
  console.log(`  Mode:                     ${tavilyMode.toUpperCase()}`);
  console.log(`  API Key Configured:       ${hasTavilyKey ? 'YES (Present in environment)' : 'NO (Using deterministic verified offline fixtures)'}`);

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
    tavilyMode,
    claimExtraction: null,
    confidentialityCheck: null,
    agentExecution: null,
  };

  // --------------------------------------------------------------------------
  // STEP 1: Direct Claim Extraction and Documentation Verification
  // --------------------------------------------------------------------------
  console.log('\n' + '-'.repeat(80));
  console.log('STEP 1: Claim Extraction & Documentation Verification');
  console.log('-'.repeat(80));

  const standardPolicy = createDefaultPolicy({ confidential: false });
  const verificationResult = await TavilyDocumentationVerifier.verifyCodePlanClaims(taskSpec.prompt, standardPolicy);

  console.log(`  Claims Verified Count:   ${verificationResult.claimsVerified.length}`);
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

  console.log(`\n  Injected Context for Model Prompt:`);
  console.log(verificationResult.injectedContext.trim().split('\n').map((l) => `    ${l}`).join('\n'));

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

  // --------------------------------------------------------------------------
  // STEP 3: Full Governed Agent Execution with Freshness Verification
  // --------------------------------------------------------------------------
  console.log('\n' + '-'.repeat(80));
  console.log('STEP 3: Governed Agent Execution on Task 4 (#![deny(deprecated)])');
  console.log('-'.repeat(80));

  const approvalHandler = createScopedPriorApprovalHandler({
    allowedFiles: ['src/lib.rs'],
    maxWritesPerFile: 5,
    maxTotalModifications: 5,
  });

  const embeddedGateway = new EmbeddedBifrostGateway();
  const client = new BifrostClient({
    mode: 'simulation',
    embeddedGateway,
    userBudgetLimitUsd: 1.0,
  });

  const agent = new ProofBenchAgent({
    bifrostClient: client,
    approvalHandler,
    enableM1ContextBounding: true,
    enableM2StagnationBreaker: true,
    enableM3aAutopsyEscalation: true,
    enableTavilyDocumentation: true,
  });

  const runResult = await agent.runTask(taskSpec, Date.now());

  const inVal = (runResult.run.usage.inputTokens.status === 'known' || runResult.run.usage.inputTokens.status === 'estimated')
    ? `${runResult.run.usage.inputTokens.value} tokens`
    : runResult.run.usage.inputTokens.status;
  const outVal = (runResult.run.usage.outputTokens.status === 'known' || runResult.run.usage.outputTokens.status === 'estimated')
    ? `${runResult.run.usage.outputTokens.value} tokens`
    : runResult.run.usage.outputTokens.status;
  const totalTurns = runResult.trace.events.filter((e) => e.type === 'output' && e.message.includes('Dispatching')).length;

  console.log(`  Agent Execution Status:     ${runResult.run.status.toUpperCase()}`);
  console.log(`  Independent Acceptance:     ${runResult.run.acceptance.status.toUpperCase()}`);
  console.log(`  Total Turns:                ${totalTurns}`);
  console.log(`  Observed Input Tokens:      ${inVal}`);
  console.log(`  Observed Output Tokens:     ${outVal}`);

  // Inspect trace for Tavily injection event
  const tavilyEvents = runResult.trace.events.filter(
    (e) => e.type === 'output' && e.message.includes('Tavily documentation')
  );
  console.log(`  Trace Tavily Event:         ${tavilyEvents[0]?.message ?? 'None found'}`);

  evidenceReport.agentExecution = {
    status: runResult.run.status,
    acceptance: runResult.run.acceptance,
    turns: totalTurns,
    usage: runResult.run.usage,
    tavilyEvent: tavilyEvents[0]?.message,
    eventsCount: runResult.trace.events.length,
  };

  // --------------------------------------------------------------------------
  // STEP 4: Write Structured Evidence Artifact
  // --------------------------------------------------------------------------
  const outDir = path.resolve(process.cwd(), '.local/data');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'tavily-freshness-evidence.json');
  await fs.writeFile(outPath, JSON.stringify(evidenceReport, null, 2), 'utf8');

  console.log('\n' + '='.repeat(80));
  console.log(`Evidence artifact written to: ${outPath}`);
  console.log('Tavily Freshness Demonstration: COMPLETED SUCCESSFULLY');
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('Fatal demonstration error:', err);
  process.exit(1);
});
