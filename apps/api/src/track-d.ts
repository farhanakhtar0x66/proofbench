import { access, constants } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { trackDAdapterRevision, TrackDRequest, TrackDSession } from '../../../packages/contracts/src/track-d';
import { gatewayConfig, TrackDGatewayConfigError, type GatewayConfig } from '../../../implementations/bifrost-02/src/track-d/gateway';
import { publicSuiteRevision, verifyGrader } from '../../../implementations/bifrost-02/src/track-d/grader';
import { createTrackDSession, executeTrackD } from '../../../implementations/bifrost-02/src/track-d/session';
import type { JsonStore } from './store';

async function liveReadiness(): Promise<{ config: GatewayConfig | null; issue?: string }> {
  let config: GatewayConfig | null;
  try {
    config = gatewayConfig();
  } catch (error) {
    if (!(error instanceof TrackDGatewayConfigError)) throw error;
    return { config: null, issue: error.message };
  }
  if (!config) return {
    config, issue: 'Enable live Track D and configure the pinned Bifrost model, virtual key and OpenCode binary.',
  };
  if (isAbsolute(config.cli)) {
    try {
      await access(config.cli, constants.X_OK);
    } catch {
      return { config, issue: 'Set TRACK_D_OPENCODE to the path of an executable OpenCode binary.' };
    }
  }
  try {
    const response = await fetch(`${config.origin}/health`, { redirect: 'error', signal: AbortSignal.timeout(2000) });
    if (response.ok) return { config };
  } catch { /* An unreachable gateway uses the same recovery path as a failed health check. */ }
  return { config, issue: 'Bifrost did not pass its health check. Start the local gateway and retry.' };
}

export async function registerTrackD(app: FastifyInstance, store: JsonStore) {
  const kind = 'track-d';
  const shutdown = new AbortController();
  let running: Promise<TrackDSession | undefined> | undefined;
  let activeSessionId: string | undefined;
  const unsavedSessions = new Map<string, TrackDSession>();
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
  app.get('/api/track-d', async () => {
    const [live, saved] = await Promise.all([liveReadiness(), store.list(kind, TrackDSession, 5)]);
    const sessions = [...unsavedSessions.values(), ...saved.filter(session => !unsavedSessions.has(session.id))]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 5);
    return { adapterRevision: trackDAdapterRevision, publicSuiteRevision, liveConfigured: Boolean(live.config), liveIssue: live.issue, activeSessionId, sessions };
  });
  app.get<{ Params: { id: string } }>('/api/track-d/:id', async (request, reply) => {
    const parsed = TrackDSession.shape.id.safeParse(request.params.id);
    const session = parsed.success
      ? unsavedSessions.get(parsed.data) ?? await store.get(kind, parsed.data, TrackDSession)
      : null;
    return session ?? reply.code(404).send({ message: 'Track D session not found.' });
  });
  app.post('/api/track-d', async (request, reply) => {
    const parsed = TrackDRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: 'Select supported benchmark entries, one or two tasks, up to three repeats, and a supported scenario.' });
    if (running) return reply.code(409).send({ message: 'A Track D benchmark is already running.' });
    let config: GatewayConfig | null = null;
    if (parsed.data.mode === 'live') {
      const live = await liveReadiness();
      if (live.issue) return reply.code(live.config ? 503 : 409).send({ message: live.issue });
      config = live.config;
      if (running) return reply.code(409).send({ message: 'A Track D benchmark is already running.' });
    }
    type Admission = { session: TrackDSession } | { status: 500 | 503; message: string };
    let admit: (result: Admission) => void = () => undefined;
    const admitted = new Promise<Admission>(resolve => { admit = resolve; });
    const operation = (async () => {
      try {
        const worker = await verifyGrader().catch(() => null);
        if (!worker) {
          admit({ status: 503, message: 'Track D worker unavailable. Check Python, Git and the configured Docker or WSL grader.' });
          return;
        }
        const session = createTrackDSession(parsed.data, worker, config);
        await store.put(kind, session.id, session);
        activeSessionId = session.id;
        admit({ session });
        try {
          return await executeTrackD(session, config, result => store.put(kind, result.id, result), shutdown.signal);
        } catch {
          session.status = 'failed';
          session.comparable = false;
          session.message = 'The server could not save the benchmark results. Check the data directory and export any available evidence before restarting.';
          unsavedSessions.set(session.id, session);
        }
      } catch {
        admit({ status: 500, message: 'The server could not save a new Track D session. Check that the data directory is writable.' });
      } finally {
        running = undefined;
        activeSessionId = undefined;
      }
    })();
    // Reserve admission before the asynchronous image check so concurrent submissions cannot both start.
    running = operation;
    const result = await admitted;
    return 'session' in result ? reply.code(202).send(result.session) : reply.code(result.status).send({ message: result.message });
  });
}
