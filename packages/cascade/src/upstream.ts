import type { ChatRequest, TokenUsage } from './types';

/** The parts of an OpenAI-style chat completion body that Cascade reads. */
export interface CompletionBody {
  choices?: Array<{ message?: { content?: string | null; [key: string]: unknown } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: string | { message?: string; error?: string };
  [key: string]: unknown;
}

export interface UpstreamResult {
  status: number;
  body: CompletionBody;
  usage: TokenUsage;
  latencyMs: number;
}

export interface Upstream {
  /** Non-streaming chat completion. */
  complete(request: ChatRequest): Promise<UpstreamResult>;
  /** Streaming chat completion: returns the raw SSE response. */
  stream(request: ChatRequest): Promise<Response>;
}

export interface BifrostUpstreamOptions {
  gatewayUrl: string;
  virtualKey?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Sends requests through a Bifrost gateway with the Cascade virtual key. */
export class BifrostUpstream implements Upstream {
  constructor(private readonly options: BifrostUpstreamOptions) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.options.virtualKey) headers['x-bf-vk'] = this.options.virtualKey;
    return headers;
  }

  private url(): string {
    return `${this.options.gatewayUrl.replace(/\/$/, '')}/v1/chat/completions`;
  }

  async complete(request: ChatRequest): Promise<UpstreamResult> {
    const started = Date.now();
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(this.url(), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ...request, stream: false }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 180_000),
    });
    const text = await response.text();
    let body: CompletionBody;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: { message: text.slice(0, 500) || `HTTP ${response.status}` } };
    }
    return { status: response.status, body, usage: readUsage(body), latencyMs: Date.now() - started };
  }

  async stream(request: ChatRequest): Promise<Response> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    return fetchImpl(this.url(), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ...request, stream: true, stream_options: { include_usage: true } }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 180_000),
    });
  }
}

export function readUsage(body: CompletionBody | undefined): TokenUsage {
  const usage = body?.usage ?? {};
  return { input: Number(usage.prompt_tokens ?? 0), output: Number(usage.completion_tokens ?? 0) };
}
