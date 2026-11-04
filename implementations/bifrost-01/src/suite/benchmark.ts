import { TaskSpec } from '../../../../packages/contracts/src/index';
import { ProofBenchAgent } from '../runtime/agent';
import { AdaptiveExecutionEngine } from '../controller/engine';
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

export type ConfigName =
  | 'direct_1_5b'
  | 'direct_9b'
  | 'governed_baseline'
  | 'governed_compiled'
  | 'governed_model_selected'
  | 'adaptive_execution_engine';

export type SixConfigComparisonResult = FiveConfigComparisonResult;

export interface ConfigMeasurement {
  config: ConfigName;
  configLabel: string;
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
}

export interface ConfigAggregate {
  config: ConfigName;
  configLabel: string;
  totalTrials: number;
  passedTrials: number;
  failedTrials: number;
  successRatePercent: number;
  avgTotalTokensOnPass: number | null;
  avgInputTokensOnPass: number | null;
  avgOutputTokensOnPass: number | null;
  avgDurationMsOnPass: number | null;
  totalTokensAllTrials: number | null;
  modelSwitchCount: number;
}

export interface FiveConfigComparisonResult {
  taskId: string;
  taskTitle: string;
  trialsPerConfig: number;
  measurements: Record<ConfigName, ConfigMeasurement[]>;
  summary: Record<ConfigName, ConfigAggregate>;
  savingsVsDirect9B: {
    tokenSavingsPercent: number | null;
    comparable: boolean;
    reason?: string;
  };
  savingsVsGovernedBaseline: {
    tokenSavingsPercent: number | null;
    comparable: boolean;
    reason?: string;
  };
  evidenceSummary: string;
}

export interface AblationMeasurement {
  variant: 'baseline' | 'context_only' | 'prompt_only' | 'model_selection_only' | 'full_optimization';
  label: string;
  passed: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  turns: number;
  tokenSavingsVsBaselinePercent: number | null;
}

