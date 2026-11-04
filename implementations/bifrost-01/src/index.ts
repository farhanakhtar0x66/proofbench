import {
  type AgentAdapter,
  RunRequest,
  RunRecord,
  ExecutionTrace,
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
} from './suite/benchmark';
import { TaskWorkspace, getCodingTasksDir } from './runtime/workspace';
import {
  ContextCompiler,
  TokenizerService,
  PromptCompiler,
  IncrementalEditManager,
  DeterministicModelSelector,
  type ContextCompilationResult,
  type CompiledPrompt,
  type WorkspaceRevisionSnapshot,
  type ModelSelectionDecision,
} from './compiler/index';

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
};

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

    const agent = new ProofBenchAgent({ approvalHandler: createWorkspaceApprovalHandler() });
    const result = await agent.runTask(request.task, request.seed);

    return {
      run: result.run,
      trace: result.trace,
    };
  },
};
