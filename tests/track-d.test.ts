import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrackDRequest } from '../packages/contracts/src/track-d';
import { createMeter, isPinnedReceipt, limits, openMeterPort } from '../implementations/bifrost-02/src/track-d/gateway';
import { gradeTrackD, starter, verifyGrader } from '../implementations/bifrost-02/src/track-d/grader';

const config = { origin: 'http://127.0.0.1:8089', model: 'ollama/coder:test', key: 'test', cli: 'opencode' };
const body = { model: config.model, messages: [{ role: 'user', content: 'Fix main.cpp' }] };

afterEach(() => vi.unstubAllGlobals());

describe('Track D model relay', () => {
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
