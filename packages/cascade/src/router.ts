import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { M2StagnationDetector } from '../../../implementations/bifrost-01/src/progress/m2-stagnation';
import { M3aFailureAutopsyBuilder } from '../../../implementations/bifrost-01/src/handoff/m3a-autopsy';
import { detectOutcome, estimateMessagesTokens, messageText } from './signals';
import type { CascadeConfig, CascadeEvent, ChatMessage, ChatRequest, RouteDecision, TierId, TokenUsage } from './types';
import { readUsage, type CompletionBody, type Upstream, type UpstreamResult } from './upstream';

export const DEFAULT_CONFIG: CascadeConfig = {
  small: { id: 'small', model: 'nvidia/poolside/laguna-xs-2.1', label: 'Laguna XS 2.1' },
  large: { id: 'large', model: 'nvidia/nvidia/nemotron-3-ultra-550b-a55b', label: 'Nemotron 3 Ultra 550B', params: { chat_template_kwargs: { enable_thinking: false } } },
  maxSmallFailures: 2,
  autopsyBudgetTokens: 2000,
};

interface SessionState {
  id: string;
  client: string;
  tier: TierId;
  turn: number;
  detector: M2StagnationDetector;
  smallFailures: number;
  /** Index of the last message of the request that triggered escalation. */
  escalatedFrom?: number;
  autopsy?: ChatMessage;
  usage: Record<TierId, TokenUsage>;
  escalations: number;
  createdAt: string;
  lastSeen: string;
}

export interface SessionSummary {
  id: string;
  client: string;
  tier: TierId;
  turns: number;
  escalations: number;
  usage: Record<TierId, TokenUsage>;
  createdAt: string;
  lastSeen: string;
}

export interface RoutedResult extends UpstreamResult {
  decision: RouteDecision;
  sessionId: string;
}

/**
 * Cascade: start every session on the small model; escalate to the large one
 * only when the agent's own checks show the small model is stuck; hand the large
 * model a compact autopsy instead of the failed history; drop back to the small
 * model once a fix is verified.
 */
