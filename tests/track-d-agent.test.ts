import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixedProofBench, liveAgents, TrackDPublicCheckUnavailableError } from '../implementations/bifrost-02/src/track-d/agents';
import { limits } from '../implementations/bifrost-02/src/track-d/gateway';
import { gradeTrackD, starter } from '../implementations/bifrost-02/src/track-d/grader';
import { createTrackDSession, executeTrackD } from '../implementations/bifrost-02/src/track-d/session';

vi.mock('../implementations/bifrost-02/src/track-d/grader', async importOriginal => ({
  ...await importOriginal<typeof import('../implementations/bifrost-02/src/track-d/grader')>(),
  gradeTrackD: vi.fn(),
}));

const grade = vi.mocked(gradeTrackD);
const baseline = starter('distance-width');
const distanceType = 'using Distance = std::uint32_t;';
const repairedType = 'using Distance = std::uint64_t;';
const invalidType = 'using Distance = std::uint65_t;';
const compilerFailure = { name: 'Build', outcome: 'failed' as const, detail: "main.cpp:12:23: error: 'uint65_t' in namespace 'std' does not name a type" };
const smokePassed = { name: 'Public smoke case', outcome: 'passed' as const, detail: 'Exact output matched.' };

function contextFor(patches: { search: string; replacement: string; explanation: string }[]) {
  const complete = vi.fn(async (_body: Record<string, unknown>) => {
    const patch = patches.shift();
    return patch ? Response.json({ choices: [{ message: { content: JSON.stringify(patch) } }] })
      : new Response(null, { status: 500 });
  });
  const context: Parameters<typeof fixedProofBench>[0] = {
    baseline, prompt: 'Fix wide path sums in main.cpp.', worker: { kind: 'docker', id: 'test-worker' },
    config: { origin: 'http://127.0.0.1:8089', model: 'ollama/coder:test', key: 'test', cli: 'opencode' },
    meter: { receipts: [], complete }, signal: new AbortController().signal, trace: vi.fn(),
  };
  return { context, complete };
}

