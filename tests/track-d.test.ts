import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../apps/api/src/app';
import { trackDGatewayAttempts, TrackDRequest } from '../packages/contracts/src/track-d';
import { createMeter, gatewayConfig, isPinnedReceipt, limits, openMeterPort } from '../implementations/bifrost-02/src/track-d/gateway';
import { gradeTrackD, publicSuiteRevision, starter, verifyGrader } from '../implementations/bifrost-02/src/track-d/grader';
import { fixedProofBench } from '../implementations/bifrost-02/src/track-d/agents';

const config = { origin: 'http://127.0.0.1:8089', model: 'ollama/coder:test', key: 'test', cli: 'opencode' };
const body = { model: config.model, messages: [{ role: 'user', content: 'Fix main.cpp' }] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('keeps Track D history available and rejects live starts when Bifrost setup fails', async () => {
  vi.stubEnv('TRACK_D_LIVE', 'true');
  vi.stubEnv('TRACK_D_BIFROST_MODEL', config.model);
  vi.stubEnv('TRACK_D_OPENCODE', 'opencode');
  vi.stubEnv('BIFROST_VIRTUAL_KEY', config.key);
  vi.stubEnv('BIFROST_GATEWAY_URL', 'not a URL');
  const health = vi.fn(async () => new Response(null, { status: 503 }));
  vi.stubGlobal('fetch', health);
  const dir = await mkdtemp(join(tmpdir(), 'proofbench-track-d-'));
  const app = await createApp({ dataDir: dir, implementation: 'mock', tavilyMode: 'mock' });
  const submit = { method: 'POST' as const, url: '/api/track-d',
    payload: { mode: 'live', tasks: ['distance-width'], repeats: 1, fault: 'none' } };
  try {
    const invalid = await app.inject('/api/track-d');
    expect(invalid.statusCode).toBe(200);
    expect(invalid.json()).toMatchObject({ publicSuiteRevision, liveConfigured: false, liveIssue: expect.stringContaining('BIFROST_GATEWAY_URL'), sessions: [] });
    expect((await app.inject(submit)).statusCode).toBe(409);
    expect(health).not.toHaveBeenCalled();

    vi.stubEnv('BIFROST_GATEWAY_URL', config.origin);
    const offline = await app.inject('/api/track-d');
    expect(offline.json()).toMatchObject({ liveConfigured: true, liveIssue: expect.stringContaining('health check'), sessions: [] });
    expect((await app.inject(submit)).statusCode).toBe(503);
    expect(health).toHaveBeenCalledWith(`${config.origin}/health`, expect.any(Object));
    health.mockResolvedValue(new Response(null, { status: 200 }));
    expect((await app.inject('/api/track-d')).json()).not.toHaveProperty('liveIssue');
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

describe('Track D model relay', () => {
  it('keeps retries beyond the call cap local and records their zero token usage', async () => {
    const upstream = vi.fn(async () => Response.json({ model: config.model,
      usage: { prompt_tokens: 20, completion_tokens: 5 } }, { headers: { 'x-bifrost-provider': 'ollama' } }));
    vi.stubGlobal('fetch', upstream);
    const meter = createMeter(config, false, AbortSignal.timeout(5000));
    for (let index = 0; index < limits.modelCalls; index++) expect((await meter.complete(body)).status).toBe(200);
    expect((await meter.complete(body)).status).toBe(429);
    expect((await meter.complete(body)).status).toBe(429);
    expect(upstream).toHaveBeenCalledTimes(limits.modelCalls);
    expect(trackDGatewayAttempts(meter.receipts)).toBe(limits.modelCalls);
    expect(meter.receipts.slice(-2)).toEqual([
      expect.objectContaining({ relayRejection: 'model-call-limit', input: 0, output: 0, costUsd: 0 }),
      expect.objectContaining({ relayRejection: 'model-call-limit', input: 0, output: 0, costUsd: 0 }),
    ]);
  });

  it('keeps an upstream quota error distinct from a local relay rejection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 429 })));
    const meter = createMeter(config, false, AbortSignal.timeout(5000));
    expect((await meter.complete(body)).status).toBe(429);
    expect(meter.receipts[0]).toMatchObject({ status: 429, input: null, output: null, costUsd: null });
    expect(meter.receipts[0].relayRejection).toBeUndefined();
  });

  it('pins the configured reasoning effort for both agent request shapes', async () => {
    const upstream = vi.fn(async (_url: string, init: RequestInit) => {
      const forwarded = JSON.parse(init.body as string);
      expect(forwarded).toMatchObject({ model: config.model, reasoning_effort: 'none' });
      return forwarded.stream
        ? new Response(`data: ${JSON.stringify({ model: config.model })}\n\ndata: [DONE]\n\n`,
          { headers: { 'x-bifrost-provider': 'ollama', 'content-type': 'text/event-stream' } })
        : Response.json({ model: config.model }, { headers: { 'x-bifrost-provider': 'ollama' } });
    });
    vi.stubGlobal('fetch', upstream);
    const meter = createMeter({ ...config, reasoningEffort: 'none' }, false, AbortSignal.timeout(5000));
    expect((await meter.complete(body)).status).toBe(200);
    expect((await meter.complete({ ...body, stream: true, reasoning_effort: 'high' })).status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('rejects an unsupported reasoning setting before constructing gateway configuration', () => {
    vi.stubEnv('TRACK_D_REASONING_EFFORT', 'invalid');
    expect(() => gatewayConfig()).toThrow('TRACK_D_REASONING_EFFORT');
  });

  it('injects an outage before upstream, pins the model and caps output', async () => {
    const upstream = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(init.body as string)).toMatchObject({ model: config.model, max_tokens: limits.outputTokensPerCall });
      return Response.json({ id: 'gateway-receipt', model: 'coder:test', usage: { prompt_tokens: 22, completion_tokens: 8 } },
        { headers: { 'x-bifrost-provider': 'ollama' } });
    });
    vi.stubGlobal('fetch', upstream);
    const meter = createMeter(config, true, AbortSignal.timeout(5000));
    expect((await meter.complete(body)).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
    expect((await meter.complete({ ...body, model: 'different' })).status).toBe(400);
    expect((await meter.complete({ ...body, max_tokens: 99999 })).status).toBe(200);
    expect(meter.receipts.at(-1)).toMatchObject({ requestId: 'gateway-receipt', input: 22, output: 8, costUsd: null });
    expect(isPinnedReceipt(meter.receipts.at(-1)!, config.model)).toBe(true);
  });

  it('rejects a gateway fallback instead of treating it as the pinned model', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ model: config.model },
      { headers: { 'x-bifrost-provider': 'ollama', 'x-bifrost-routing-info-is-fallback': 'true' } }));
    const meter = createMeter(config, false, AbortSignal.timeout(5000));
    expect((await meter.complete(body)).status).toBe(502);
    expect(isPinnedReceipt(meter.receipts[0], config.model)).toBe(false);
  });

  it('accepts an OpenCode-style chat request through the private relay URL', async () => {
    const reply = vi.fn(async () => new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }));
    const relay = await openMeterPort(reply);
    try {
      const response = await fetch(`${relay.url}/chat/completions`, {
        method: 'POST', body: JSON.stringify({ ...body, stream: true }),
      });
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      expect(reply).toHaveBeenCalledWith({ ...body, stream: true });
    } finally { relay.close(); }
  });
});

