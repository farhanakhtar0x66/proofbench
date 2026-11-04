import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import {
  AgentDescriptor,
  TaskSpec,
  WorkspaceIdentity,
  UsageRecord,
  ExecutionTrace,
} from '../../../../packages/contracts/src/index';
import { CodingAgentCliAdapter, AgentExecutionResult } from './types';
import { getCodingTasksDir } from '../workspace';

export interface MockAdapterOptions {
  id?: string;
  name?: string;
  behavior?: 'solve' | 'fail' | 'timeout' | 'malformed' | 'error';
  tokenBehavior?: 'known' | 'missing' | 'incomparable';
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
}

export class MockCodingAgentAdapter implements CodingAgentCliAdapter {
  public descriptor: AgentDescriptor;
  private options: MockAdapterOptions;

  constructor(options: MockAdapterOptions = {}) {
    this.options = options;
    const id = options.id ?? 'mock-coding-agent';
    const name = options.name ?? 'Deterministic Mock Coding Agent';
    this.descriptor = AgentDescriptor.parse({
      version: '1',
      id,
      name,
      implementation: '02',
      runtime: 'mock',
      revision: 'mock-bifrost-02',
      model: null,
    });
  }

  async runTask(
    task: TaskSpec,
    workspace: WorkspaceIdentity,
    signal?: AbortSignal
  ): Promise<AgentExecutionResult> {
    const startTime = performance.now();
    const runId = randomUUID();
    const behavior = this.options.behavior ?? 'solve';

    if (signal?.aborted) {
      return this.buildResult(runId, 'cancelled', null, 'Execution was cancelled before start', performance.now() - startTime, [
        { sequence: 0, at: new Date().toISOString(), type: 'error', message: 'Run was cancelled before execution' },
      ]);
    }

    if (behavior === 'timeout') {
      // Simulate timeout
      await new Promise((resolve) => setTimeout(resolve, 200));
      return this.buildResult(runId, 'timed_out', null, 'Agent execution timed out', performance.now() - startTime, [
        { sequence: 0, at: new Date().toISOString(), type: 'start', message: 'Mock agent started' },
        { sequence: 1, at: new Date().toISOString(), type: 'error', message: 'Mock agent timed out' },
      ]);
    }

    if (behavior === 'error') {
      return this.buildResult(runId, 'error', 1, 'Mock agent fatal initialization failure', performance.now() - startTime, [
        { sequence: 0, at: new Date().toISOString(), type: 'error', message: 'Mock agent fatal error' },
      ]);
    }

    if (behavior === 'malformed') {
      return this.buildResult(runId, 'failed', 0, '{{{INVALID_MALFORMED_OUTPUT', performance.now() - startTime, [
        { sequence: 0, at: new Date().toISOString(), type: 'start', message: 'Mock agent started' },
        { sequence: 1, at: new Date().toISOString(), type: 'output', message: '{{{INVALID_MALFORMED_OUTPUT' },
      ]);
    }

    if (behavior === 'fail') {
      // Intentionally introduce broken code
      const libPath = path.join(workspace.path, 'src', 'lib.rs');
      try {
        await fs.writeFile(libPath, 'compile_error!("Deterministic mock failure");\n', 'utf8');
      } catch {
        // Ignore write error
      }
      return this.buildResult(runId, 'completed', 0, 'Introduced intentional failure patch', performance.now() - startTime, [
        { sequence: 0, at: new Date().toISOString(), type: 'start', message: 'Mock agent started' },
        { sequence: 1, at: new Date().toISOString(), type: 'output', message: 'Introduced intentional failure patch' },
        { sequence: 2, at: new Date().toISOString(), type: 'finish', message: 'Mock agent completed execution' },
      ]);
    }

    // Default 'solve': apply solution from task fixture
    const tasksDir = getCodingTasksDir();
    const solutionDir = path.join(tasksDir, task.id, 'solution');
    let patched = false;
    try {
      await copyFilesRecursive(solutionDir, workspace.path);
      patched = true;
    } catch {
      // Solution might not exist for some custom tasks
      patched = false;
    }

    const elapsed = this.options.durationMs ?? (performance.now() - startTime);
    const outputMessage = patched
      ? `Applied solution files for ${task.id} to workspace`
      : `Executed task ${task.id} with no-op solution`;

    return this.buildResult(runId, 'completed', 0, outputMessage, elapsed, [
      { sequence: 0, at: new Date().toISOString(), type: 'start', message: `Mock agent started for task ${task.id}` },
      { sequence: 1, at: new Date().toISOString(), type: 'output', message: outputMessage },
      { sequence: 2, at: new Date().toISOString(), type: 'finish', message: 'Mock agent finished execution successfully' },
    ]);
  }

  private buildResult(
    runId: string,
    status: 'completed' | 'failed' | 'timed_out' | 'cancelled' | 'error',
    exitCode: number | null,
    output: string,
    durationMs: number,
    events: Array<{ sequence: number; at: string; type: 'start' | 'output' | 'check' | 'error' | 'finish'; message: string }>
  ): AgentExecutionResult {
    const tokenBehavior = this.options.tokenBehavior ?? 'missing';
    let inputTokens: UsageRecord['inputTokens'];
    let outputTokens: UsageRecord['outputTokens'];

    if (tokenBehavior === 'known') {
      inputTokens = {
        status: 'known',
        value: this.options.inputTokens ?? 1500,
        unit: 'tokens',
        source: 'mock.tokens.input',
        scope: 'offline_mock_test_scope',
      };
      outputTokens = {
        status: 'known',
        value: this.options.outputTokens ?? 350,
        unit: 'tokens',
        source: 'mock.tokens.output',
        scope: 'offline_mock_test_scope',
      };
    } else if (tokenBehavior === 'incomparable') {
      inputTokens = {
        status: 'incomparable',
        reason: 'Mock token scope uses incompatible byte-pair vocabulary',
      };
      outputTokens = {
        status: 'incomparable',
        reason: 'Mock token scope uses incompatible byte-pair vocabulary',
      };
    } else {
      inputTokens = {
        status: 'missing',
        reason: 'Deterministic mock adapter does not call a language model',
      };
      outputTokens = {
        status: 'missing',
        reason: 'Deterministic mock adapter does not call a language model',
      };
    }

    const usage = UsageRecord.parse({
      version: '1',
      inputTokens,
      outputTokens,
      duration: {
        status: 'known',
        value: Math.max(1, Math.round(durationMs)),
        unit: 'ms',
        source: 'performance.now',
        scope: 'mock adapter turn duration',
      },
      cost: {
        status: 'missing',
        reason: 'Deterministic mock adapter incurs no external API cost',
      },
    });

    const trace = ExecutionTrace.parse({
      version: '1',
      runId,
      events,
    });

    return {
      agent: this.descriptor,
      status,
      exitCode,
      output,
      usage,
      trace,
      durationMs,
    };
  }
}

async function copyFilesRecursive(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true });
      await copyFilesRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