export class CascadeRouter {
  readonly events = new EventEmitter();
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly upstream: Upstream,
    readonly config: CascadeConfig = DEFAULT_CONFIG,
  ) {
    this.events.setMaxListeners(100);
  }

  /** Session id from the header, or a stable hash of the system prompt and first user message. */
  static sessionKey(request: ChatRequest, header?: string): string {
    if (header && header.trim()) return header.trim().slice(0, 120);
    const first = request.messages.find(m => m.role === 'user');
    const system = request.messages.find(m => m.role === 'system');
    const pin = CascadeRouter.pinnedTier(request.model);
    return (pin ? `${pin}-` : 'auto-') + createHash('sha256').update(messageText(system) + '\u0000' + messageText(first)).digest('hex').slice(0, 12);
  }

  private emit(event: CascadeEvent): void {
    this.events.emit('event', event);
  }

  private session(id: string, client: string): SessionState {
    let session = this.sessions.get(id);
    const now = new Date().toISOString();
    if (!session) {
      session = {
        id,
        client,
        tier: 'small',
        turn: 0,
        detector: new M2StagnationDetector(),
        smallFailures: 0,
        usage: { small: { input: 0, output: 0 }, large: { input: 0, output: 0 } },
        escalations: 0,
        createdAt: now,
        lastSeen: now,
      };
      this.sessions.set(id, session);
      this.emit({ type: 'session', at: now, sessionId: id, client });
      if (this.sessions.size > 500) this.sessions.delete(this.sessions.keys().next().value!);
    }
    session.lastSeen = now;
    return session;
  }

  /** "cascade:small" and "cascade:large" pin a tier; anything else is routed. */
  static pinnedTier(model?: string): TierId | undefined {
    const match = /^cascade:(small|large)$/.exec(model ?? '');
    return match ? (match[1] as TierId) : undefined;
  }

  /** Decides the tier for this request and returns the (possibly compressed) messages to send. */
  decide(sessionId: string, request: ChatRequest, client = 'unknown'): { decision: RouteDecision; messages: ChatMessage[]; turn: number } {
    const session = this.session(sessionId, client);
    session.turn += 1;
    const signal = detectOutcome(request.messages);
    const lastAssistant = [...request.messages].reverse().find(m => m.role === 'assistant');
    let decision: RouteDecision;
    const pinned = CascadeRouter.pinnedTier(request.model);

    if (pinned) {
      // "cascade:small" / "cascade:large" fix the tier: baselines take the same path as Cascade.
      session.tier = pinned;
      decision = this.pick(lastAssistant ? 'stay' : 'start', pinned, `Pinned to the ${pinned} tier by the model name.`);
    } else if (!lastAssistant) {
      session.tier = 'small';
      decision = this.pick('start', 'small', 'New session: start on the cheap tier.');
    } else if (signal.outcome === 'fail') {
      const verdict = session.detector.recordAttempt({
        patch: messageText(lastAssistant),
        rawError: signal.signature,
        exitCode: 1,
        passedCount: signal.passed,
        failedCount: signal.failed,
      });
      if (session.tier === 'small') {
        session.smallFailures += 1;
        if (verdict.shouldHalt || session.smallFailures >= this.config.maxSmallFailures) {
          session.tier = 'large';
          session.escalations += 1;
          session.escalatedFrom = request.messages.length - 1;
          const why = verdict.shouldHalt
            ? `M2 ${verdict.reason?.replace(/_/g, ' ')}: ${verdict.message}`
            : `${session.smallFailures} failed checks on the small tier.`;
          session.autopsy = this.buildAutopsy(request, session, verdict.reason);
          decision = this.pick('escalate', 'large', why);
        } else {
          decision = this.pick('stay', 'small', `Check failed (${session.smallFailures}/${this.config.maxSmallFailures}); small tier gets another try.`);
        }
      } else {
        decision = this.pick('hold-large', 'large', 'Still failing after escalation; the large tier keeps the task.');
      }
    } else if (signal.outcome === 'pass') {
      if (session.tier === 'large') {
        decision = this.pick('deescalate', 'small', 'Fix verified by the checks: back to the cheap tier.');
      } else {
        decision = this.pick('stay', 'small', 'Checks pass on the cheap tier.');
      }
      session.tier = 'small';
      session.smallFailures = 0;
      session.escalatedFrom = undefined;
      session.autopsy = undefined;
      session.detector.reset();
    } else {
      decision = this.pick('stay', session.tier, session.tier === 'large' ? 'No check result; the large tier keeps the task.' : 'No check result yet; staying cheap.');
    }

    let messages = request.messages;
    if (decision.tier === 'large' && session.escalatedFrom !== undefined && session.autopsy) {
      const compressed = this.compress(request.messages, session.escalatedFrom, session.autopsy);
      const before = estimateMessagesTokens(request.messages);
      const after = estimateMessagesTokens(compressed.messages);
      if (compressed.skipped) {
        decision.compression = { before, after: before, skipped: compressed.skipped };
      } else if (after >= before) {
        // A short history is cheaper to resend than to summarise: keep it.
        decision.compression = { before, after: before, skipped: 'history is already smaller than the autopsy' };
      } else {
        decision.compression = { before, after };
        messages = compressed.messages;
      }
    }

    this.emit({ type: 'decision', at: new Date().toISOString(), sessionId, turn: session.turn, decision, outcome: signal.outcome });
    return { decision, messages, turn: session.turn };
  }

  private pick(kind: RouteDecision['kind'], tier: TierId, reason: string): RouteDecision {
    return { kind, tier, model: this.config[tier].model, reason };
  }

  private buildAutopsy(request: ChatRequest, session: SessionState, reason?: string): ChatMessage {
    const task = messageText(request.messages.find(m => m.role === 'user'));
    const packet = M3aFailureAutopsyBuilder.buildAutopsyPacket({
      taskId: session.id,
      taskTitle: task.split('\n')[0].slice(0, 120),
      taskPrompt: task.slice(0, 1200),
      attempts: session.detector.getAttempts(),
      stagnationReason: reason,
      escalationModel: this.config.large.model,
      maxTokenBudget: this.config.autopsyBudgetTokens,
    });
    return {
      role: 'user',
      content:
        'A cheaper model already tried this task and failed. Here is an evidence-only autopsy of its attempts ' +
        '(patches and the exact check output). Do not repeat those mistakes.\n\n' +
        packet.formattedPacket,
    };
  }

  /**
   * Replaces the failed small-tier turns with the autopsy. In tool-call transcripts no
   * message is dropped (that would orphan a tool result); instead the bulky text of
   * superseded tool outputs and replies is elided, keeping every id and the order.
   */
  private compress(messages: ChatMessage[], escalatedFrom: number, autopsy: ChatMessage): { messages: ChatMessage[]; skipped?: string } {
    const firstUser = messages.findIndex(m => m.role === 'user');
    if (firstUser === -1 || escalatedFrom <= firstUser) return { messages, skipped: 'nothing to compress' };
    if (messages.some(m => m.role === 'tool' || (Array.isArray(m.tool_calls) && m.tool_calls.length > 0))) {
      const elided = messages.map((message, index) =>
        index > firstUser && index < escalatedFrom && (message.role === 'tool' || message.role === 'assistant') ? elide(message) : message,
      );
      return { messages: [...elided.slice(0, firstUser + 1), autopsy, ...elided.slice(firstUser + 1)] };
    }
    const head = messages.slice(0, firstUser + 1);
    const tail = messages.slice(escalatedFrom);
    return { messages: [...head, autopsy, ...tail] };
  }

  /** Full non-streaming path: decide, forward through Bifrost, record usage. */
  async complete(sessionId: string, request: ChatRequest, client = 'unknown'): Promise<RoutedResult> {
    return this.send(sessionId, request, this.decide(sessionId, request, client));
  }

  /** Forwards an already-decided request through Bifrost and records its usage. */
  async send(sessionId: string, request: ChatRequest, routed: { decision: RouteDecision; messages: ChatMessage[]; turn: number }): Promise<RoutedResult> {
    const { decision, messages, turn } = routed;
    let result: UpstreamResult;
    try {
      result = await this.upstream.complete({ ...request, ...this.config[decision.tier].params, model: decision.model, messages });
    } catch (error) {
      this.recordUsage(sessionId, turn, decision, { input: 0, output: 0 }, 0, 'error', (error as Error).message);
      throw error;
    }
    const ok = result.status < 400;
    this.recordUsage(sessionId, turn, decision, result.usage, result.latencyMs, ok ? 'ok' : 'error', ok ? undefined : errorMessage(result.body));
    if (result.body && typeof result.body === 'object') {
      result.body.cascade = { session: sessionId, turn, tier: decision.tier, model: decision.model, decision: decision.kind, reason: decision.reason, compression: decision.compression };
    }
    return { ...result, decision, sessionId };
  }

  /** Streaming path: decide, then pipe Bifrost's SSE while reading the final usage chunk. */
  async stream(sessionId: string, request: ChatRequest, client = 'unknown'): Promise<{ response: Response; decision: RouteDecision; body: ReadableStream<Uint8Array> | null }> {
    const { decision, messages, turn } = this.decide(sessionId, request, client);
    const started = Date.now();
    const response = await this.upstream.stream({ ...request, ...this.config[decision.tier].params, model: decision.model, messages });
    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      this.recordUsage(sessionId, turn, decision, { input: 0, output: 0 }, Date.now() - started, 'error', text.slice(0, 300));
      return { response: new Response(text, { status: response.status, headers: { 'content-type': 'application/json' } }), decision, body: null };
    }
    let usage: TokenUsage = { input: 0, output: 0 };
    let buffer = '';
    const decoder = new TextDecoder();
    const tap = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        let index: number;
        while ((index = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (line.startsWith('data:') && line !== 'data: [DONE]') {
            try {
              const parsed = JSON.parse(line.slice(5));
              if (parsed.usage) usage = readUsage(parsed);
            } catch {
              /* partial or non-JSON line */
            }
          }
        }
        controller.enqueue(chunk);
      },
      flush: () => {
        this.recordUsage(sessionId, turn, decision, usage, Date.now() - started, 'ok');
      },
    });
    return { response, decision, body: response.body.pipeThrough(tap) };
  }

  private recordUsage(sessionId: string, turn: number, decision: RouteDecision, usage: TokenUsage, latencyMs: number, status: 'ok' | 'error', error?: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.usage[decision.tier].input += usage.input;
      session.usage[decision.tier].output += usage.output;
    }
    this.emit({ type: 'usage', at: new Date().toISOString(), sessionId, turn, tier: decision.tier, model: decision.model, usage, latencyMs, status, error });
  }

  sessionSummaries(limit = 50): SessionSummary[] {
    return [...this.sessions.values()]
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
      .slice(0, limit)
      .map(s => ({ id: s.id, client: s.client, tier: s.tier, turns: s.turn, escalations: s.escalations, usage: s.usage, createdAt: s.createdAt, lastSeen: s.lastSeen }));
  }
}

const ELIDE_ABOVE = 600;

/** Keeps the head and tail of a long superseded message; ids, roles and tool calls are untouched. */
function elide(message: ChatMessage): ChatMessage {
  if (typeof message.content !== 'string' || message.content.length <= ELIDE_ABOVE) return message;
  const text = message.content;
  return { ...message, content: `${text.slice(0, 200)}\n…[${text.length - 400} characters elided by Cascade: superseded attempt, summarised in the autopsy]…\n${text.slice(-200)}` };
}

function errorMessage(body: CompletionBody): string {
  const error = body?.error;
  if (typeof error === 'string') return error;
  return String(error?.message ?? error?.error ?? 'upstream error').slice(0, 300);
}
