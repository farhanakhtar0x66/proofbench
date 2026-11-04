import { TaskSpec } from '../../../../packages/contracts/src/index';
import { ProofBenchAgent } from '../runtime/agent';
import { EmbeddedBifrostGateway } from '../gateway/embedded';
import { createWorkspaceApprovalHandler } from '../governance/approval';

export interface BenchmarkMeasurement {
  arm: 'baseline_unbounded' | 'experimental_governed';
  taskTitle: string;
  passed: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  costUsd: number | null;
  turns: number;
  routingProvider: string;
}

export interface ComparativeEfficiencyReport {
  taskId: string;
  taskTitle: string;
  baseline: BenchmarkMeasurement;
  experimental: BenchmarkMeasurement;
  tokenSavingsPercent: number | null;
  costSavingsPercent: number | null;
  comparable: boolean;
  reason?: string;
  evidenceSummary: string;
}

export interface ComparativeSuiteSummary {
  totalTasks: number;
  baselinePassed: number;
  baselineSuccessRatePercent: number;
  experimentalPassed: number;
  experimentalSuccessRatePercent: number;
  comparableTasks: number;
  comparisons: ComparativeEfficiencyReport[];
  averageTokenSavingsPercent: number | null;
  evidenceSummary: string;
}

function extractObservation(obs?: { status: string; value?: number }): number | null {
  if (!obs) return null;
  if ((obs.status === 'known' || obs.status === 'estimated') && typeof obs.value === 'number') {
    return obs.value;
  }
  return null;
}

export class ComparativeBenchmarkSuite {
  static async compareTaskEfficiency(
    task: TaskSpec,
    options: { mode?: 'live' | 'simulation'; primaryModel?: string } = {}
  ): Promise<ComparativeEfficiencyReport> {
    const isLive = options.mode === 'live' || process.env.BIFROST_MODE === 'live';
    const embeddedGateway = isLive ? undefined : new EmbeddedBifrostGateway();
    const approvalHandler = createWorkspaceApprovalHandler();

    // 1. Baseline Arm: Unbounded raw file reads, unguided loop control
    const baselineAgent = new ProofBenchAgent({
      embeddedGateway,
      approvalHandler,
      primaryModel: options.primaryModel,
      enableM1ContextBounding: false,
      enableM2StagnationBreaker: false,
      enableM3aAutopsyEscalation: false,
      enableTavilyDocumentation: false,
    });

    const baselineResult = await baselineAgent.runTask(task, 1);
    const bIn = extractObservation(baselineResult.run.usage.inputTokens);
    const bOut = extractObservation(baselineResult.run.usage.outputTokens);
    const bDuration = extractObservation(baselineResult.run.usage.duration);
    const bCost = extractObservation(baselineResult.run.usage.cost);
    const bTotal = (bIn !== null && bOut !== null) ? (bIn + bOut) : null;

    const baseline: BenchmarkMeasurement = {
      arm: 'baseline_unbounded',
      taskTitle: task.title,
      passed: baselineResult.run.acceptance.status === 'passed',
      inputTokens: bIn,
      outputTokens: bOut,
      totalTokens: bTotal,
      durationMs: bDuration,
      costUsd: bCost,
      turns: baselineResult.trace.events.filter((e) => e.message.includes('Dispatching turn')).length,
      routingProvider: isLive ? 'bifrost.live' : 'bifrost.simulation',
    };

    // 2. Experimental Arm: M1 Deterministic Context Bounding + M2 Stagnation Breaker + M3a Evidence Autopsy
    const expAgent = new ProofBenchAgent({
      embeddedGateway,
      approvalHandler,
      primaryModel: options.primaryModel,
      enableM1ContextBounding: true,
      enableM2StagnationBreaker: true,
      enableM3aAutopsyEscalation: true,
      enableTavilyDocumentation: true,
    });

    const expResult = await expAgent.runTask(task, 2);
    const expIn = extractObservation(expResult.run.usage.inputTokens);
    const expOut = extractObservation(expResult.run.usage.outputTokens);
    const expDuration = extractObservation(expResult.run.usage.duration);
    const expCost = extractObservation(expResult.run.usage.cost);
    const expTotal = (expIn !== null && expOut !== null) ? (expIn + expOut) : null;

    const experimental: BenchmarkMeasurement = {
      arm: 'experimental_governed',
      taskTitle: task.title,
      passed: expResult.run.acceptance.status === 'passed',
      inputTokens: expIn,
      outputTokens: expOut,
      totalTokens: expTotal,
      durationMs: expDuration,
      costUsd: expCost,
      turns: expResult.trace.events.filter((e) => e.message.includes('Dispatching turn')).length,
      routingProvider: isLive ? 'bifrost.live' : 'bifrost.simulation',
    };

    // Truthful efficiency evaluation:
    // Only report efficiency savings when BOTH arms successfully passed and have valid token telemetry.
    let tokenSavingsPercent: number | null = null;
    let costSavingsPercent: number | null = null;
    let comparable = false;
    let reason: string | undefined;

    if (!baseline.passed || !experimental.passed) {
      comparable = false;
      reason = `Incomparable efficiency: baseline passed=${baseline.passed}, experimental passed=${experimental.passed}. Both arms must succeed to compare efficiency.`;
    } else if (baseline.totalTokens === null || experimental.totalTokens === null) {
      comparable = false;
      reason = 'Incomparable efficiency: token telemetry missing from one or both arms.';
    } else if (baseline.totalTokens <= 0) {
      comparable = false;
      reason = 'Incomparable efficiency: baseline consumed 0 or invalid tokens.';
    } else {
      comparable = true;
      tokenSavingsPercent = Number(
        (((baseline.totalTokens - experimental.totalTokens) / baseline.totalTokens) * 100).toFixed(2)
      );
      if (baseline.costUsd !== null && experimental.costUsd !== null && baseline.costUsd > 0) {
        costSavingsPercent = Number(
          (((baseline.costUsd - experimental.costUsd) / baseline.costUsd) * 100).toFixed(2)
        );
      }
    }

    const evidenceSummary = comparable
      ? `Task '${task.title}': Experimental agent consumed ${experimental.totalTokens} tokens vs ${baseline.totalTokens} for baseline (${tokenSavingsPercent?.toFixed(1)}% reduction). Acceptance: Baseline=PASSED, Experimental=PASSED.`
      : `Task '${task.title}': Incomparable efficiency (${reason}). Acceptance: Baseline=${baseline.passed ? 'PASSED' : 'FAILED'}, Experimental=${experimental.passed ? 'PASSED' : 'FAILED'}.`;

    return {
      taskId: task.id,
      taskTitle: task.title,
      baseline,
      experimental,
      tokenSavingsPercent,
      costSavingsPercent,
      comparable,
      reason,
      evidenceSummary,
    };
  }

