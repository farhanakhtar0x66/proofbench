import { randomUUID } from 'node:crypto';
import {
  BenchmarkSession,
  ComparisonReport,
  PerAgentOutcome,
  WorkspaceIdentity,
  TaskSpec,
} from '../../../packages/contracts/src/index';
import { CodingAgentCliAdapter } from './adapters/types';
import { runBenchmarkOnTask } from './runner';

export interface SessionRunOptions {
  task: TaskSpec;
  adapters: CodingAgentCliAdapter[];
  signal?: AbortSignal;
  keepWorkspaces?: boolean;
}

export interface SessionRunResult {
  session: BenchmarkSession;
  comparisonReport: ComparisonReport;
  workspaces: WorkspaceIdentity[];
  outcomes: PerAgentOutcome[];
}

export async function runBenchmarkSession(options: SessionRunOptions): Promise<SessionRunResult> {
  const { task, adapters, signal, keepWorkspaces = false } = options;
  const sessionId = `session-${randomUUID().slice(0, 12)}`;
  const comparisonReportId = `comparison-${randomUUID().slice(0, 12)}`;
  const startedAt = new Date().toISOString();

  const workspaces: WorkspaceIdentity[] = [];
  const outcomes: PerAgentOutcome[] = [];

  for (const adapter of adapters) {
    if (signal?.aborted) {
      break;
    }
    const result = await runBenchmarkOnTask({
      task,
      adapter,
      signal,
      keepWorkspace: keepWorkspaces,
    });
    outcomes.push(result.outcome);
  }

  const finishedAt = new Date().toISOString();
  let sessionStatus: BenchmarkSession['status'] = 'completed';
  if (signal?.aborted) {
    sessionStatus = 'cancelled';
  } else if (outcomes.length === 0) {
    sessionStatus = 'failed';
  }

  // Token comparability assessment
  let comparableTokens = true;
  let tokenScopeNote = 'Token metrics compared across runs.';

  if (outcomes.length < 2) {
    comparableTokens = false;
    tokenScopeNote = 'Fewer than two agents executed in session; comparison unavailable.';
  } else {
    for (const outcome of outcomes) {
      if (outcome.usage.inputTokens.status !== 'known' || outcome.usage.outputTokens.status !== 'known') {
        comparableTokens = false;
        tokenScopeNote = 'One or more agents had missing or incomparable token observations; token comparison is disallowed.';
        break;
      }
    }
    if (comparableTokens) {
      // Check if scopes match
      const firstInput = outcomes[0].usage.inputTokens;
      const firstSource = firstInput.status === 'known' ? firstInput.source : '';
      for (let i = 1; i < outcomes.length; i++) {
        const otherInput = outcomes[i].usage.inputTokens;
        const otherSource = otherInput.status === 'known' ? otherInput.source : '';
        if (firstSource !== otherSource) {
          comparableTokens = false;
          tokenScopeNote = `Token sources differ (${firstSource} vs ${otherSource}); incompatible accounting methods cannot be directly ranked.`;
          break;
        }
      }
    }
  }

  const session = BenchmarkSession.parse({
    version: '1',
    id: sessionId,
    taskId: task.id,
    task,
    status: sessionStatus,
    agents: adapters.map((a) => a.descriptor),
    workspaces,
    outcomes,
    startedAt,
    finishedAt,
    comparisonReportId,
  });

  const passedCount = outcomes.filter((o) => o.acceptance.status === 'passed').length;
  const summary = `Benchmark session ${sessionId} on ${task.title}: ${passedCount}/${outcomes.length} agents passed acceptance tests.`;

  const comparisonReport = ComparisonReport.parse({
    version: '1',
    id: comparisonReportId,
    sessionId,
    taskId: task.id,
    createdAt: finishedAt,
    outcomes,
    comparability: {
      comparableTokens,
      tokenScopeNote,
      comparableDurations: true,
    },
    summary,
    limitations: [
      'Acceptance verified by deterministic unit test execution in independent workspaces.',
      'Token observations from different model providers or CLI accounting methods must not be ranked as equivalent.',
    ],
  });

  return {
    session,
    comparisonReport,
    workspaces,
    outcomes,
  };
}
