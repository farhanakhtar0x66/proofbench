import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ComparativeBenchmarkSuite,
  getCodingTasksDir,
  FiveConfigComparisonResult,
  AblationSuiteResult,
} from '../implementations/bifrost-01/src/index';
import { TaskSpec } from '../packages/contracts/src/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  process.loadEnvFile?.();
} catch {
  // Continue if .env not present
}

interface BenchmarkCliArgs {
  isLive: boolean;
  trials: number;
  runAblations: boolean;
  taskFilter?: string;
}

function parseCliArgs(): BenchmarkCliArgs {
  const args = process.argv.slice(2);
  const isLive = args.includes('--live');
  const runAblations = args.includes('--ablation') || args.includes('--ablations');

  let trials = 1;
  const trialsArg = args.find((a) => a.startsWith('--trials='));
  if (trialsArg) {
    trials = parseInt(trialsArg.split('=')[1], 10) || 1;
  }

  const taskArg = args.find((a) => a.startsWith('--task='));
  const taskFilter = taskArg ? taskArg.split('=')[1] : undefined;

  return { isLive, trials, runAblations, taskFilter };
}

async function main() {
  const cliArgs = parseCliArgs();
  console.log('='.repeat(80));
  console.log('ProofBench — Deterministic Inference Optimization Benchmark Suite');
  console.log(`Execution Mode: ${cliArgs.isLive ? 'LIVE BIFROST GATEWAY' : 'DETERMINISTIC SIMULATION'}`);
  console.log(`Trials Per Configuration: ${cliArgs.trials}`);
  console.log(`Run Ablation Suite: ${cliArgs.runAblations ? 'YES' : 'NO'}`);
  console.log('='.repeat(80));

  const tasksDir = getCodingTasksDir();
  const allTaskDirs = [
    'task-1-fix-failing-func',
    'task-2-missing-feature',
    'task-3-multi-file-regression',
    'task-4-version-freshness',
    'task-5-context-filtering',
    'task-6-deterministic-fix',
    'task-7-adaptive-pipeline',
    'task-8-deterministic-unused-var',
  ];

  const targetTaskDirs = cliArgs.taskFilter
    ? allTaskDirs.filter((d) => d.includes(cliArgs.taskFilter!))
    : allTaskDirs;

  const fiveConfigResults: FiveConfigComparisonResult[] = [];
  const ablationResults: AblationSuiteResult[] = [];

  for (const dirName of targetTaskDirs) {
    const taskJsonPath = path.join(tasksDir, dirName, 'task.json');
    let taskRaw = '';
    try {
      taskRaw = await fs.readFile(taskJsonPath, 'utf8');
    } catch {
      console.warn(`[WARN] Skipping task directory: ${dirName} (task.json not found)`);
      continue;
    }

    const taskSpec = TaskSpec.parse(JSON.parse(taskRaw));
    console.log(`\nEvaluating Task: ${taskSpec.id} ("${taskSpec.title}")`);

    // 1. Run 6-Configuration Benchmark
    console.log(`  -> Running 6-Configuration Benchmark (${cliArgs.trials} trial(s))...`);
    const fiveRes = await ComparativeBenchmarkSuite.benchmarkSixConfigurations(taskSpec, {
      mode: cliArgs.isLive ? 'live' : 'simulation',
      trials: cliArgs.trials,
    });
    fiveConfigResults.push(fiveRes);

    console.log('\n  6-Configuration Results (Honest Full-Trial Accounting):');
    console.log('  ' + '-'.repeat(102));
    console.log(`  | ${'Configuration'.padEnd(28)} | ${'Pass %'.padEnd(8)} | ${'Pass Tok'.padEnd(10)} | ${'Tok/Accept'.padEnd(11)} | ${'CPU ms'.padEnd(8)} | ${'Inf ms'.padEnd(8)} | ${'Mode'.padEnd(8)} |`);
    console.log('  ' + '-'.repeat(102));
    for (const agg of Object.values(fiveRes.summary)) {
      const passTokStr = agg.avgTotalTokensOnPass !== null ? agg.avgTotalTokensOnPass.toString() : 'N/A';
      const effTokStr = agg.totalTokensPerAcceptedCompletion !== null ? agg.totalTokensPerAcceptedCompletion.toString() : 'N/A';
      const cpuStr = agg.avgDeterministicCpuMs !== null && agg.avgDeterministicCpuMs !== undefined ? agg.avgDeterministicCpuMs.toString() : '-';
      const infStr = agg.avgInferenceMs !== null && agg.avgInferenceMs !== undefined ? agg.avgInferenceMs.toString() : (agg.avgDurationMsOnPass?.toString() ?? '-');
      const modeStr = agg.isSimulated ? 'Sim' : 'Live';
      console.log(`  | ${agg.configLabel.slice(0, 28).padEnd(28)} | ${(agg.successRatePercent + '%').padEnd(8)} | ${passTokStr.padEnd(10)} | ${effTokStr.padEnd(11)} | ${cpuStr.padEnd(8)} | ${infStr.padEnd(8)} | ${modeStr.padEnd(8)} |`);
    }
    console.log('  ' + '-'.repeat(102));
    if (fiveRes.savingsVsDirect9B.comparable) {
      console.log(`  Compiled Token Savings vs Direct 9B: ${fiveRes.savingsVsDirect9B.tokenSavingsPercent}%`);
    }
    if (fiveRes.savingsVsGovernedBaseline.comparable) {
      console.log(`  Compiled Token Savings vs Governed Baseline: ${fiveRes.savingsVsGovernedBaseline.tokenSavingsPercent}%`);
    }

    // 2. Run Ablation Suite if requested
    if (cliArgs.runAblations) {
      console.log(`\n  -> Running Individual Ablation Suite...`);
      const ablRes = await ComparativeBenchmarkSuite.runAblationSuite(taskSpec, {
        mode: cliArgs.isLive ? 'live' : 'simulation',
      });
      ablationResults.push(ablRes);

      console.log('  Ablation Variants:');
      console.log('  ' + '-'.repeat(76));
      console.log(`  | ${'Variant'.padEnd(24)} | ${'Passed'.padEnd(8)} | ${'Total Tokens'.padEnd(14)} | ${'Savings %'.padEnd(10)} |`);
      console.log('  ' + '-'.repeat(76));
      for (const v of ablRes.variants) {
        const tokStr = v.totalTokens !== null ? v.totalTokens.toString() : 'N/A';
        const savStr = v.tokenSavingsVsBaselinePercent !== null ? `${v.tokenSavingsVsBaselinePercent}%` : 'N/A';
        console.log(`  | ${v.variant.padEnd(24)} | ${(v.passed ? 'YES' : 'NO').padEnd(8)} | ${tokStr.padEnd(14)} | ${savStr.padEnd(10)} |`);
      }
      console.log('  ' + '-'.repeat(76));
    }
  }

  // Save evidence artifact
  const outDir = path.resolve(__dirname, '../.local/data');
  await fs.mkdir(outDir, { recursive: true });
  const evidencePath = path.join(outDir, 'optimization-benchmark-evidence.json');

  const evidenceReport = {
    title: 'ProofBench Deterministic Inference Optimization Benchmark Evidence',
    timestamp: new Date().toISOString(),
    environment: {
      mode: cliArgs.isLive ? 'live' : 'simulation',
      trialsPerConfig: cliArgs.trials,
      hasLiveGateway: cliArgs.isLive,
    },
    fiveConfigurationResults: fiveConfigResults,
    ablationResults,
  };

  await fs.writeFile(evidencePath, JSON.stringify(evidenceReport, null, 2), 'utf8');

  console.log('\n' + '='.repeat(80));
  console.log(`Structured evidence artifact written to: ${evidencePath}`);
  console.log('Deterministic Inference Optimization Benchmark: COMPLETE');
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('[FATAL] Optimization benchmark suite failed:', err);
  process.exit(1);
});
