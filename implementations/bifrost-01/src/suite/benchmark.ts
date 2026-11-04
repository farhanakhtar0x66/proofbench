import { TaskSpec } from '../../../../packages/contracts/src/index';
import { ProofBenchAgent } from '../runtime/agent';
import { EmbeddedBifrostGateway } from '../gateway/embedded';
import { BifrostClient } from '../gateway/client';
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

export type StrategyName = 'direct_small' | 'direct_large' | 'governed_escalation';

export interface StrategyMeasurement {
  strategy: StrategyName;
  strategyLabel: string;
  taskId: string;
  taskTitle: string;
  trial: number;
  passed: boolean;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  costUsd: number | null;
  turns: number;
  modelSwitches: number;
  primaryModel: string;
  finalModel: string;
  routingProvider: string;
  fallbackInvoked: boolean;
}

export interface StrategyAggregate {
  strategy: StrategyName;
  strategyLabel: string;
  totalTrials: number;
  passedTrials: number;
  failedTrials: number;
  successRatePercent: number;
  avgTotalTokensOnPass: number | null;
  avgDurationMsOnPass: number | null;
  avgCostUsdOnPass: number | null;
  totalTokensAllTrials: number | null;
  totalCostUsdAllTrials: number | null;
  modelSwitchCount: number;
}

