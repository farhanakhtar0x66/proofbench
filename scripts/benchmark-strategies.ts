import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  ComparativeBenchmarkSuite,
  EmbeddedBifrostGateway,
  getCodingTasksDir,
  type StrategyComparisonResult,
} from '../implementations/bifrost-01/src/index';
import { TaskSpec } from '../packages/contracts/src/index';

try {
  process.loadEnvFile?.();
} catch {
  // Continue if .env is missing or node version doesn't support loadEnvFile
}

async function checkLiveGatewayReachable(url = 'http://127.0.0.1:8089'): Promise<boolean> {
  try {
    const res = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('ProofBench — Multi-Strategy Benchmark Suite');
  console.log('Comparing 3 Strategies:');
  console.log('  1. Direct Small Model (No Escalation)');
  console.log('  2. Direct Frontier Model (Frontier Only)');
  console.log('  3. Governed Tiering (Small -> Frontier Escalation via M3a Autopsy)');
  console.log('='.repeat(80));

  const args = process.argv.slice(2);
  const isLiveFlag = args.includes('--live');
  const isSimFlag = args.includes('--simulation');
  const trialsArg = args.find((a) => a.startsWith('--trials='));
  const trials = trialsArg ? parseInt(trialsArg.split('=')[1], 10) : 1;

  const liveReachable = await checkLiveGatewayReachable();
  const mode: 'live' | 'simulation' = isLiveFlag ? 'live' : isSimFlag ? 'simulation' : (liveReachable && process.env.BIFROST_VIRTUAL_KEY ? 'live' : 'simulation');

  console.log(`Execution Mode: ${mode.toUpperCase()}`);
  console.log(`Trials per strategy: ${trials}`);

  const tasksDir = getCodingTasksDir();
  const taskIds = [
    'task-1-fix-failing-func',
    'task-2-missing-feature',
    'task-3-multi-file-regression',
  ];

  const results: StrategyComparisonResult[] = [];

  for (const taskId of taskIds) {
    const taskJsonPath = path.join(tasksDir, taskId, 'task.json');
    const taskRaw = await fs.readFile(taskJsonPath, 'utf8');
    const taskSpec = TaskSpec.parse(JSON.parse(taskRaw));

    console.log(`\n${'-'.repeat(80)}`);
    console.log(`Benchmarking Task: ${taskSpec.title} (${taskSpec.id})`);
    console.log(`${'-'.repeat(80)}`);

    const embeddedGateway = mode === 'simulation' ? new EmbeddedBifrostGateway() : undefined;
    const taskResult = await ComparativeBenchmarkSuite.benchmarkThreeStrategies(taskSpec, {
      mode,
      trials,
      embeddedGateway,
    });

    results.push(taskResult);

    console.log(`  Strategy 1: Direct Small Model:`);
    console.log(`    Success Rate:  ${taskResult.summary.direct_small.successRatePercent}% (${taskResult.summary.direct_small.passedTrials}/${taskResult.summary.direct_small.totalTrials})`);
    console.log(`    Avg Tokens:    ${taskResult.summary.direct_small.avgTotalTokensOnPass !== null ? taskResult.summary.direct_small.avgTotalTokensOnPass : 'N/A'}`);
    console.log(`    Avg Duration:  ${taskResult.summary.direct_small.avgDurationMsOnPass !== null ? `${taskResult.summary.direct_small.avgDurationMsOnPass} ms` : 'N/A'}`);

    console.log(`  Strategy 2: Direct Frontier Model:`);
    console.log(`    Success Rate:  ${taskResult.summary.direct_large.successRatePercent}% (${taskResult.summary.direct_large.passedTrials}/${taskResult.summary.direct_large.totalTrials})`);
    console.log(`    Avg Tokens:    ${taskResult.summary.direct_large.avgTotalTokensOnPass !== null ? taskResult.summary.direct_large.avgTotalTokensOnPass : 'N/A'}`);
    console.log(`    Avg Duration:  ${taskResult.summary.direct_large.avgDurationMsOnPass !== null ? `${taskResult.summary.direct_large.avgDurationMsOnPass} ms` : 'N/A'}`);

    console.log(`  Strategy 3: Governed Escalation:`);
    console.log(`    Success Rate:  ${taskResult.summary.governed_escalation.successRatePercent}% (${taskResult.summary.governed_escalation.passedTrials}/${taskResult.summary.governed_escalation.totalTrials})`);
    console.log(`    Avg Tokens:    ${taskResult.summary.governed_escalation.avgTotalTokensOnPass !== null ? taskResult.summary.governed_escalation.avgTotalTokensOnPass : 'N/A'}`);
    console.log(`    Avg Duration:  ${taskResult.summary.governed_escalation.avgDurationMsOnPass !== null ? `${taskResult.summary.governed_escalation.avgDurationMsOnPass} ms` : 'N/A'}`);
    console.log(`    Model Switches:${taskResult.summary.governed_escalation.modelSwitchCount}`);

    console.log(`  Comparative Analysis:`);
    console.log(`    Token Savings vs Frontier: ${taskResult.governedSavingsVsDirectLarge.tokenSavingsPercent !== null ? `${taskResult.governedSavingsVsDirectLarge.tokenSavingsPercent}%` : 'N/A'}`);
    console.log(`    Cost Savings vs Frontier:  ${taskResult.governedSavingsVsDirectLarge.costSavingsPercent !== null ? `${taskResult.governedSavingsVsDirectLarge.costSavingsPercent}%` : 'N/A'}`);
    console.log(`    Summary: ${taskResult.evidenceSummary}`);
  }

  // Write evidence artifact
  const outDir = path.resolve(process.cwd(), '.local/data');
  await fs.mkdir(outDir, { recursive: true });
  const evidencePath = path.join(outDir, 'strategy-benchmark-evidence.json');
  await fs.writeFile(
    evidencePath,
    JSON.stringify(
      {
        benchmarkTitle: 'ProofBench Multi-Strategy Benchmark: Small Direct vs. Frontier Direct vs. Governed Escalation',
        generatedAt: new Date().toISOString(),
        mode,
        trialsPerStrategy: trials,
        results,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log('\n' + '='.repeat(80));
  console.log(`Evidence artifact written to: ${evidencePath}`);
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('Benchmark execution failed:', err);
  process.exit(1);
});
