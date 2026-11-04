import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  AgentDescriptor,
  TaskSpec,
  WorkspaceIdentity,
  UsageRecord,
  ExecutionTrace,
} from '../../../../packages/contracts/src/index';
import { CodingAgentCliAdapter, AgentExecutionResult } from './types';
import { runBoundedProcess } from '../process-runner';

export interface CodexAdapterOptions {
  model?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  cliPath?: string;
}

export class CodexCliAdapter implements CodingAgentCliAdapter {
  public descriptor: AgentDescriptor;
  private model: string | null;
  private timeoutMs: number;
  private maxOutputBytes: number;
  private cliPath: string;

  constructor(options: CodexAdapterOptions = {}) {
    this.model = options.model ?? null;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxOutputBytes = options.maxOutputBytes ?? 4 * 1024 * 1024;
    this.cliPath = options.cliPath ?? 'codex';

    this.descriptor = AgentDescriptor.parse({
      version: '1',
      id: 'codex-cli',
      name: 'Codex CLI Agent',
      implementation: '02',
      runtime: 'typescript',
      revision: 'codex-cli-0.165.0',
      model: this.model,
    });
  }

  async runTask(
    task: TaskSpec,
    workspace: WorkspaceIdentity,
    signal?: AbortSignal
  ): Promise<AgentExecutionResult> {
    const runId = randomUUID();
    const outputFile = path.join(workspace.path, '.proofbench_codex_output.txt');

    const args = [
      'exec',
      '--json',
      '--ephemeral',
      '-s',
      'workspace-write',
      '-C',
      workspace.path,
      '--color',
      'never',
      '--skip-git-repo-check',
      '-o',
      outputFile,
    ];

    if (this.model) {
      args.push('-m', this.model);
    }

    args.push(task.prompt);

    const result = await runBoundedProcess({
      command: this.cliPath,
      args,
      cwd: workspace.path,
      timeoutMs: this.timeoutMs,
      maxOutputBytes: this.maxOutputBytes,
      signal,
    });

    const lines = result.stdout.split('\n').filter((l) => l.trim().length > 0);
    const traceEvents: ExecutionTrace['events'] = [];
    let seq = 0;

    traceEvents.push({
      sequence: seq++,
      at: new Date().toISOString(),
      type: 'start',
      message: `Codex CLI exec invocation started (sandbox: workspace-write)`,
      data: { command: this.cliPath, cwd: workspace.path },
    });

    let observedTokens = false;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let lastErrorMessage = '';

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const eventType = parsed.type;
        const now = new Date().toISOString();

        if (eventType === 'thread.started') {
          traceEvents.push({
            sequence: seq++,
            at: now,
            type: 'output',
            message: `Codex thread initialized: ${parsed.thread_id}`,
            data: { threadId: parsed.thread_id },
          });
        } else if (eventType === 'turn.started') {
          traceEvents.push({
            sequence: seq++,
            at: now,
            type: 'output',
            message: 'Codex turn started',
          });
        } else if (eventType === 'error' || eventType === 'turn.failed') {
          const msg = parsed.message || parsed.error?.message || 'Codex execution error';
          lastErrorMessage = msg;
          traceEvents.push({
            sequence: seq++,
            at: now,
            type: 'error',
            message: msg,
            data: parsed,
          });
        } else if (parsed.tokens) {
          // In case future version reports tokens
          if (typeof parsed.tokens.input === 'number' && typeof parsed.tokens.output === 'number') {
            totalInputTokens += parsed.tokens.input;
            totalOutputTokens += parsed.tokens.output;
            observedTokens = true;
          }
          traceEvents.push({
            sequence: seq++,
            at: now,
            type: 'output',
            message: `Reported tokens: in=${parsed.tokens.input}, out=${parsed.tokens.output}`,
            data: parsed.tokens,
          });
        } else {
          traceEvents.push({
            sequence: seq++,
            at: now,
            type: 'output',
            message: `${eventType || 'event'}: ${line.slice(0, 300)}`,
          });
        }
      } catch {
        traceEvents.push({
          sequence: seq++,
          at: new Date().toISOString(),
          type: 'output',
          message: line.slice(0, 500),
        });
      }
    }

    // Try reading agent last message output if present
    let lastOutput = '';
    try {
      lastOutput = await fs.readFile(outputFile, 'utf8');
      if (lastOutput.trim().length > 0) {
        traceEvents.push({
          sequence: seq++,
          at: new Date().toISOString(),
          type: 'output',
          message: `Last agent message: ${lastOutput.slice(0, 500)}`,
        });
      }
    } catch {
      // Output file may not have been created if turn failed
    }

    if (result.timedOut) {
      traceEvents.push({
        sequence: seq++,
        at: new Date().toISOString(),
        type: 'error',
        message: `Codex CLI timed out after ${this.timeoutMs}ms`,
      });
    } else if (result.cancelled) {
      traceEvents.push({
        sequence: seq++,
        at: new Date().toISOString(),
        type: 'error',
        message: 'Codex CLI execution cancelled',
      });
    } else {
      traceEvents.push({
        sequence: seq++,
        at: new Date().toISOString(),
        type: 'finish',
        message: `Codex CLI completed with exit code ${result.exitCode}`,
      });
    }

    let status: AgentExecutionResult['status'] = 'completed';
    if (result.timedOut) status = 'timed_out';
    else if (result.cancelled) status = 'cancelled';
    else if (result.exitCode !== 0 || lastErrorMessage) status = 'failed';

    const inputTokens: UsageRecord['inputTokens'] = observedTokens
      ? {
          status: 'known',
          value: totalInputTokens,
          unit: 'tokens',
          source: 'codex.exec.tokens.input',
          scope: 'codex_turn_cumulative',
        }
      : {
          status: 'missing',
          reason: 'Codex CLI 0.165.0 exec stream does not emit token accounting metrics',
        };

    const outputTokens: UsageRecord['outputTokens'] = observedTokens
      ? {
          status: 'known',
          value: totalOutputTokens,
          unit: 'tokens',
          source: 'codex.exec.tokens.output',
          scope: 'codex_turn_cumulative',
        }
      : {
          status: 'missing',
          reason: 'Codex CLI 0.165.0 exec stream does not emit token accounting metrics',
        };

    const usage = UsageRecord.parse({
      version: '1',
      inputTokens,
      outputTokens,
      duration: {
        status: 'known',
        value: Math.max(1, Math.round(result.durationMs)),
        unit: 'ms',
        source: 'performance.now',
        scope: 'codex CLI exec subprocess',
      },
      cost: {
        status: 'missing',
        reason: 'Subscription auth mode; external billing cost telemetry not reported',
      },
    });

    const trace = ExecutionTrace.parse({
      version: '1',
      runId,
      events: traceEvents,
    });

    return {
      agent: this.descriptor,
      status,
      exitCode: result.exitCode,
      output: lastOutput || lastErrorMessage || result.stdout.slice(0, 2000),
      usage,
      trace,
      durationMs: result.durationMs,
      error: lastErrorMessage || result.error,
    };
  }
}
