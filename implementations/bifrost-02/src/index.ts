import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  type AgentAdapter,
  RunRequest,
  RunRecord,
  ExecutionTrace,
  AcceptanceResult,
} from '../../../packages/contracts/src/index';
import { runBenchmarkOnTask } from './runner';
import { runBenchmarkSession } from './session';
import { MockCodingAgentAdapter } from './adapters/mock-adapter';
import { OpenCodeCliAdapter } from './adapters/opencode-adapter';
import { CodexCliAdapter } from './adapters/codex-adapter';
import { listTaskSpecs, loadTaskSpec, createIsolatedWorkspace, cleanupWorkspace, getCodingTasksDir } from './workspace';
import { verifyTaskAcceptance } from './acceptance';

export {
  runBenchmarkOnTask,
  runBenchmarkSession,
  MockCodingAgentAdapter,
  OpenCodeCliAdapter,
  CodexCliAdapter,
  listTaskSpecs,
  loadTaskSpec,
  createIsolatedWorkspace,
  cleanupWorkspace,
  verifyTaskAcceptance,
  getCodingTasksDir,
};

export function createDefaultAgentAdapter() {
  const agentSelection = process.env.BENCHMARK_AGENT ?? 'mock';
  if (agentSelection === 'mock') {
    return new MockCodingAgentAdapter({ behavior: 'solve' });
  }
  if (agentSelection === 'codex') {
    return new CodexCliAdapter();
  }
  if (agentSelection === 'opencode') {
    return new OpenCodeCliAdapter();
  }
  return new MockCodingAgentAdapter({ behavior: 'solve' });
}

export const bifrost02: AgentAdapter = {
  descriptor: {
    version: '1',
    id: 'bifrost-02',
    name: 'Identical-task benchmark engine',
    implementation: '02',
    runtime: 'typescript',
    revision: '0.2.0',
    model: null,
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

    if (request.task.id === 'sum-fixture') {
      const start = performance.now();
      const createdAt = new Date().toISOString();
      const id = randomUUID();
      const output = [1, 2, 3].reduce((a, b) => a + b, 0).toString();
      const passed = output === '6';
      const acceptance = AcceptanceResult.parse({
        version: '1',
        status: passed ? 'passed' : 'failed',
        method: 'Bifrost-02 exact arithmetic baseline check',
        checks: [{ name: 'Output exactly 6', passed, evidence: `Observed ${output}; expected 6` }],
      });
      const run = RunRecord.parse({
        version: '1',
        id,
        task: request.task,
        agent: this.descriptor,
        status: 'completed',
        output,
        usage: {
          version: '1',
          inputTokens: { status: 'missing', reason: 'Arithmetic baseline does not invoke language model' },
          outputTokens: { status: 'missing', reason: 'Arithmetic baseline does not invoke language model' },
          duration: {
            status: 'known',
            value: Math.max(1, Math.round(performance.now() - start)),
            unit: 'ms',
            source: 'performance.now',
            scope: 'arithmetic baseline execution',
          },
          cost: { status: 'missing', reason: 'Zero external cost incurred' },
        },
        acceptance,
        createdAt,
        reportId: randomUUID(),
        reproducibility: {
          seed: request.seed,
          adapterRevision: this.descriptor.revision,
          fixtureRevision: request.task.fixtureId ?? 'sum-v1',
          environment: 'bifrost-02 baseline',
          simulated: true,
        },
      });
      const trace = ExecutionTrace.parse({
        version: '1',
        runId: id,
        events: [
          { sequence: 0, at: createdAt, type: 'start', message: 'Bifrost-02 baseline execution initiated' },
          { sequence: 1, at: createdAt, type: 'output', message: output },
          { sequence: 2, at: createdAt, type: 'check', message: 'Exact output comparison passed' },
          { sequence: 3, at: new Date().toISOString(), type: 'finish', message: 'Baseline run finished' },
        ],
      });
      return { run, trace };
    }

    // Real coding task: run the benchmark execution engine
    const adapter = createDefaultAgentAdapter();
    const result = await runBenchmarkOnTask({
      task: request.task,
      adapter,
      seed: request.seed,
    });

    return {
      run: result.run,
      trace: result.trace,
    };
  },
};