it('rejects repeated task IDs and out-of-budget repeat counts', () => {
  const request = { mode: 'fixture', tasks: ['distance-width'], repeats: 3, fault: 'none' };
  expect(TrackDRequest.safeParse(request).success).toBe(true);
  expect(TrackDRequest.safeParse({ ...request, repeats: 4 }).success).toBe(false);
  expect(TrackDRequest.safeParse({ ...request, tasks: ['distance-width', 'distance-width'] }).success).toBe(false);
});

it('accepts selected entries and rejects selections incompatible with the run mode', () => {
  const request = { mode: 'live', tasks: ['distance-width'], repeats: 1, fault: 'none' };
  expect(TrackDRequest.safeParse({ ...request, agents: ['proofbench'] }).success).toBe(true);
  for (const agents of [[], ['reference-repair'], ['proofbench', 'proofbench']]) {
    expect(TrackDRequest.safeParse({ ...request, agents }).success).toBe(false);
  }
});

it.runIf(process.env.TRACK_D_TEST_GRADER === 'true')('rejects a plausible starter and a public-output hardcode', async () => {
  const worker = await verifyGrader();
  const grade = (source: string) => gradeTrackD(source, worker, 2857);
  expect((await grade(starter('distance-width', true))).every(check => check.outcome === 'passed')).toBe(true);
  const untouched = await grade(starter('distance-width'));
  expect(untouched[0].outcome).toBe('passed');
  expect(untouched[1].outcome).toBe('failed');
  const hardcoded = await grade('#include <cstdlib>\n#include <fstream>\n#include <string>\nint main() { std::ofstream(std::string(std::getenv("SD_OUT")) + "/distances.txt") << "2\\n0\\n0\\n2\\n"; }');
  expect(hardcoded[0].outcome).toBe('passed');
  expect(hardcoded.slice(1).every(check => check.outcome === 'failed')).toBe(true);
}, 75_000);

