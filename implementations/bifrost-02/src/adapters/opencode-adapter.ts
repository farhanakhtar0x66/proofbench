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

export interface OpenCodeAdapterOptions {
  model?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  cliPath?: string;
}

export class OpenCodeCliAdapter implements CodingAgentCliAdapter {
  public descriptor: AgentDescriptor;
  private model: string;
  private timeoutMs: number;
  private maxOutputBytes: number;
  private cliPath: string;

  constructor(options: OpenCodeAdapterOptions = {}) {
    this.model = options.model ?? 'opencode/deepseek-v4.1-flash-free';
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxOutputBytes = options.maxOutputBytes ?? 4 * 1024 * 1024;
    this.cliPath = options.cliPath ?? 'opencode';

    this.descriptor = AgentDescriptor.parse({
      version: '1',
      id: 'opencode-cli',
      name: 'OpenCode CLI Agent',
      implementation: '02',
      runtime: 'typescript',
      revision: 'opencode-v2.2.0',
      model: this.model,
    });
  }

  async runTask(
    task: TaskSpec,
    workspace: WorkspaceIdentity,
    signal?: AbortSignal
  ): Promise<AgentExecutionResult> {
    const runId = randomUUID();
    const args = [
      'run',
      '--format',
      'json',
      '--auto',
      '--standalone',
      '-m',
      this.model,
      task.prompt,
    ];

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
      message: `OpenCode CLI started with model ${this.model}`,
      data: { command: this.cliPath, model: this.model },
    });

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let observedTokens = false;
    let finalAssistantText = '';

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const eventType = parsed.type;
        const eventTs = parsed.timestamp
          ? new Date(parsed.timestamp).toISOString()
          : new Date().toISOString();

        if (eventType === 'step_finish' && parsed.part?.tokens) {
          const t = parsed.part.tokens;
          if (typeof t.input === 'number' && typeof t.output === 'number') {
            totalInputTokens += t.input;
            totalOutputTokens += t.output;
            observedTokens = true;
          }
          traceEvents.push({
            sequence: seq++,
            at: eventTs,
            type: 'output',
            message: `Step completed (tokens in: ${t.input ?? '?'}, out: ${t.output ?? '?'})`,
            data: { tokens: t, cost: parsed.part.cost },
          });
        } else if (eventType === 'tool_use' && parsed.part) {
          traceEvents.push({
            sequence: seq++,
            at: eventTs,
            type: 'output',
            message: `Tool call: ${parsed.part.tool ?? 'unknown'}`,
            data: { tool: parsed.part.tool, state: parsed.part.state?.status },
          });
        } else if (eventType === 'text' && parsed.part?.text) {
          finalAssistantText = parsed.part.text;
          traceEvents.push({
            sequence: seq++,
            at: eventTs,
            type: 'output',
            message: parsed.part.text.slice(0, 500),
          });
        } else if (eventType === 'error') {
          traceEvents.push({
            sequence: seq++,
            at: eventTs,
            type: 'error',
            message: parsed.message ?? 'Unknown OpenCode error',
          });
        }
      } catch {
        // Plaintext line
        traceEvents.push({
          sequence: seq++,
          at: new Date().toISOString(),
          type: 'output',
          message: line.slice(0, 500),
        });
      }
    }

    if (result.timedOut) {
      traceEvents.push({
        sequence: seq++,
        at: new Date().toISOString(),
        type: 'error',
        message: `Execution timed out after ${this.timeoutMs}ms`,
      });
    } else if (result.cancelled) {
      traceEvents.push({
        sequence: seq++,
        at: new Date().toISOString(),
        type: 'error',
        message: 'Execution was cancelled by abort signal',
      });
    } else if (result.outputLimitExceeded) {
      traceEvents.push({
        sequence: seq++,
        at: new Date().toISOString(),
        type: 'error',
        message: 'Process output exceeded byte limit',
      });
    } else {
      traceEvents.push({
        sequence: seq++,
        at: new Date().toISOString(),
        type: 'finish',
        message: `OpenCode CLI finished with exit code ${result.exitCode}`,
      });
    }

    let status: AgentExecutionResult['status'] = 'completed';
    if (result.timedOut) status = 'timed_out';
    else if (result.cancelled) status = 'cancelled';
    else if (result.exitCode !== 0) status = 'failed';

    const inputTokens: UsageRecord['inputTokens'] = observedTokens
      ? {
          status: 'known',
          value: totalInputTokens,
          unit: 'tokens',
          source: 'opencode.run.tokens.input',
          scope: 'opencode_session_cumulative',
        }
      : {
          status: 'missing',
          reason: 'OpenCode CLI output did not report token counters',
        };

    const outputTokens: UsageRecord['outputTokens'] = observedTokens
      ? {
          status: 'known',
          value: totalOutputTokens,
          unit: 'tokens',
          source: 'opencode.run.tokens.output',
          scope: 'opencode_session_cumulative',
        }
      : {
          status: 'missing',
          reason: 'OpenCode CLI output did not report token counters',
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
        scope: 'opencode CLI subprocess execution',
      },
      cost: {
        status: 'missing',
        reason: 'Free tier model invoked; zero billed cost observation',
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
      output: finalAssistantText || result.stdout.slice(0, 2000),
      usage,
      trace,
      durationMs: result.durationMs,
      error: result.error,
    };
  }
}
