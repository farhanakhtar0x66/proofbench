import {
  AgentDescriptor,
  TaskSpec,
  WorkspaceIdentity,
  UsageRecord,
  ExecutionTrace,
} from '../../../../packages/contracts/src/index';

export interface AgentExecutionResult {
  agent: AgentDescriptor;
  status: 'completed' | 'failed' | 'timed_out' | 'cancelled' | 'error';
  exitCode: number | null;
  output: string;
  usage: UsageRecord;
  trace: ExecutionTrace;
  durationMs: number;
  error?: string;
}

export interface CodingAgentCliAdapter {
  descriptor: AgentDescriptor;
  runTask(
    task: TaskSpec,
    workspace: WorkspaceIdentity,
    signal?: AbortSignal
  ): Promise<AgentExecutionResult>;
}
