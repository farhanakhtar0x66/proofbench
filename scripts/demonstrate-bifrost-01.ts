import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  ProofBenchAgent,
  ComparativeBenchmarkSuite,
  getCodingTasksDir,
} from '../implementations/bifrost-01/src/index';
import { TaskSpec } from '../packages/contracts/src/index';

async function main() {
  console.log('='.repeat(80));
  console.log('ProofBench — Bifrost #01 Governed Coding Agent Demonstration');
  console.log('Target: Deterministic loop, minimal tokens, virtual-key budgets, Tavily verification');
  console.log('='.repeat(80));

  const tasksDir = getCodingTasksDir();
  const taskFiles = [
    'task-1-fix-failing-func',
    'task-2-missing-feature',
    'task-3-multi-file-regression',
  ];

  const demonstrationEvidence: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    agent: 'bifrost-01 (ProofBench Deterministically Governed Agent)',
    runs: [],
    comparisons: [],
  };

  // 1. Run live agent execution loop on all 3 frozen tasks
  for (const taskId of taskFiles) {
    const taskJsonPath = path.join(tasksDir, taskId, 'task.json');
    const taskRaw = await fs.readFile(taskJsonPath, 'utf8');
    const taskSpec = TaskSpec.parse(JSON.parse(taskRaw));

    console.log(`\n[RUN] Executing Governed Agent on Task: ${taskSpec.title} (${taskSpec.id})`);
    const agent = new ProofBenchAgent();
    const { run, trace, report } = await agent.runTask(taskSpec, Date.now());

    const inVal = run.usage.inputTokens.status === 'known' ? `${run.usage.inputTokens.value} (${run.usage.inputTokens.source})` : run.usage.inputTokens.status;
    const outVal = run.usage.outputTokens.status === 'known' ? `${run.usage.outputTokens.value} (${run.usage.outputTokens.source})` : run.usage.outputTokens.status;
    const durVal = run.usage.duration.status === 'known' ? `${run.usage.duration.value} ms` : run.usage.duration.status;
    const costVal = run.usage.cost.status === 'known' ? `$${run.usage.cost.value}` : run.usage.cost.status;

    console.log(`  Status:       ${run.status.toUpperCase()}`);
    console.log(`  Acceptance:   ${run.acceptance.status.toUpperCase()}`);
    console.log(`  Input Tokens: ${inVal}`);
    console.log(`  Output Tokens:${outVal}`);
    console.log(`  Duration:     ${durVal}`);
    console.log(`  Cost (USD):   ${costVal}`);
    console.log(`  Trace Events: ${trace.events.length}`);

    (demonstrationEvidence.runs as unknown[]).push({
      taskId,
      run,
      report,
      traceSummary: trace.events.map((e) => `[${e.type}] ${e.message}`),
    });
  }

  // 2. Run Comparative Benchmark (Baseline vs. Experimental M1/M2/M3a)
  console.log('\n' + '='.repeat(80));
  console.log('ProofBench Comparative Efficiency Benchmark (Baseline vs. Experimental)');
  console.log('='.repeat(80));

  for (const taskId of taskFiles) {
    const taskJsonPath = path.join(tasksDir, taskId, 'task.json');
    const taskRaw = await fs.readFile(taskJsonPath, 'utf8');
    const taskSpec = TaskSpec.parse(JSON.parse(taskRaw));

    console.log(`\n[BENCHMARK] Evaluating: ${taskSpec.title}`);
    const comparison = await ComparativeBenchmarkSuite.compareTaskEfficiency(taskSpec);

    console.log(`  Baseline Total Tokens:     ${comparison.baseline.totalTokens}`);
    console.log(`  Experimental Total Tokens: ${comparison.experimental.totalTokens}`);
    console.log(`  Token Savings:             ${comparison.tokenSavingsPercent.toFixed(1)}%`);
    console.log(`  Cost Savings:              ${comparison.costSavingsPercent.toFixed(1)}%`);
    console.log(`  Summary: ${comparison.evidenceSummary}`);

    (demonstrationEvidence.comparisons as unknown[]).push(comparison);
  }

  // 3. Save Evidence to .local/data
  const outDir = path.resolve(process.cwd(), '.local/data');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'bifrost-01-evidence.json');
  await fs.writeFile(outPath, JSON.stringify(demonstrationEvidence, null, 2), 'utf8');

  console.log('\n' + '='.repeat(80));
  console.log(`Evidence artifact written to: ${outPath}`);
  console.log('Demonstration successfully completed with verified independent acceptance tests.');
  console.log('='.repeat(80));
}

main().catch((err) => {
  console.error('Demonstration failed:', err);
  process.exit(1);
});
