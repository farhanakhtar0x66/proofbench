import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { TrackDReceipt } from '../../../../packages/contracts/src/track-d';

export const limits = { modelCalls: 6, outputTokensPerCall: 3500, agentSeconds: 150 };

export function gatewayConfig() {
  const model = process.env.TRACK_D_BIFROST_MODEL;
  const key = process.env.BIFROST_VIRTUAL_KEY;
  if (process.env.TRACK_D_LIVE !== 'true' || !model || !key || !/^[\w.-]+\/[\w.:/-]+$/.test(model) || !process.env.TRACK_D_OPENCODE) {
    return null;
  }
  const origin = new URL(process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || !['http:', 'https:'].includes(origin.protocol) ||
      origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Track D requires a local Bifrost origin.');
  }
  return { model, key, origin: origin.origin, cli: process.env.TRACK_D_OPENCODE };
}
export type GatewayConfig = NonNullable<ReturnType<typeof gatewayConfig>>;
type Completion = {
  id?: string;
  model?: string;
  choices?: { message?: { content?: string }; delta?: unknown }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  extra_fields?: { provider?: string; routing_info?: { is_fallback?: boolean } };
};

const readCompletion = (text: string, stream: boolean): Completion[] => stream
  ? text.split(/\r?\n/).filter(line => line.startsWith('data:') && line.slice(5).trim() !== '[DONE]')
    .map(line => JSON.parse(line.slice(5)) as Completion)
  : [JSON.parse(text) as Completion];

export function isPinnedReceipt(receipt: TrackDReceipt, model: string) {
  const provider = model.slice(0, model.indexOf('/'));
  return receipt.status === 200 && receipt.provider === provider &&
    (receipt.model === model || receipt.model === model.slice(provider.length + 1));
}

export function createMeter(config: GatewayConfig, injectOutage: boolean, signal: AbortSignal) {
  const receipts: TrackDReceipt[] = [];
  const correlationId = randomUUID();
  let attempts = 0;
  const reject = (status: number, message: string, injected = false) => {
    receipts.push({ status, injected, model: null, provider: null, input: null, output: null, costUsd: null, requestId: null });
    return new Response(JSON.stringify({ error: { message, type: 'benchmark_gateway_error' } }), { status });
  };
  async function complete(body: Record<string, unknown>) {
    if (signal.aborted || attempts >= limits.modelCalls) return reject(429, 'Benchmark model call limit reached.');
    if (body.model !== config.model || !Array.isArray(body.messages)) return reject(400, 'Request must use the pinned model.');
    attempts++;
    if (injectOutage && attempts === 1) return reject(503, 'Injected benchmark model outage.', true);
    const stream = body.stream === true;
    const requestedMax = body.max_completion_tokens ?? body.max_tokens;
    const maxTokens = typeof requestedMax === 'number' && requestedMax > 0
      ? Math.min(requestedMax, limits.outputTokensPerCall) : limits.outputTokensPerCall;
    const forwarded = {
      model: config.model, messages: body.messages, stream, max_tokens: maxTokens,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      ...(Array.isArray(body.tools) ? { tools: body.tools } : {}),
    };
    try {
      const response = await fetch(`${config.origin}/v1/chat/completions`, {
        method: 'POST', redirect: 'error',
        headers: {
          'Content-Type': 'application/json', Authorization: `Bearer ${config.key}`, 'x-bf-vk': config.key,
          'x-bf-eh-correlation-id': correlationId,
        },
        body: JSON.stringify(forwarded),
        signal: AbortSignal.any([signal, AbortSignal.timeout(75_000)]),
      });
      if (!response.ok) return reject(response.status, `Bifrost returned HTTP ${response.status}.`);
      const text = await response.text();
      const chunks = readCompletion(text, stream);
      const metadata = chunks.find(chunk => chunk.extra_fields?.provider)?.extra_fields;
      const usage = chunks.find(chunk => chunk.usage)?.usage;
      const requestId = response.headers.get('x-bifrost-request-id') ?? chunks.find(chunk => chunk.id)?.id ?? null;
      const fallback = response.headers.get('x-bifrost-routing-info-is-fallback') === 'true' || metadata?.routing_info?.is_fallback;
      const receipt = {
        status: 200, injected: false, requestId,
        model: response.headers.get('x-bifrost-resolved-model') ?? chunks.find(chunk => chunk.model)?.model ?? null,
        provider: response.headers.get('x-bifrost-provider') ?? metadata?.provider ?? null,
        input: usage?.prompt_tokens ?? null, output: usage?.completion_tokens ?? null, costUsd: null,
      };
      if (fallback || !isPinnedReceipt(receipt, config.model)) {
        receipts.push({ ...receipt, status: 502 });
        return new Response(JSON.stringify({ error: { message: 'Gateway did not attest the pinned provider and model.' } }), { status: 502 });
      }
      receipts.push(receipt);
      return new Response(text, { headers: { 'Content-Type': stream ? 'text/event-stream' : 'application/json' } });
    } catch {
      return reject(502, 'Bifrost was unreachable or returned an invalid response.');
    }
  }
  return { receipts, complete };
}

export async function openMeterPort(complete: ReturnType<typeof createMeter>['complete']) {
  const nonce = randomUUID();
  const server = createServer(async (request, reply) => {
    if (request.method !== 'POST' || request.url !== `/${nonce}/v1/chat/completions`) {
      reply.writeHead(404).end();
      return;
    }
    try {
      const body: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 256 * 1024) throw new Error('Request limit exceeded.');
        body.push(chunk);
      }
      const parsed: unknown = JSON.parse(Buffer.concat(body).toString());
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid request.');
      const response = await complete(parsed as Record<string, unknown>);
      reply.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') ?? 'application/json' });
      reply.end(await response.text());
    } catch {
      if (!reply.headersSent) reply.writeHead(400).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/${nonce}/v1`,
    close() { server.close(); server.closeAllConnections(); },
  };
}