export interface StrategyComparisonResult {
  taskId: string;
  taskTitle: string;
  trialsPerStrategy: number;
  strategyMeasurements: Record<StrategyName, StrategyMeasurement[]>;
  summary: Record<StrategyName, StrategyAggregate>;
  governedSavingsVsDirectLarge: {
    tokenSavingsPercent: number | null;
    costSavingsPercent: number | null;
    comparable: boolean;
    reason?: string;
  };
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
    options: {
      mode?: 'live' | 'simulation';
      primaryModel?: string;
      embeddedGateway?: EmbeddedBifrostGateway;
    } = {}
  ): Promise<ComparativeEfficiencyReport> {
    const isLive = options.mode === 'live' || process.env.BIFROST_MODE === 'live';
    const embeddedGateway = isLive ? undefined : (options.embeddedGateway ?? new EmbeddedBifrostGateway());
    const bifrostClient = isLive
      ? new BifrostClient({
          mode: 'live',
          gatewayUrl: process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089',
          virtualKey: process.env.BIFROST_VIRTUAL_KEY,
          userBudgetLimitUsd: 10.0,
        })
      : new BifrostClient({
          mode: 'simulation',
          embeddedGateway,
        });

    // 1. Baseline Arm: Unbounded raw file reads, unguided loop control
    const baselineAgent = new ProofBenchAgent({
      bifrostClient,
      approvalHandler: createWorkspaceApprovalHandler(),
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
      bifrostClient,
      approvalHandler: createWorkspaceApprovalHandler(),
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

  static async benchmarkThreeStrategies(
    task: TaskSpec,
    options: {
      mode?: 'live' | 'simulation';
      trials?: number;
      models?: {
        small?: string;
        large?: string;
      };
      embeddedGateway?: EmbeddedBifrostGateway;
    } = {}
  ): Promise<StrategyComparisonResult> {
    const isLive = options.mode === 'live' || process.env.BIFROST_MODE === 'live';
    const trials = Math.max(1, options.trials ?? 1);
    const smallModel = options.models?.small ?? (isLive ? 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M' : 'local-deepseek-coder');
    const largeModel = options.models?.large ?? (isLive ? 'gguf/Qwen3.5-9B-GGUF:Q4_K_M' : 'escalation-frontier-model');

    const strategyConfigs: Array<{
      strategy: StrategyName;
      label: string;
      primaryModel: string;
      recoveryModel?: string;
      enableM3a: boolean;
    }> = [
      {
        strategy: 'direct_small',
        label: `Direct ${smallModel} (No Escalation)`,
        primaryModel: smallModel,
        enableM3a: false,
      },
      {
        strategy: 'direct_large',
        label: `Direct ${largeModel} (Frontier Only)`,
        primaryModel: largeModel,
        enableM3a: false,
      },
      {
        strategy: 'governed_escalation',
        label: `Governed ${smallModel} with ${largeModel} Escalation`,
        primaryModel: smallModel,
        recoveryModel: largeModel,
        enableM3a: true,
      },
    ];

    const measurements: Record<StrategyName, StrategyMeasurement[]> = {
      direct_small: [],
      direct_large: [],
      governed_escalation: [],
    };

    for (const config of strategyConfigs) {
      for (let t = 1; t <= trials; t++) {
        const embeddedGateway = isLive ? undefined : (options.embeddedGateway ?? new EmbeddedBifrostGateway());
        const bifrostClient = isLive
          ? new BifrostClient({
              mode: 'live',
              gatewayUrl: process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089',
              virtualKey: process.env.BIFROST_VIRTUAL_KEY,
              userBudgetLimitUsd: 10.0,
            })
          : new BifrostClient({
              mode: 'simulation',
              embeddedGateway,
              virtualKey: 'sk-bf-simulation-default',
            });

        const agent = new ProofBenchAgent({
          bifrostClient,
          approvalHandler: createWorkspaceApprovalHandler(),
          primaryModel: config.primaryModel,
          recoveryModel: config.recoveryModel,
          enableM1ContextBounding: true,
          enableM2StagnationBreaker: true,
          enableM3aAutopsyEscalation: config.enableM3a,
          enableTavilyDocumentation: true,
        });

        const { run, trace } = await agent.runTask(task, t * 100);

        const inVal = extractObservation(run.usage.inputTokens);
        const outVal = extractObservation(run.usage.outputTokens);
        const durVal = extractObservation(run.usage.duration);
        const costVal = extractObservation(run.usage.cost);
        const totVal = (inVal !== null && outVal !== null) ? inVal + outVal : null;

        const hasRecovery = trace.events.some((e) => e.data?.isRecovery === true);
        const finalModelEvent = [...trace.events].reverse().find((e) => typeof e.data?.model === 'string');
        const finalModel = (finalModelEvent?.data?.model as string) ?? config.primaryModel;
        const fallbackInvoked = trace.events.some((e) => e.message.includes('fallback routing triggered'));

        measurements[config.strategy].push({
          strategy: config.strategy,
          strategyLabel: config.label,
          taskId: task.id,
          taskTitle: task.title,
          trial: t,
          passed: run.acceptance.status === 'passed',
          status: run.status,
          inputTokens: inVal,
          outputTokens: outVal,
          totalTokens: totVal,
          durationMs: durVal,
          costUsd: costVal,
          turns: trace.events.filter((e) => e.message.includes('Dispatching')).length,
          modelSwitches: hasRecovery ? 1 : 0,
          primaryModel: config.primaryModel,
          finalModel,
          routingProvider: isLive ? 'bifrost.live' : 'bifrost.simulation',
          fallbackInvoked,
        });
      }
    }

    const computeAgg = (strat: StrategyName, label: string): StrategyAggregate => {
      const ms = measurements[strat];
      const passed = ms.filter((m) => m.passed);
      const passedCount = passed.length;
      const failedCount = ms.length - passedCount;
      const successRate = ms.length > 0 ? Number(((passedCount / ms.length) * 100).toFixed(1)) : 0;

      const validPassTokens = passed.map((m) => m.totalTokens).filter((v): v is number => typeof v === 'number');
      const avgTokens = validPassTokens.length > 0 ? Math.round(validPassTokens.reduce((a, b) => a + b, 0) / validPassTokens.length) : null;

      const validDurations = passed.map((m) => m.durationMs).filter((v): v is number => typeof v === 'number');
      const avgDuration = validDurations.length > 0 ? Math.round(validDurations.reduce((a, b) => a + b, 0) / validDurations.length) : null;

      const validCosts = passed.map((m) => m.costUsd).filter((v): v is number => typeof v === 'number');
      const avgCost = validCosts.length > 0 ? Number((validCosts.reduce((a, b) => a + b, 0) / validCosts.length).toFixed(6)) : null;

      const allTokens = ms.map((m) => m.totalTokens).filter((v): v is number => typeof v === 'number');
      const totalTokensAll = allTokens.length === ms.length && allTokens.length > 0 ? allTokens.reduce((a, b) => a + b, 0) : null;

      const allCosts = ms.map((m) => m.costUsd).filter((v): v is number => typeof v === 'number');
      const totalCostAll = allCosts.length === ms.length && allCosts.length > 0 ? Number(allCosts.reduce((a, b) => a + b, 0).toFixed(6)) : null;

      const switchCount = ms.reduce((acc, m) => acc + m.modelSwitches, 0);

      return {
        strategy: strat,
        strategyLabel: label,
        totalTrials: ms.length,
        passedTrials: passedCount,
        failedTrials: failedCount,
        successRatePercent: successRate,
        avgTotalTokensOnPass: avgTokens,
        avgDurationMsOnPass: avgDuration,
        avgCostUsdOnPass: avgCost,
        totalTokensAllTrials: totalTokensAll,
        totalCostUsdAllTrials: totalCostAll,
        modelSwitchCount: switchCount,
      };
    };

    const summary: Record<StrategyName, StrategyAggregate> = {
      direct_small: computeAgg('direct_small', strategyConfigs[0].label),
      direct_large: computeAgg('direct_large', strategyConfigs[1].label),
      governed_escalation: computeAgg('governed_escalation', strategyConfigs[2].label),
    };

    let tokenSavingsPercent: number | null = null;
    let costSavingsPercent: number | null = null;
    let comparable = false;
    let compReason: string | undefined;

    const largeSummary = summary.direct_large;
    const govSummary = summary.governed_escalation;

    if (largeSummary.passedTrials === 0 || govSummary.passedTrials === 0) {
      comparable = false;
      compReason = `Incomparable: direct_large pass=${largeSummary.passedTrials}/${largeSummary.totalTrials}, governed pass=${govSummary.passedTrials}/${govSummary.totalTrials}`;
    } else if (largeSummary.avgTotalTokensOnPass === null || govSummary.avgTotalTokensOnPass === null) {
      comparable = false;
      compReason = 'Missing token observations for pass comparison';
    } else {
      comparable = true;
      tokenSavingsPercent = Number(
        (((largeSummary.avgTotalTokensOnPass - govSummary.avgTotalTokensOnPass) / largeSummary.avgTotalTokensOnPass) * 100).toFixed(1)
      );
      if (largeSummary.avgCostUsdOnPass !== null && govSummary.avgCostUsdOnPass !== null && largeSummary.avgCostUsdOnPass > 0) {
        costSavingsPercent = Number(
          (((largeSummary.avgCostUsdOnPass - govSummary.avgCostUsdOnPass) / largeSummary.avgCostUsdOnPass) * 100).toFixed(1)
        );
      }
    }

    const evidenceSummary = `Task '${task.title}': direct_small success=${summary.direct_small.successRatePercent}%, direct_large success=${summary.direct_large.successRatePercent}%, governed_escalation success=${summary.governed_escalation.successRatePercent}%. Governed token savings vs direct large: ${tokenSavingsPercent !== null ? `${tokenSavingsPercent}%` : 'N/A'} (switches: ${summary.governed_escalation.modelSwitchCount}).`;

    return {
      taskId: task.id,
      taskTitle: task.title,
      trialsPerStrategy: trials,
      strategyMeasurements: measurements,
      summary,
      governedSavingsVsDirectLarge: {
        tokenSavingsPercent,
        costSavingsPercent,
        comparable,
        reason: compReason,
      },
      evidenceSummary,
    };
  }
}