  static async evaluateTaskSuite(
    tasks: TaskSpec[],
    options: { mode?: 'live' | 'simulation'; primaryModel?: string } = {}
  ): Promise<ComparativeSuiteSummary> {
    const comparisons: ComparativeEfficiencyReport[] = [];
    let baselinePassed = 0;
    let experimentalPassed = 0;

    for (const task of tasks) {
      const report = await this.compareTaskEfficiency(task, options);
      comparisons.push(report);
      if (report.baseline.passed) baselinePassed++;
      if (report.experimental.passed) experimentalPassed++;
    }

    const totalTasks = tasks.length;
    const baselineSuccessRatePercent = totalTasks > 0 ? Number(((baselinePassed / totalTasks) * 100).toFixed(1)) : 0;
    const experimentalSuccessRatePercent = totalTasks > 0 ? Number(((experimentalPassed / totalTasks) * 100).toFixed(1)) : 0;

    const comparableReports = comparisons.filter((c) => c.comparable && c.tokenSavingsPercent !== null);
    const averageTokenSavingsPercent = comparableReports.length > 0
      ? Number((comparableReports.reduce((acc, c) => acc + (c.tokenSavingsPercent ?? 0), 0) / comparableReports.length).toFixed(1))
      : null;

    const evidenceSummary = `Evaluated ${totalTasks} task(s). Success Rates: Baseline=${baselinePassed}/${totalTasks} (${baselineSuccessRatePercent}%), Experimental=${experimentalPassed}/${totalTasks} (${experimentalSuccessRatePercent}%). Comparable Tasks: ${comparableReports.length}/${totalTasks}. Average Token Savings on passing tasks: ${averageTokenSavingsPercent !== null ? `${averageTokenSavingsPercent}%` : 'N/A'}.`;

    return {
      totalTasks,
      baselinePassed,
      baselineSuccessRatePercent,
      experimentalPassed,
      experimentalSuccessRatePercent,
      comparableTasks: comparableReports.length,
      comparisons,
      averageTokenSavingsPercent,
      evidenceSummary,
    };
  }
}
