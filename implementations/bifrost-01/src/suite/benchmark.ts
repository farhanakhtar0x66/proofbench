import { TaskSpec } from '../../../../packages/contracts/src/index';
import { ProofBenchAgent } from '../runtime/agent';
import { EmbeddedBifrostGateway } from '../gateway/embedded';

export interface BenchmarkMeasurement {
  arm: 'baseline_unbounded' | 'experimental_governed';
  taskTitle: string;
  passed: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  costUsd: number;
  turns: number;
  routingProvider: string;
}

export interface ComparativeEfficiencyReport {
  taskId: string;
  taskTitle: string;
  baseline: BenchmarkMeasurement;
  experimental: BenchmarkMeasurement;
  tokenSavingsPercent: number;
  costSavingsPercent: number;
  evidenceSummary: string;
}

export class ComparativeBenchmarkSuite {
  static async compareTaskEfficiency(
    task: TaskSpec,
    options: { mode?: 'live' | 'simulation'; primaryModel?: string } = {}
  ): Promise<ComparativeEfficiencyReport> {
    const isLive = options.mode === 'live' || process.env.BIFROST_MODE === 'live';
    const embeddedGateway = isLive ? undefined : new EmbeddedBifrostGateway();

    // 1. Baseline Arm: Unbounded raw file reads, unguided loop control
    const baselineAgent = new ProofBenchAgent({
      embeddedGateway,
      primaryModel: options.primaryModel,
      enableM1ContextBounding: false,
      enableM2StagnationBreaker: false,
      enableM3aAutopsyEscalation: false,
      enableTavilyDocumentation: false,
    });

    const baselineResult = await baselineAgent.runTask(task, 1);
    const bIn = (baselineResult.run.usage.inputTokens.status === 'known' || baselineResult.run.usage.inputTokens.status === 'estimated') ? baselineResult.run.usage.inputTokens.value : 0;
    const bOut = (baselineResult.run.usage.outputTokens.status === 'known' || baselineResult.run.usage.outputTokens.status === 'estimated') ? baselineResult.run.usage.outputTokens.value : 0;
    const bDuration = (baselineResult.run.usage.duration.status === 'known' || baselineResult.run.usage.duration.status === 'estimated') ? baselineResult.run.usage.duration.value : 0;
    const bCost = (baselineResult.run.usage.cost.status === 'known' || baselineResult.run.usage.cost.status === 'estimated') ? baselineResult.run.usage.cost.value : 0;

    const baseline: BenchmarkMeasurement = {
      arm: 'baseline_unbounded',
      taskTitle: task.title,
      passed: baselineResult.run.acceptance.status === 'passed',
      inputTokens: bIn,
      outputTokens: bOut,
      totalTokens: bIn + bOut,
      durationMs: bDuration,
      costUsd: bCost,
      turns: baselineResult.trace.events.filter((e) => e.message.includes('Dispatching turn')).length,
      routingProvider: isLive ? 'bifrost.live' : 'bifrost.simulation',
    };

    // 2. Experimental Arm: M1 Deterministic Context Bounding + M2 Stagnation Breaker + M3a Evidence Autopsy
    const expAgent = new ProofBenchAgent({
      embeddedGateway,
      primaryModel: options.primaryModel,
      enableM1ContextBounding: true,
      enableM2StagnationBreaker: true,
      enableM3aAutopsyEscalation: true,
      enableTavilyDocumentation: true,
    });

    const expResult = await expAgent.runTask(task, 2);
    const expIn = (expResult.run.usage.inputTokens.status === 'known' || expResult.run.usage.inputTokens.status === 'estimated') ? expResult.run.usage.inputTokens.value : 0;
    const expOut = (expResult.run.usage.outputTokens.status === 'known' || expResult.run.usage.outputTokens.status === 'estimated') ? expResult.run.usage.outputTokens.value : 0;
    const expDuration = (expResult.run.usage.duration.status === 'known' || expResult.run.usage.duration.status === 'estimated') ? expResult.run.usage.duration.value : 0;
    const expCost = (expResult.run.usage.cost.status === 'known' || expResult.run.usage.cost.status === 'estimated') ? expResult.run.usage.cost.value : 0;

    const experimental: BenchmarkMeasurement = {
      arm: 'experimental_governed',
      taskTitle: task.title,
      passed: expResult.run.acceptance.status === 'passed',
      inputTokens: expIn,
      outputTokens: expOut,
      totalTokens: expIn + expOut,
      durationMs: expDuration,
      costUsd: expCost,
      turns: expResult.trace.events.filter((e) => e.message.includes('Dispatching turn')).length,
      routingProvider: isLive ? 'bifrost.live' : 'bifrost.simulation',
    };

    const tokenSavings = baseline.totalTokens > 0
      ? ((baseline.totalTokens - experimental.totalTokens) / baseline.totalTokens) * 100
      : 0;

    const costSavings = baseline.costUsd > 0
      ? ((baseline.costUsd - experimental.costUsd) / baseline.costUsd) * 100
      : 0;

    const evidenceSummary = `Task '${task.title}': Experimental M1/M2/M3a agent consumed ${experimental.totalTokens} tokens vs ${baseline.totalTokens} tokens for baseline (${tokenSavings.toFixed(1)}% token reduction). Acceptance: Baseline=${baseline.passed ? 'PASSED' : 'FAILED'}, Experimental=${experimental.passed ? 'PASSED' : 'FAILED'}.`;

    return {
      taskId: task.id,
      taskTitle: task.title,
      baseline,
      experimental,
      tokenSavingsPercent: Number(tokenSavings.toFixed(2)),
      costSavingsPercent: Number(costSavings.toFixed(2)),
      evidenceSummary,
    };
  }
}