export interface AblationSuiteResult {
  taskId: string;
  taskTitle: string;
  variants: AblationMeasurement[];
  evidenceSummary: string;
}

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

  static async benchmarkFiveConfigurations(
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
  ): Promise<FiveConfigComparisonResult> {
    const isLive = options.mode === 'live' || process.env.BIFROST_MODE === 'live';
    const trials = Math.max(1, options.trials ?? 1);
    const smallModel = options.models?.small ?? (isLive ? 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M' : 'local-deepseek-coder');
    const largeModel = options.models?.large ?? (isLive ? 'gguf/Qwen3.5-9B-GGUF:Q4_K_M' : 'escalation-frontier-model');

    const configDefs: Array<{
      config: ConfigName;
      label: string;
      primaryModel: string;
      recoveryModel?: string;
      enableM1: boolean;
      enableM3a: boolean;
      enableContextCompiler: boolean;
      enablePromptCompiler: boolean;
      enableIncrementalEdits: boolean;
      enableModelSelectionPolicy: boolean;
    }> = [
      {
        config: 'direct_1_5b',
        label: `Direct ${smallModel} (Unbounded, No Escalation)`,
        primaryModel: smallModel,
        enableM1: false,
        enableM3a: false,
        enableContextCompiler: false,
        enablePromptCompiler: false,
        enableIncrementalEdits: false,
        enableModelSelectionPolicy: false,
      },
      {
        config: 'direct_9b',
        label: `Direct ${largeModel} (Frontier Only)`,
        primaryModel: largeModel,
        enableM1: false,
        enableM3a: false,
        enableContextCompiler: false,
        enablePromptCompiler: false,
        enableIncrementalEdits: false,
        enableModelSelectionPolicy: false,
      },
      {
        config: 'governed_baseline',
        label: 'Governed Baseline (Regex M1, M2, M3a Escalation)',
        primaryModel: smallModel,
        recoveryModel: largeModel,
        enableM1: true,
        enableM3a: true,
        enableContextCompiler: false,
        enablePromptCompiler: false,
        enableIncrementalEdits: false,
        enableModelSelectionPolicy: false,
      },
      {
        config: 'governed_compiled',
        label: 'Governed + Context/Prompt Compiler v2 & Incremental Edits',
        primaryModel: smallModel,
        recoveryModel: largeModel,
        enableM1: true,
        enableM3a: true,
        enableContextCompiler: true,
        enablePromptCompiler: true,
        enableIncrementalEdits: true,
        enableModelSelectionPolicy: false,
      },
      {
        config: 'governed_model_selected',
        label: 'Governed + Compilers + Evidence-Based Model Selection',
        primaryModel: smallModel,
        recoveryModel: largeModel,
        enableM1: true,
        enableM3a: true,
        enableContextCompiler: true,
        enablePromptCompiler: true,
        enableIncrementalEdits: true,
        enableModelSelectionPolicy: true,
      },
      {
        config: 'adaptive_execution_engine',
        label: 'Adaptive Execution Engine v1 (Non-LLM First + Dynamic Tiers)',
        primaryModel: smallModel,
        recoveryModel: largeModel,
        enableM1: true,
        enableM3a: true,
        enableContextCompiler: true,
        enablePromptCompiler: true,
        enableIncrementalEdits: true,
        enableModelSelectionPolicy: true,
      },
    ];

    const measurements: Record<ConfigName, ConfigMeasurement[]> = {
      direct_1_5b: [],
      direct_9b: [],
      governed_baseline: [],
      governed_compiled: [],
      governed_model_selected: [],
      adaptive_execution_engine: [],
    };

    for (const cDef of configDefs) {
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

        let inTok: number | null;
        let outTok: number | null;
        let totTok: number | null;
        let dur: number | null;
        let cost: number | null;
        let switches = 0;
        let passed = false;
        let status = 'failed';
        let turns = 1;
        let finalModel = cDef.primaryModel;

        if (cDef.config === 'adaptive_execution_engine') {
          const engine = new AdaptiveExecutionEngine({
            bifrostClient,
            approvalHandler: createWorkspaceApprovalHandler(),
            smallModel: cDef.primaryModel,
            strongerModel: cDef.recoveryModel,
          });

          const result = await engine.runTask(task, { seed: t });
          inTok = extractObservation(result.run.usage.inputTokens);
          outTok = extractObservation(result.run.usage.outputTokens);
          totTok = inTok !== null && outTok !== null ? inTok + outTok : (inTok ?? outTok ?? null);
          dur = extractObservation(result.run.usage.duration);
          cost = extractObservation(result.run.usage.cost);
          passed = result.run.acceptance.status === 'passed';
          status = result.run.status;
          turns = result.controllerState.turnCount || 1;
          switches = result.controllerState.transitions.length;
          finalModel = result.run.agent.model ?? cDef.primaryModel;
        } else {
          const agent = new ProofBenchAgent({
            bifrostClient,
            approvalHandler: createWorkspaceApprovalHandler(),
            primaryModel: cDef.primaryModel,
            recoveryModel: cDef.recoveryModel,
            enableM1ContextBounding: cDef.enableM1,
            enableM2StagnationBreaker: true,
            enableM3aAutopsyEscalation: cDef.enableM3a,
            enableTavilyDocumentation: true,
            enableContextCompiler: cDef.enableContextCompiler,
            enablePromptCompiler: cDef.enablePromptCompiler,
            enableIncrementalEdits: cDef.enableIncrementalEdits,
            enableModelSelectionPolicy: cDef.enableModelSelectionPolicy,
          });

          const result = await agent.runTask(task, t);
          inTok = extractObservation(result.run.usage.inputTokens);
          outTok = extractObservation(result.run.usage.outputTokens);
          totTok = inTok !== null && outTok !== null ? inTok + outTok : null;
          dur = extractObservation(result.run.usage.duration);
          cost = extractObservation(result.run.usage.cost);
          passed = result.run.acceptance.status === 'passed';
          status = result.run.status;
          turns = result.trace.events.filter((e) => e.type === 'start' && e.message.includes('agent execution started')).length || 1;
          finalModel = result.run.agent.model ?? cDef.primaryModel;

          let lastM = cDef.primaryModel;
          for (const ev of result.trace.events) {
            if (ev.data && typeof ev.data.model === 'string' && ev.data.model !== lastM) {
              switches++;
              lastM = ev.data.model;
            }
          }
        }

        measurements[cDef.config].push({
          config: cDef.config,
          configLabel: cDef.label,
          taskId: task.id,
          taskTitle: task.title,
          trial: t,
          passed,
          status,
          inputTokens: inTok,
          outputTokens: outTok,
          totalTokens: totTok,
          durationMs: dur,
          costUsd: cost,
          turns,
          modelSwitches: switches,
          primaryModel: cDef.primaryModel,
          finalModel,
          routingProvider: isLive ? 'bifrost.live' : 'bifrost.simulation',
        });
      }
    }

    const computeAgg = (cfg: ConfigName, label: string): ConfigAggregate => {
      const ms = measurements[cfg];
      const passed = ms.filter((m) => m.passed);
      const passedCount = passed.length;
      const failedCount = ms.length - passedCount;
      const successRate = ms.length > 0 ? Number(((passedCount / ms.length) * 100).toFixed(1)) : 0;

      const validTokens = passed.map((m) => m.totalTokens).filter((v): v is number => typeof v === 'number');
      const avgTokens = validTokens.length > 0 ? Math.round(validTokens.reduce((a, b) => a + b, 0) / validTokens.length) : null;

      const validIn = passed.map((m) => m.inputTokens).filter((v): v is number => typeof v === 'number');
      const avgIn = validIn.length > 0 ? Math.round(validIn.reduce((a, b) => a + b, 0) / validIn.length) : null;

      const validOut = passed.map((m) => m.outputTokens).filter((v): v is number => typeof v === 'number');
      const avgOut = validOut.length > 0 ? Math.round(validOut.reduce((a, b) => a + b, 0) / validOut.length) : null;

      const validDur = passed.map((m) => m.durationMs).filter((v): v is number => typeof v === 'number');
      const avgDur = validDur.length > 0 ? Math.round(validDur.reduce((a, b) => a + b, 0) / validDur.length) : null;

      const allTokens = ms.map((m) => m.totalTokens).filter((v): v is number => typeof v === 'number');
      const totalTokensAll = allTokens.length === ms.length && allTokens.length > 0 ? allTokens.reduce((a, b) => a + b, 0) : null;

      const switchCount = ms.reduce((acc, m) => acc + m.modelSwitches, 0);

      return {
        config: cfg,
        configLabel: label,
        totalTrials: ms.length,
        passedTrials: passedCount,
        failedTrials: failedCount,
        successRatePercent: successRate,
        avgTotalTokensOnPass: avgTokens,
        avgInputTokensOnPass: avgIn,
        avgOutputTokensOnPass: avgOut,
        avgDurationMsOnPass: avgDur,
        totalTokensAllTrials: totalTokensAll,
        modelSwitchCount: switchCount,
      };
    };

    const summary: Record<ConfigName, ConfigAggregate> = {
      direct_1_5b: computeAgg('direct_1_5b', configDefs[0].label),
      direct_9b: computeAgg('direct_9b', configDefs[1].label),
      governed_baseline: computeAgg('governed_baseline', configDefs[2].label),
      governed_compiled: computeAgg('governed_compiled', configDefs[3].label),
      governed_model_selected: computeAgg('governed_model_selected', configDefs[4].label),
      adaptive_execution_engine: computeAgg('adaptive_execution_engine', configDefs[5].label),
    };

    const direct9bAgg = summary.direct_9b;
    const compiledAgg = summary.governed_compiled;
    const baselineAgg = summary.governed_baseline;

    let savingsVsDirect9bPercent: number | null = null;
    let savingsVsDirect9bComparable = false;
    let savingsVsDirect9bReason: string | undefined;

    if (direct9bAgg.passedTrials > 0 && compiledAgg.passedTrials > 0 && direct9bAgg.avgTotalTokensOnPass && compiledAgg.avgTotalTokensOnPass) {
      savingsVsDirect9bComparable = true;
      savingsVsDirect9bPercent = Number((((direct9bAgg.avgTotalTokensOnPass - compiledAgg.avgTotalTokensOnPass) / direct9bAgg.avgTotalTokensOnPass) * 100).toFixed(1));
    } else {
      savingsVsDirect9bReason = 'Incomparable: one or both configurations had 0 successful trials';
    }

    let savingsVsBaselinePercent: number | null = null;
    let savingsVsBaselineComparable = false;
    let savingsVsBaselineReason: string | undefined;

    if (baselineAgg.passedTrials > 0 && compiledAgg.passedTrials > 0 && baselineAgg.avgTotalTokensOnPass && compiledAgg.avgTotalTokensOnPass) {
      savingsVsBaselineComparable = true;
      savingsVsBaselinePercent = Number((((baselineAgg.avgTotalTokensOnPass - compiledAgg.avgTotalTokensOnPass) / baselineAgg.avgTotalTokensOnPass) * 100).toFixed(1));
    } else {
      savingsVsBaselineReason = 'Incomparable: baseline or compiled had 0 successful trials';
    }

    const evidenceSummary = `5-Config Benchmark on '${task.title}': direct_1.5B=${summary.direct_1_5b.successRatePercent}%, direct_9B=${summary.direct_9b.successRatePercent}%, governed_baseline=${summary.governed_baseline.successRatePercent}%, governed_compiled=${summary.governed_compiled.successRatePercent}%, governed_model_selected=${summary.governed_model_selected.successRatePercent}%. Compiled Token Savings: vs 9B=${savingsVsDirect9bPercent !== null ? `${savingsVsDirect9bPercent}%` : 'N/A'}, vs Baseline=${savingsVsBaselinePercent !== null ? `${savingsVsBaselinePercent}%` : 'N/A'}.`;

    return {
      taskId: task.id,
      taskTitle: task.title,
      trialsPerConfig: trials,
      measurements,
      summary,
      savingsVsDirect9B: {
        tokenSavingsPercent: savingsVsDirect9bPercent,
        comparable: savingsVsDirect9bComparable,
        reason: savingsVsDirect9bReason,
      },
      savingsVsGovernedBaseline: {
        tokenSavingsPercent: savingsVsBaselinePercent,
        comparable: savingsVsBaselineComparable,
        reason: savingsVsBaselineReason,
      },
      evidenceSummary,
    };
  }

  static async benchmarkSixConfigurations(
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
  ): Promise<SixConfigComparisonResult> {
    return this.benchmarkFiveConfigurations(task, options);
  }

  static async runAblationSuite(
    task: TaskSpec,
    options: {
      mode?: 'live' | 'simulation';
      models?: { small?: string; large?: string };
      embeddedGateway?: EmbeddedBifrostGateway;
    } = {}
  ): Promise<AblationSuiteResult> {
    const isLive = options.mode === 'live' || process.env.BIFROST_MODE === 'live';
    const smallModel = options.models?.small ?? (isLive ? 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M' : 'local-deepseek-coder');
    const largeModel = options.models?.large ?? (isLive ? 'gguf/Qwen3.5-9B-GGUF:Q4_K_M' : 'escalation-frontier-model');

    const variants: Array<{
      variant: AblationMeasurement['variant'];
      label: string;
      enableContextCompiler: boolean;
      enablePromptCompiler: boolean;
      enableIncrementalEdits: boolean;
      enableModelSelectionPolicy: boolean;
    }> = [
      {
        variant: 'baseline',
        label: 'Baseline (Raw Prompt & Unbounded Context)',
        enableContextCompiler: false,
        enablePromptCompiler: false,
        enableIncrementalEdits: false,
        enableModelSelectionPolicy: false,
      },
      {
        variant: 'context_only',
        label: 'Ablation: Context Compiler Only (Tree-sitter AST & Omission Ledger)',
        enableContextCompiler: true,
        enablePromptCompiler: false,
        enableIncrementalEdits: false,
        enableModelSelectionPolicy: false,
      },
      {
        variant: 'prompt_only',
        label: 'Ablation: Prompt Compiler Only (Invariant Prefix & Deduplication)',
        enableContextCompiler: false,
        enablePromptCompiler: true,
        enableIncrementalEdits: false,
        enableModelSelectionPolicy: false,
      },
      {
        variant: 'model_selection_only',
        label: 'Ablation: Model Selection Only (Observable Engineering Features)',
        enableContextCompiler: false,
        enablePromptCompiler: false,
        enableIncrementalEdits: false,
        enableModelSelectionPolicy: true,
      },
      {
        variant: 'full_optimization',
        label: 'Full Optimization (Context + Prompt + Incremental + Model Selection)',
        enableContextCompiler: true,
        enablePromptCompiler: true,
        enableIncrementalEdits: true,
        enableModelSelectionPolicy: true,
      },
    ];

    const measurements: AblationMeasurement[] = [];
    let baselineTokens: number | null = null;

    for (const v of variants) {
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
        primaryModel: smallModel,
        recoveryModel: largeModel,
        enableM1ContextBounding: true,
        enableM2StagnationBreaker: true,
        enableM3aAutopsyEscalation: true,
        enableTavilyDocumentation: true,
        enableContextCompiler: v.enableContextCompiler,
        enablePromptCompiler: v.enablePromptCompiler,
        enableIncrementalEdits: v.enableIncrementalEdits,
        enableModelSelectionPolicy: v.enableModelSelectionPolicy,
      });

      const result = await agent.runTask(task);
      const inTok = extractObservation(result.run.usage.inputTokens);
      const outTok = extractObservation(result.run.usage.outputTokens);
      const totTok = inTok !== null && outTok !== null ? inTok + outTok : null;
      const dur = extractObservation(result.run.usage.duration);
      const passed = result.run.acceptance.status === 'passed';

      if (v.variant === 'baseline' && passed && totTok !== null) {
        baselineTokens = totTok;
      }

      let savingsPercent: number | null = null;
      if (baselineTokens !== null && totTok !== null && passed && baselineTokens > 0) {
        savingsPercent = Number((((baselineTokens - totTok) / baselineTokens) * 100).toFixed(1));
      }

      measurements.push({
        variant: v.variant,
        label: v.label,
        passed,
        inputTokens: inTok,
        outputTokens: outTok,
        totalTokens: totTok,
        durationMs: dur,
        turns: result.trace.events.filter((e) => e.type === 'start' && e.message.includes('agent execution started')).length || 1,
        tokenSavingsVsBaselinePercent: savingsPercent,
      });
    }

    const fullOpt = measurements.find((m) => m.variant === 'full_optimization');
    const evidenceSummary = `Ablation on '${task.title}': full optimization achieved ${fullOpt?.tokenSavingsVsBaselinePercent !== null ? `${fullOpt?.tokenSavingsVsBaselinePercent}%` : 'N/A'} savings vs unoptimized baseline.`;

    return {
      taskId: task.id,
      taskTitle: task.title,
      variants: measurements,
      evidenceSummary,
    };
  }
}
