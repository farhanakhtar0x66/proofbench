/**
 * ProofBench Adaptive Execution Engine v1 — Persistence Types
 * Defines schemas for CONTEXT.MD project memory and .proofbench/ durable state.
 */

export type ExecutionTier = 'NON_LLM' | 'SMALL_LLM' | 'STRONGER_LLM' | 'HALT';

export type EnginePhase =
  | 'ADMISSION'
  | 'LOAD_CONTEXT'
  | 'ANALYZE'
  | 'PREPARE'
  | 'SELECT_TIER'
  | 'INFER_OR_EXECUTE'
  | 'VALIDATE'
  | 'APPROVAL'
  | 'VERIFY'
  | 'CHECKPOINT'
  | 'DECIDE'
  | 'COMPLETE'
  | 'HALTED';

export interface ProjectIdentity {
  projectName: string;
  language: string;
  stack: string;
  repositoryRoot: string;
  sourceRevision: string; // SHA-256 composite workspace hash
}

export interface OriginalRequirements {
  taskId: string;
  taskTitle: string;
  taskPrompt: string;
  acceptanceCriteria: string[];
  userPreferences?: Record<string, string>;
}

export interface ProjectArchitecture {
  relevantModules: string[];
  existingInterfaces: string[];
  verifiedDependencies: string[];
}

export interface ActiveTaskState {
  taskId: string;
  currentPhase: EnginePhase;
  responsibleTier: ExecutionTier;
  remainingWork: string;
}

export interface AcceptedDecision {
  id: string;
  decision: string;
  rationale: string;
  verifiedAt: string;
  evidenceRef?: string;
}

export interface VerifiedProgressItem {
  id: string;
  type: 'edit' | 'check' | 'test';
  description: string;
  timestamp: string;
  revision: string;
}

export interface KnownFailureItem {
  id: string;
  errorType: 'compiler_diagnostic' | 'test_failure' | 'unresolved_dependency';
  details: string;
  attemptNumber: number;
}

export interface NextActionItem {
  step: string;
  requiredEvidence: string;
  suggestedTier: ExecutionTier;
}

export interface EvidenceReference {
  id: string;
  type: 'run' | 'trace' | 'patch' | 'test_output';
  pathOrId: string;
  summary: string;
}

export interface ProjectCheckpoint {
  stateRevision: string;
  sourceRevision: string;
  lastVerifiedTransition: string;
  timestamp: string;
}

export interface ProjectContextData {
  identity: ProjectIdentity;
  requirements: OriginalRequirements;
  architecture: ProjectArchitecture;
  activeTask: ActiveTaskState;
  acceptedDecisions: AcceptedDecision[];
  verifiedProgress: VerifiedProgressItem[];
  knownFailures: KnownFailureItem[];
  nextAction: NextActionItem;
  evidenceReferences: EvidenceReference[];
  checkpoint: ProjectCheckpoint;
}

export interface TierTransitionRecord {
  id: string;
  fromTier: ExecutionTier;
  toTier: ExecutionTier;
  reason: string;
  timestamp: string;
  sourceRevision: string;
  evidenceRef?: string;
  authorizedBy: 'host_engine' | 'user_override';
}

export interface ControllerState {
  version: '1';
  runId: string;
  taskId: string;
  currentPhase: EnginePhase;
  currentTier: ExecutionTier;
  sourceRevision: string;
  stateRevision: string;
  turnCount: number;
  totalTokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  deterministicOperationsCount: number;
  transitions: TierTransitionRecord[];
  status: 'running' | 'completed' | 'halted' | 'failed';
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DurableEvent {
  eventId: string;
  sequence: number;
  timestamp: string;
  type: string;
  phase: EnginePhase;
  tier: ExecutionTier;
  sourceRevision: string;
  data: Record<string, unknown>;
}

export interface StateCheckpointRecord {
  checkpointId: string;
  stateRevision: string;
  sourceRevision: string;
  phase: EnginePhase;
  tier: ExecutionTier;
  timestamp: string;
  stateSnapshot: ControllerState;
  contextSnapshot: ProjectContextData;
}