beforeEach(() => { grade.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Graph Repair edit recovery', () => {
  it('feeds back compiler errors and retries from the last buildable source', async () => {
    grade.mockResolvedValueOnce([compilerFailure]).mockResolvedValueOnce([smokePassed]);
    const { context, complete } = contextFor([
      { search: distanceType, replacement: invalidType, explanation: 'Invalid attempt.' },
      { search: distanceType, replacement: repairedType, explanation: 'Use 64-bit distances.' },
    ]);
    const result = await fixedProofBench(context);
    expect(result).toMatchObject({ source: baseline.replace(distanceType, repairedType), steps: 2, toolCalls: 4, agentNote: 'Use 64-bit distances.' });
    const retry = complete.mock.calls[1][0].messages as { content: string }[];
    expect(retry[1].content).toContain(compilerFailure.detail);
    expect(retry[1].content).toContain('Current main.cpp:\n' + baseline);
    expect(grade.mock.calls.map(call => call[0])).toEqual([
      baseline.replace(distanceType, invalidType), baseline.replace(distanceType, repairedType),
    ]);
    expect(grade.mock.calls.every(call => call.length === 2)).toBe(true);
    expect(context.trace).toHaveBeenCalledWith('adapter', expect.stringContaining('last buildable'));
  });

  it('spends a turn on a transient gateway 502 instead of submitting the unfinished edit', async () => {
    grade.mockResolvedValueOnce([smokePassed]);
    const { context, complete } = contextFor([{ search: distanceType, replacement: repairedType, explanation: 'Use 64-bit distances.' }]);
    const answer = complete.getMockImplementation()!;
    complete.mockImplementationOnce(async () => new Response(null, { status: 502 })).mockImplementation(answer);
    const result = await fixedProofBench(context);
    expect(result).toMatchObject({ source: baseline.replace(distanceType, repairedType), steps: 2 });
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it('does not return a rejected edit or its explanation when repair attempts fail', async () => {
    grade.mockResolvedValue([compilerFailure]);
    const patch = { search: distanceType, replacement: invalidType, explanation: 'This did not compile.' };
    const { context, complete } = contextFor([patch, patch]);
    const result = await fixedProofBench(context);
    expect(result.source).toBe(baseline);
    expect(result.agentNote).toBeUndefined();
    expect(complete).toHaveBeenCalledTimes(2);
    expect(grade).toHaveBeenCalledTimes(2);
  });

  it('keeps a buildable intermediate edit when the following edit fails to compile', async () => {
    grade.mockResolvedValueOnce([{ name: 'Public smoke case', outcome: 'failed', detail: 'Output did not match.' }])
      .mockResolvedValueOnce([compilerFailure]);
    const { context } = contextFor([
      { search: distanceType, replacement: repairedType, explanation: 'First buildable edit.' },
      { search: repairedType, replacement: invalidType, explanation: 'Rejected regression.' },
    ]);
    const result = await fixedProofBench(context);
    expect(result.source).toBe(baseline.replace(distanceType, repairedType));
    expect(result.agentNote).toBe('First buildable edit.');
  });

  it.each(['unavailable', 'exception', 'empty'] as const)('stops when public checks return %s instead of keeping an unvalidated edit', async failure => {
    if (failure === 'exception') grade.mockRejectedValue(new Error('Oracle process failed.'));
    else grade.mockResolvedValue(failure === 'empty' ? [] : [
      { name: 'Grader worker', outcome: 'unavailable', detail: 'Worker did not start.' },
    ]);
    const { context, complete } = contextFor([
      { search: distanceType, replacement: repairedType, explanation: 'Unchecked proposal.' },
    ]);
    await expect(fixedProofBench(context)).rejects.toBeInstanceOf(TrackDPublicCheckUnavailableError);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(grade).toHaveBeenCalledTimes(1);
    expect(context.trace).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('last buildable'));
  });

  it('records a public-check infrastructure failure as unavailable in the final session', async () => {
    grade.mockResolvedValue([{ name: 'Grader worker', outcome: 'unavailable', detail: 'Worker did not start.' }]);
    const { context } = contextFor([]);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ model: context.config.model,
      choices: [{ message: { content: JSON.stringify({ search: distanceType, replacement: repairedType }) } }],
    }, { headers: { 'x-bifrost-provider': 'ollama' } })));
    const session = createTrackDSession({ mode: 'live', agents: ['proofbench'], tasks: ['distance-width'], repeats: 1, fault: 'none' }, context.worker, context.config);
    await executeTrackD(session, context.config, async () => {});
    expect(session).toMatchObject({ status: 'completed', comparable: false,
      runs: [{ verdict: 'unavailable', unavailableReason: 'grader-error', checks: [], diff: '' }],
    });
    expect(grade).toHaveBeenCalledTimes(1);
  });

  it('preserves observed usage and model comparability when extra requests are rejected locally', async () => {
    const { context } = contextFor([]);
    const upstream = vi.fn(async () => Response.json({ model: context.config.model,
      usage: { prompt_tokens: 20, completion_tokens: 5 } }, { headers: { 'x-bifrost-provider': 'ollama' } }));
    vi.stubGlobal('fetch', upstream);
    grade.mockResolvedValue([{ name: 'Public regression', outcome: 'failed', detail: 'The starter was unchanged.' }]);
    vi.spyOn(liveAgents, 'opencode').mockImplementation(async current => {
      for (let index = 0; index < limits.modelCalls + 2; index++) await current.meter.complete({
        model: current.config.model, messages: [{ role: 'user', content: 'Fixture request.' }],
      });
      return { source: current.baseline, steps: 1, toolCalls: 0 };
    });
    const session = createTrackDSession({ mode: 'live', agents: ['opencode'], tasks: ['distance-width'], repeats: 1, fault: 'none' }, context.worker, context.config);
    await executeTrackD(session, context.config, async () => {});
    expect(session).toMatchObject({ comparable: true, status: 'completed', runs: [{
      verdict: 'failed', inputTokens: limits.modelCalls * 20, outputTokens: limits.modelCalls * 5, costUsd: null,
    }] });
    expect(upstream).toHaveBeenCalledTimes(limits.modelCalls);
  });
});
