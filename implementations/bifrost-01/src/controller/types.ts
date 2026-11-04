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
}

export interface EngineRunOptions {
  workspacePath?: string;
  seed?: number;
  resumeFromCheckpointId?: string;
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
}
