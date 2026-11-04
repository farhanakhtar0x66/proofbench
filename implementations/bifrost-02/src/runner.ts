import { randomUUID } from 'node:crypto';
import {
  RunRecord,
  ExecutionTrace,
  EvidenceReport,
  PerAgentOutcome,
  TaskSpec,
} from '../../../packages/contracts/src/index';
import { CodingAgentCliAdapter } from './adapters/types';
import { createIsolatedWorkspace, cleanupWorkspace } from './workspace';
import { verifyTaskAcceptance } from './acceptance';

export interface BenchmarkRunOptions {
  task: TaskSpec;
  adapter: CodingAgentCliAdapter;
  seed?: number;
  signal?: AbortSignal;
  keepWorkspace?: boolean;
}

export interface BenchmarkRunArtifacts {
  run: RunRecord;
  trace: ExecutionTrace;
  report: EvidenceReport;
  outcome: PerAgentOutcome;
}

export async function runBenchmarkOnTask(options: BenchmarkRunOptions): Promise<BenchmarkRunArtifacts> {
  const { task, adapter, seed = 0, signal, keepWorkspace = false } = options;

  // 1. Create independent, isolated workspace from frozen task template
  const workspace = await createIsolatedWorkspace(task.id, adapter.descriptor.id);

  let agentResult;
  try {
    // 2. Run coding agent inside isolated workspace
    agentResult = await adapter.runTask(task, workspace, signal);

    // 3. Run independent acceptance tests against the workspace
    const acceptance = await verifyTaskAcceptance(workspace.path, task);

    // Record check event into the agent trace
    agentResult.trace.events.push({
      sequence: agentResult.trace.events.length,
      at: new Date().toISOString(),
      type: 'check',
      message: `Independent acceptance status: ${acceptance.status} (${acceptance.method})`,
      data: { checks: acceptance.checks },
    });

    // 4. Construct valid contracts
    const runId = agentResult.trace.runId;
    const reportId = randomUUID();
    const createdAt = new Date().toISOString();

    const runStatus: RunRecord['status'] =
      acceptance.status === 'passed' && agentResult.status === 'completed'
        ? 'completed'
        : 'failed';

    const run = RunRecord.parse({
      version: '1',
      id: runId,
      task,
      agent: adapter.descriptor,
      status: runStatus,
      output: agentResult.output,
      usage: agentResult.usage,
      acceptance,
      createdAt,
      reportId,
      reproducibility: {
        seed,
        adapterRevision: adapter.descriptor.revision,
        fixtureRevision: task.fixtureId ?? 'unknown',
        environment: `isolated-workspace-${process.platform}-${process.arch}`,
        simulated: adapter.descriptor.runtime === 'mock',
      },
    });

    const limitations: string[] = [
      'Acceptance check is executed by independent unit test suite, not by agent self-report.',
      'Unsandboxed local process boundaries rely on path isolation and environment scrubbing; OS container sandboxing not enforced.',
    ];
    if (run.usage.inputTokens.status === 'missing') {
      limitations.push('Token telemetry was not emitted by the agent CLI; missing tokens are not counted as zero.');
    }

    const report = EvidenceReport.parse({
      version: '1',
      id: reportId,
      runId,
      createdAt,
      summary: `Benchmark run of ${adapter.descriptor.name} on ${task.title}: ${acceptance.status.toUpperCase()} (${runStatus})`,
      acceptance,
      usage: agentResult.usage,
      verification: null,
      limitations,
    });

    const outcome = PerAgentOutcome.parse({
      version: '1',
      agentId: adapter.descriptor.id,
      agentName: adapter.descriptor.name,
      status: agentResult.status,
      exitCode: agentResult.exitCode,
      durationMs: agentResult.durationMs,
      acceptance,
      usage: agentResult.usage,
      runId,
      reportId,
      error: agentResult.error,
    });

    return {
      run,
      trace: agentResult.trace,
      report,
      outcome,
    };
  } finally {
    if (!keepWorkspace) {
      await cleanupWorkspace(workspace.path);
    }
  }
}
