import type { FastifyInstance } from 'fastify';
import { TrackDRequest, TrackDSession } from '../../../packages/contracts/src/track-d';
import { gatewayConfig } from '../../../implementations/bifrost-02/src/track-d/gateway';
import { verifyGrader } from '../../../implementations/bifrost-02/src/track-d/grader';
import { createTrackDSession, executeTrackD } from '../../../implementations/bifrost-02/src/track-d/session';
import type { JsonStore } from './store';

export async function registerTrackD(app: FastifyInstance, store: JsonStore) {
  const kind = 'track-d';
  const shutdown = new AbortController();
  let running: Promise<TrackDSession | undefined> | undefined;
  for (const session of await store.list(kind, TrackDSession, 20)) {
    if (session.status === 'running') {
      await store.put(kind, session.id, {
        ...session, status: 'failed', message: 'The API restarted before this session finished.',
      });
    }
  }
  app.addHook('onClose', async () => {
    shutdown.abort();
    await running;
  });
  app.get('/api/track-d', async () => ({
    liveConfigured: Boolean(gatewayConfig()), sessions: await store.list(kind, TrackDSession, 5),
  }));
  app.get<{ Params: { id: string } }>('/api/track-d/:id', async (request, reply) => {
    const parsed = TrackDSession.shape.id.safeParse(request.params.id);
    const session = parsed.success ? await store.get(kind, parsed.data, TrackDSession) : null;
    return session ?? reply.code(404).send({ message: 'Track D session not found.' });
  });
  app.post('/api/track-d', async (request, reply) => {
    const parsed = TrackDRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: 'Select one or two tasks, up to three repeats, and a supported fault.' });
    if (running) return reply.code(409).send({ message: 'A Track D benchmark is already running.' });
    const config = parsed.data.mode === 'live' ? gatewayConfig() : null;
    if (parsed.data.mode === 'live' && !config) {
      return reply.code(409).send({ message: 'Enable live Track D and configure the pinned Bifrost model, virtual key and OpenCode binary first.' });
    }
    let admit: (session: TrackDSession | null) => void = () => undefined;
    const admitted = new Promise<TrackDSession | null>(resolve => { admit = resolve; });
    const operation = (async () => {
      try {
        const worker = await verifyGrader();
        const session = createTrackDSession(parsed.data, worker, config);
        await store.put(kind, session.id, session);
        admit(session);
        return await executeTrackD(session, config, result => store.put(kind, result.id, result), shutdown.signal);
      } catch {
        admit(null);
        return undefined;
      } finally {
        running = undefined;
      }
    })();
    // Reserve admission before the asynchronous image check so concurrent submissions cannot both start.
    running = operation;
    const session = await admitted;
    if (!session) return reply.code(503).send({
      message: 'Track D worker unavailable. Check Python and the configured Docker or WSL grader.',
    });
    return reply.code(202).send(session);
  });
}