it.runIf(process.env.TRACK_D_TEST_GRADER === 'true')('returns bounded compiler diagnostics for a rejected C++ submission', async () => {
  const worker = await verifyGrader();
  const invalid = await gradeTrackD('int main() { return missing_symbol; }', worker);
  expect(invalid).toMatchObject([{ name: 'Build', outcome: 'failed', detail: expect.stringContaining('missing_symbol') }]);
  expect(invalid[0].detail).toContain('main.cpp');
  expect(invalid[0].detail).not.toContain('/proof/');

  const noisy = await gradeTrackD(`#error ${'x'.repeat(10_000)}\nint main() {}`, worker);
  expect(noisy).toMatchObject([{ name: 'Build', outcome: 'failed' }]);
  expect(noisy[0].detail.length).toBeLessThanOrEqual(2200);
  expect(noisy[0].detail).toContain('truncated');
}, 60_000);

it.runIf(process.env.TRACK_D_TEST_GRADER === 'true')('recovers from a broken model edit using real public compiler feedback', async () => {
  const worker = await verifyGrader();
  const baseline = starter('distance-width');
  const search = 'using Distance = std::uint32_t;';
  const repaired = baseline.replace(search, 'using Distance = std::uint64_t;');
  const requests: { messages: { content: string }[] }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const request = JSON.parse(init.body as string);
    requests.push(request);
    if (requests.length === 2) {
      expect(request.messages[1].content).toContain('does not name a type');
      expect(request.messages[1].content).toContain('Current main.cpp:\n' + baseline);
    }
    return Response.json({ model: config.model, choices: [{ message: { content: JSON.stringify({
      search, replacement: requests.length === 1 ? 'using Distance = std::uint65_t;' : 'using Distance = std::uint64_t;',
      explanation: 'Widen shortest-path distances.',
    }) } }] }, { headers: { 'x-bifrost-provider': 'ollama' } });
  }));
  const signal = AbortSignal.timeout(60_000);
  const meter = createMeter(config, false, signal);
  const result = await fixedProofBench({ baseline, prompt: 'Repair wide path sums.', worker, config, meter, signal, trace: () => {} });
  expect(result).toMatchObject({ source: repaired, steps: 2, toolCalls: 4 });
  expect(requests).toHaveLength(2);
  expect((await gradeTrackD(result.source, worker, 2857)).every(check => check.outcome === 'passed')).toBe(true);
}, 75_000);

it.runIf(process.env.TRACK_D_TEST_GRADER === 'true')('public regressions reject both graph defects before hidden grading', async () => {
  const worker = await verifyGrader();
  for (const task of ['distance-width', 'directed-edges'] as const) {
    const broken = await gradeTrackD(starter(task), worker);
    expect(broken[0].outcome).toBe('passed');
    expect(broken.some(check => check.outcome === 'failed')).toBe(true);
    expect((await gradeTrackD(starter(task, true), worker)).every(check => check.outcome === 'passed')).toBe(true);
  }
}, 75_000);
