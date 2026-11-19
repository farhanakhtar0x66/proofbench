import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  BifrostUpstream,
  CascadeRouter,
  DEFAULT_CONFIG,
  DEFAULT_SUITE,
  LANES,
  RACE_TASKS,
  RaceManager,
  type CascadeEvent,
  type ChatRequest,
  type RaceEvent,
} from '../../../packages/cascade/src/index';

const ChatBody = z
  .object({
    model: z.string().optional(),
    messages: z.array(z.object({ role: z.string() }).passthrough()).min(1).max(2000),
    stream: z.boolean().optional(),
  })
  .passthrough();

const RaceBody = z.object({
  taskIds: z.array(z.string().max(40)).max(10).optional(),
  replay: z.string().max(120).optional(),
  speed: z.number().min(0.5).max(20).optional(),
});

function sse(reply: FastifyReply, request: FastifyRequest): (data: unknown) => void {
  reply.hijack();
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  reply.raw.write(': connected\n\n');
  const heartbeat = setInterval(() => reply.raw.write(': ping\n\n'), 15_000);
  request.raw.on('close', () => clearInterval(heartbeat));
  return data => reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * ProofBench Cascade: an OpenAI-compatible endpoint any agent can use, plus the
 * live race that compares it against small-only and big-only routing.
 */
export async function registerCascade(app: FastifyInstance, options: { dataDir: string }) {
  const gatewayUrl = process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089';
  const upstream = new BifrostUpstream({ gatewayUrl, virtualKey: process.env.BIFROST_VIRTUAL_KEY });
  const router = new CascadeRouter(upstream, DEFAULT_CONFIG);
  const races = new RaceManager({ router, upstream, dataDir: options.dataDir, bundledDir: resolve('docs/evidence/cascade') });
  let liveRace: string | undefined;

  async function status() {
    let gateway: 'up' | 'down' = 'down';
    try {
      const response = await fetch(`${gatewayUrl}/health`, { signal: AbortSignal.timeout(1500) });
      gateway = response.ok ? 'up' : 'down';
    } catch {
      gateway = 'down';
    }
    const virtualKey = Boolean(process.env.BIFROST_VIRTUAL_KEY);
    return {
      gateway,
      gatewayUrl,
      virtualKey,
      live: gateway === 'up' && virtualKey,
      tiers: { small: { model: router.config.small.model, label: router.config.small.label }, large: { model: router.config.large.model, label: router.config.large.label } },
      policy: { maxSmallFailures: router.config.maxSmallFailures, autopsyBudgetTokens: router.config.autopsyBudgetTokens },
      endpoint: '/api/cascade/v1',
    };
  }

  app.get('/api/cascade/status', status);
  app.get('/api/cascade/tasks', async () => ({
    defaultSuite: DEFAULT_SUITE,
    lanes: LANES,
    tasks: RACE_TASKS.map(({ id, title, difficulty, prompt, file }) => ({ id, title, difficulty, prompt, file })),
  }));
  app.get('/api/cascade/sessions', async () => ({ sessions: router.sessionSummaries() }));

  // Live gateway feed: every routing decision and usage record, from races and external agents alike.
  app.get('/api/cascade/events', async (request, reply) => {
    const send = sse(reply, request);
    const listener = (event: CascadeEvent) => send(event);
    router.events.on('event', listener);
    request.raw.on('close', () => router.events.off('event', listener));
  });

  // OpenAI-compatible surface: point any agent's base URL at http://host:3001/api/cascade/v1
  app.get('/api/cascade/v1/models', async () => ({
    object: 'list',
    data: [
      { id: 'cascade', object: 'model', owned_by: 'proofbench', description: `${router.config.small.label} first, ${router.config.large.label} on proven failure` },
      { id: 'cascade:small', object: 'model', owned_by: 'proofbench', description: `Always ${router.config.small.label}` },
      { id: 'cascade:large', object: 'model', owned_by: 'proofbench', description: `Always ${router.config.large.label}` },
    ],
  }));

  app.post('/api/cascade/v1/chat/completions', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const body = ChatBody.parse(request.body) as unknown as ChatRequest;
    const header = request.headers['x-cascade-session'];
    const sessionId = CascadeRouter.sessionKey(body, typeof header === 'string' ? header : undefined);
    const client = String(request.headers['user-agent'] ?? 'unknown').slice(0, 80);
    if (body.stream) {
      const { response, decision, body: stream } = await router.stream(sessionId, body, client);
      reply.header('x-cascade-session', sessionId).header('x-cascade-tier', decision.tier).header('x-cascade-model', decision.model);
      if (!stream) return reply.code(response.status).type('application/json').send(await response.text());
      reply.code(200).header('content-type', 'text/event-stream; charset=utf-8').header('cache-control', 'no-cache');
      return reply.send(Readable.fromWeb(stream as unknown as NodeReadableStream<Uint8Array>));
    }
    const result = await router.complete(sessionId, body, client);
    reply.header('x-cascade-session', sessionId).header('x-cascade-tier', result.decision.tier).header('x-cascade-model', result.decision.model);
    return reply.code(result.status).send(result.body);
  });

  app.get('/api/cascade/races', async () => ({ races: await races.listSaved(), running: liveRace ?? null }));

  app.post('/api/cascade/races', async (request, reply) => {
    const body = RaceBody.parse(request.body ?? {});
    if (body.replay) {
      try {
        return { id: await races.replay(body.replay, body.speed ?? 1), replay: true };
      } catch (error) {
        return reply.code(404).send({ version: '1', error: 'not_found', message: (error as Error).message });
      }
    }
    const current = await status();
    if (!current.live) {
      return reply.code(409).send({ version: '1', error: 'gateway_unavailable', message: 'Live races need the local Bifrost gateway and BIFROST_VIRTUAL_KEY. Replay a recorded race instead.' });
    }
    if (liveRace) return reply.code(409).send({ version: '1', error: 'race_running', message: 'A live race is already running.', id: liveRace });
    const id = races.start({ taskIds: body.taskIds });
    liveRace = id;
    races.subscribe(id, () => {}, () => {
      if (liveRace === id) liveRace = undefined;
    });
    return { id, replay: false };
  });

  app.get<{ Params: { id: string } }>('/api/cascade/races/:id/events', async (request, reply) => {
    const send = sse(reply, request);
    const unsubscribe = races.subscribe(
      request.params.id,
      (event: RaceEvent) => send(event),
      () => {
        send({ type: 'stream-end' });
        reply.raw.end();
      },
    );
    if (!unsubscribe) {
      send({ type: 'race-error', t: 0, message: 'Unknown race.' });
      reply.raw.end();
      return;
    }
    request.raw.on('close', unsubscribe);
  });
}
