import {
  type AgentAdapter,
  RunRequest,
  RunRecord,
  ExecutionTrace,
  TaskSpec,
} from '../../../packages/contracts/src/index';
import { BifrostClient } from './gateway/client';
import { EmbeddedBifrostGateway } from './gateway/embedded';
import type { GovernancePolicy } from './governance/policy';
import {
  createDefaultPolicy,
  validateModelAgainstPolicy,
  isLocalDestination,
  TRUSTED_LOCAL_PROVIDERS,
  KNOWN_CLOUD_PROVIDERS,
} from './governance/policy';
import {
  HostApprovalEngine,
  createWorkspaceApprovalHandler,
  createScopedPriorApprovalHandler,
} from './governance/approval';
import { M1ContextSelector } from './context/m1-selector';
import { M2StagnationDetector } from './progress/m2-stagnation';
import { M3aFailureAutopsyBuilder } from './handoff/m3a-autopsy';
import { TavilyDocumentationVerifier } from './tavily/verifier';
import { ProofBenchAgent } from './runtime/agent';
import {
  ComparativeBenchmarkSuite,
  type StrategyName,
  type StrategyMeasurement,
  type StrategyAggregate,
  type StrategyComparisonResult,
  type ConfigName,
  type ConfigMeasurement,
  type ConfigAggregate,
  type FiveConfigComparisonResult,
  type AblationMeasurement,
  type AblationSuiteResult,
  type ControlledRoutingPolicy,
  type ControlledRoutingMeasurement,
  type ControlledRoutingAggregate,
  type ControlledRoutingBenchmarkOptions,
  type AttributionBreakdown,
  type ControlledRoutingBenchmarkResult,
} from './suite/benchmark';
import { TaskWorkspace, getCodingTasksDir } from './runtime/workspace';
import {
  ContextCompiler,
  TokenizerService,
  PromptCompiler,
  IncrementalEditManager,
  DeterministicModelSelector,
  MechanicalTransformer,
  type ContextCompilationResult,
  type CompiledPrompt,
  type WorkspaceRevisionSnapshot,
  type ModelSelectionDecision,
  type MechanicalFixCandidate,
  type MechanicalTransformResult,
} from './compiler/index';
import {
  ContextDocumentManager,
  DurableStore,
  type ExecutionTier,
  type EnginePhase,
  type ProjectContextData,
  type ControllerState,
  type DurableEvent,
  type StateCheckpointRecord,
  type TierTransitionRecord,
} from './persistence/index';
import {
  ModelRegistry,
  UniversalHandoffProtocol,
  OscillationDetector,
  type ModelDescriptor,
  type UniversalHandoffPacket,
  type TierTransitionProposal,
  type HandoffDirection,
} from './routing/index';
import {
  AdaptiveExecutionEngine,
  type AdaptiveExecutionEngineOptions,
  type EngineRunOptions,
  type EngineExecutionResult,
} from './controller/index';

export type {
  GovernancePolicy,
  StrategyName,
  StrategyMeasurement,
  StrategyAggregate,
  StrategyComparisonResult,
  ConfigName,
  ConfigMeasurement,
  ConfigAggregate,
  FiveConfigComparisonResult,
  AblationMeasurement,
  AblationSuiteResult,
  ContextCompilationResult,
  CompiledPrompt,
  WorkspaceRevisionSnapshot,
  ModelSelectionDecision,
  MechanicalFixCandidate,
  MechanicalTransformResult,
  ExecutionTier,
  EnginePhase,
  ProjectContextData,
  ControllerState,
  DurableEvent,
  StateCheckpointRecord,
  TierTransitionRecord,
  ModelDescriptor,
  UniversalHandoffPacket,
  TierTransitionProposal,
  HandoffDirection,
  AdaptiveExecutionEngineOptions,
  EngineRunOptions,
  EngineExecutionResult,
};

export {
  BifrostClient,
  EmbeddedBifrostGateway,
  createDefaultPolicy,
  validateModelAgainstPolicy,
  isLocalDestination,
  TRUSTED_LOCAL_PROVIDERS,
  KNOWN_CLOUD_PROVIDERS,
  HostApprovalEngine,
  createWorkspaceApprovalHandler,
  createScopedPriorApprovalHandler,
  M1ContextSelector,
  M2StagnationDetector,
  M3aFailureAutopsyBuilder,
  TavilyDocumentationVerifier,
  ProofBenchAgent,
  ComparativeBenchmarkSuite,
  TaskWorkspace,
  getCodingTasksDir,
  ContextCompiler,
  TokenizerService,
  PromptCompiler,
  IncrementalEditManager,
  DeterministicModelSelector,
  MechanicalTransformer,
  ContextDocumentManager,
  DurableStore,
  ModelRegistry,
  UniversalHandoffProtocol,
  OscillationDetector,
  AdaptiveExecutionEngine,
};

