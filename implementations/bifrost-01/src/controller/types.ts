import {
  RunRecord,
  ExecutionTrace,
  EvidenceReport,
} from '../../../../packages/contracts/src/index';
import { GovernancePolicy } from '../governance/policy';
import { HostApprovalHandler } from '../governance/approval';
import { EmbeddedBifrostGateway } from '../gateway/embedded';
import { BifrostClient } from '../gateway/client';
import { ControllerState } from '../persistence/types';

export type EngineRoutingPolicy =
  | 'direct_small'
  | 'direct_frontier'
  | 'escalation_only'
  | 'bidirectional_adaptive';

export interface AdaptiveExecutionEngineOptions {
  bifrostClient?: BifrostClient;
  embeddedGateway?: EmbeddedBifrostGateway;
  policy?: Partial<GovernancePolicy>;
  approvalHandler?: HostApprovalHandler;
  smallModel?: string;
  strongerModel?: string;
  maxTurns?: number;
  enableTavily?: boolean;
  enableOscillationBreaker?: boolean;
  routingPolicy?: EngineRoutingPolicy;
}

export interface EngineRunOptions {
  workspacePath?: string;
  seed?: number;
  resumeFromCheckpointId?: string;
  runId?: string;
}

export interface EngineExecutionResult {
  run: RunRecord;
  trace: ExecutionTrace;
  report: EvidenceReport;
  contextDocument: string;
  controllerState: ControllerState;
  avoidedModelRequests: number;
  deterministicOperationsCount: number;
  transitionsCount: number;
  deterministicCpuDurationMs: number;
  controllerCpuMs?: number;
  testSubprocessWallMs?: number; // Renamed from childProcessCpuMs to accurately reflect wall-clock measurement
  subprocessCpuMs?: number | null; // Measured subprocess CPU if available (null when process CPU is unisolated)
  childProcessCpuMs?: number; // Kept as alias for backwards compatibility
  wallDurationMs?: number;
  inferenceDurationMs: number;
}