export type {
  ControlledRoutingPolicy,
  ControlledRoutingMeasurement,
  ControlledRoutingAggregate,
  ControlledRoutingBenchmarkOptions,
  AttributionBreakdown,
  ControlledRoutingBenchmarkResult,
};

export interface RunAdaptiveEngineOptions {
  gatewayUrl?: string;
  virtualKey?: string;
  maxTurns?: number;
  smallModel?: string;
  strongerModel?: string;
  onProgress?: (progress: string) => void;
}

export async function runAdaptiveEngine(
  task: TaskSpec,
  options: RunAdaptiveEngineOptions = {}
): Promise<{ run: RunRecord; trace: ExecutionTrace; report: import('../../../packages/contracts/src/index').EvidenceReport }> {
  const allowedTasks = new Set([
    'task-1-fix-failing-func',
    'task-2-missing-feature',
    'task-3-multi-file-regression',
    'task-4-version-freshness',
    'task-5-context-filtering',
    'task-6-deterministic-fix',
    'task-7-adaptive-pipeline',
    'task-8-deterministic-unused-var',
    'task-9-bidirectional-event-service',
    'task-10-sensor-fusion-aggregator',
  ]);

  if (!allowedTasks.has(task.id)) {
    throw new Error(`Task '${task.id}' is not in the allowed task scope.`);
  }

  const gatewayUrl = options.gatewayUrl ?? process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089';
  const virtualKey = options.virtualKey ?? process.env.BIFROST_VIRTUAL_KEY;

  // Live Gateway Preflight Check
  try {
    const res = await fetch(`${gatewayUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      throw new Error(`Gateway returned HTTP ${res.status}`);
    }
  } catch (err) {
    throw new Error(`Bifrost inference gateway is unreachable at ${gatewayUrl} (${(err as Error).message}). Live inference requires a running Bifrost HTTP daemon.`);
  }

  const liveClient = new BifrostClient({
    mode: 'live',
    gatewayUrl,
    virtualKey,
  });

  const ws = await TaskWorkspace.create(task.id);
  const engine = new AdaptiveExecutionEngine({
    bifrostClient: liveClient,
    smallModel: options.smallModel ?? process.env.BIFROST_DEFAULT_MODEL ?? 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M',
    strongerModel: options.strongerModel ?? process.env.BIFROST_RECOVERY_MODEL ?? 'gguf/Qwen3.5-9B-GGUF:Q4_K_M',
    approvalHandler: createWorkspaceApprovalHandler(),
    maxTurns: options.maxTurns ?? 5,
  });

  options.onProgress?.('AdaptiveExecutionEngine initialized; running turns...');
  const result = await engine.runTask(task, { workspacePath: ws.workspacePath });

  const { buildReport } = await import('../../../packages/report-engine/src/index');
  const report = buildReport(result.run);
  return {
    run: result.run,
    trace: result.trace,
    report,
  };
}

export const bifrost01: AgentAdapter = {
  descriptor: {
    version: '1',
    id: 'bifrost-01',
    name: 'Token-efficient coding agent',
    implementation: '01',
    runtime: 'typescript',
    revision: '0.1.0',
    model: 'opencode/deepseek-v4.1-flash-free',
  },
  capabilities: {
    execute: true,
    benchmarks: true,
    verify: true,
    native: false,
  },
  async run(input: unknown): Promise<{ run: RunRecord; trace: ExecutionTrace }> {
    const request = RunRequest.parse(input);
    if (request.agentId !== this.descriptor.id) {
      throw new Error('Unknown agent');
    }

    const allowedTasks = [
      'task-1-fix-failing-func',
      'task-2-missing-feature',
      'task-3-multi-file-regression',
      'task-4-version-freshness',
      'task-5-context-filtering',
      'task-6-deterministic-fix',
      'task-7-adaptive-pipeline',
      'task-8-deterministic-unused-var',
      'task-9-bidirectional-event-service',
      'task-10-sensor-fusion-aggregator',
    ];

    if (allowedTasks.includes(request.task.id)) {
      const result = await runAdaptiveEngine(request.task);
      return { run: result.run, trace: result.trace };
    }

    const agent = new ProofBenchAgent({ approvalHandler: createWorkspaceApprovalHandler() });
    const result = await agent.runTask(request.task, request.seed);

    return {
      run: result.run,
      trace: result.trace,
    };
  },
};
