import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CascadeRouter,
  DEFAULT_CONFIG,
  RaceManager,
  detectOutcome,
  extractCode,
  runSandboxedTests,
  type CascadeEvent,
  type ChatRequest,
  type RaceEvent,
  type Upstream,
  type UpstreamResult,
} from '../packages/cascade/src/index';
import { applyRaceEvent, emptyRace } from '../apps/web/src/race-state';

const FAIL = 'not ok 2 - numeric sort\n  error: Expected values to be strictly equal\n# pass 1\n# fail 1';
const PASS = '# pass 2\n# fail 0';

function reply(content: string, usage = { prompt_tokens: 100, completion_tokens: 20 }): UpstreamResult {
  return { status: 200, body: { choices: [{ message: { role: 'assistant', content } }], usage }, usage: { input: usage.prompt_tokens, output: usage.completion_tokens }, latencyMs: 5 };
}

class FakeUpstream implements Upstream {
  calls: ChatRequest[] = [];
  constructor(private readonly answer: (request: ChatRequest) => string = () => '```js\nmodule.exports = 1;\n```') {}
  async complete(request: ChatRequest) {
    this.calls.push(request);
    return reply(this.answer(request));
  }
  async stream(request: ChatRequest) {
    this.calls.push(request);
    const chunks = [
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":42,"completion_tokens":7}}\n\n',
      'data: [DONE]\n\n',
    ];
    return new Response(new ReadableStream({ start(c) { for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk)); c.close(); } }), { status: 200 });
  }
}

const task = (extra: ChatRequest['messages'] = []): ChatRequest => ({
  messages: [{ role: 'system', content: 'You fix code.' }, { role: 'user', content: 'Fix median() so numbers sort numerically.' }, ...extra],
});

describe('Cascade outcome signals', () => {
  it('reads TAP, pytest-style and cargo-style results from the newest feedback', () => {
    expect(detectOutcome(task().messages).outcome).toBe('unknown');
    expect(detectOutcome(task([{ role: 'assistant', content: 'patch' }, { role: 'user', content: FAIL }]).messages).outcome).toBe('fail');
    expect(detectOutcome(task([{ role: 'assistant', content: 'patch' }, { role: 'tool', content: '3 failed, 9 passed in 0.4s' }]).messages).outcome).toBe('fail');
    expect(detectOutcome(task([{ role: 'assistant', content: 'patch' }, { role: 'user', content: PASS }]).messages).outcome).toBe('pass');
    expect(detectOutcome(task([{ role: 'assistant', content: 'patch' }, { role: 'tool', content: 'test result: ok. 12 passed; 0 failed' }]).messages).outcome).toBe('pass');
    // Feedback from before the last assistant turn does not count.
    expect(detectOutcome(task([{ role: 'user', content: FAIL }, { role: 'assistant', content: 'patch' }]).messages).outcome).toBe('unknown');
  });

  it('keys sessions by header, or by a stable hash of the opening messages', () => {
    expect(CascadeRouter.sessionKey(task(), 'abc')).toBe('abc');
    expect(CascadeRouter.sessionKey(task())).toBe(CascadeRouter.sessionKey(task([{ role: 'assistant', content: 'x' }])));
    expect(CascadeRouter.sessionKey(task())).not.toBe(CascadeRouter.sessionKey({ messages: [{ role: 'user', content: 'other' }] }));
  });
});

describe('Cascade routing', () => {
  it('starts small, escalates after repeated failure with an autopsy, and de-escalates after a verified fix', async () => {
    const upstream = new FakeUpstream();
    const router = new CascadeRouter(upstream, DEFAULT_CONFIG);
    const events: CascadeEvent[] = [];
    router.events.on('event', e => events.push(e));

    const first = await router.complete('s1', task());
    expect(first.decision).toMatchObject({ kind: 'start', tier: 'small' });

    // Realistic replies: whole files, which is what makes resending failed turns expensive.
    const file = (tag: string) => '```js\n// ' + tag + '\n' + 'const value = compute(input);\n'.repeat(300) + '```';
    const turn2 = task([{ role: 'assistant', content: file('A') }, { role: 'user', content: FAIL }]);
    expect((await router.complete('s1', turn2)).decision).toMatchObject({ kind: 'stay', tier: 'small' });

    const turn3 = task([{ role: 'assistant', content: file('A') }, { role: 'user', content: FAIL }, { role: 'assistant', content: file('B') }, { role: 'user', content: FAIL }]);
    const escalated = await router.complete('s1', turn3);
    expect(escalated.decision.kind).toBe('escalate');
    expect(escalated.decision.tier).toBe('large');
    const sent = upstream.calls.at(-1)!;
    expect(sent.model).toBe(DEFAULT_CONFIG.large.model);
    expect(sent.chat_template_kwargs).toEqual({ enable_thinking: false });
    // System + task + autopsy + newest failure: the failed turns are replaced, not resent.
    expect(sent.messages).toHaveLength(4);
    expect(String(sent.messages[2].content)).toContain('Structured Failure Autopsy');
    expect(escalated.decision.compression!.after).toBeLessThan(escalated.decision.compression!.before);
    expect(escalated.body.cascade).toMatchObject({ tier: 'large', decision: 'escalate' });

    const fixed = task([...turn3.messages.slice(2), { role: 'assistant', content: 'patch C' }, { role: 'user', content: PASS }]);
    expect((await router.complete('s1', fixed)).decision).toMatchObject({ kind: 'deescalate', tier: 'small' });

    const summary = router.sessionSummaries()[0];
    expect(summary).toMatchObject({ id: 's1', escalations: 1, turns: 4, tier: 'small' });
    expect(summary.usage.large.input).toBe(100);
    expect(events.filter(e => e.type === 'usage')).toHaveLength(4);
  });

  it('pins a tier by model name so baselines take the same path', async () => {
    const upstream = new FakeUpstream();
    const router = new CascadeRouter(upstream, DEFAULT_CONFIG);
    const pinned = await router.complete(CascadeRouter.sessionKey({ ...task(), model: 'cascade:large' }), { ...task(), model: 'cascade:large' });
    expect(pinned.decision).toMatchObject({ tier: 'large', kind: 'start' });
    expect(upstream.calls.at(-1)!.model).toBe(DEFAULT_CONFIG.large.model);
    expect(CascadeRouter.sessionKey({ ...task(), model: 'cascade:large' })).not.toBe(CascadeRouter.sessionKey({ ...task(), model: 'cascade' }));
    expect(CascadeRouter.pinnedTier('gpt-4o')).toBeUndefined();
  });

  it('keeps a short history instead of swapping in a larger autopsy', async () => {
    const upstream = new FakeUpstream();
    const router = new CascadeRouter(upstream, { ...DEFAULT_CONFIG, maxSmallFailures: 1 });
    await router.complete('short', task());
    const request = task([{ role: 'assistant', content: 'x' }, { role: 'user', content: FAIL }]);
    const escalated = await router.complete('short', request);
    expect(escalated.decision.tier).toBe('large');
    expect(escalated.decision.compression?.skipped).toMatch(/smaller than the autopsy/);
    expect(upstream.calls.at(-1)!.messages).toEqual(request.messages);
  });

  it('compacts tool-call transcripts without dropping or reordering any call or result', async () => {
    const upstream = new FakeUpstream();
    const router = new CascadeRouter(upstream, DEFAULT_CONFIG);
    const log = FAIL + '\n' + 'at evaluate (calc.js:12:5)\n'.repeat(120);
    const call = (id: string) => ({ role: 'assistant' as const, content: null, tool_calls: [{ id, type: 'function', function: { name: 'bash', arguments: '{"command":"node calc.test.js"}' } }] });
    const result = (id: string) => ({ role: 'tool' as const, tool_call_id: id, content: log });
    await router.complete('tools', task());
    await router.complete('tools', task([call('t1'), result('t1')]));
    const request = task([call('t1'), result('t1'), call('t2'), result('t2')]);
    const escalated = await router.complete('tools', request);
    expect(escalated.decision.tier).toBe('large');
    expect(escalated.decision.compression?.skipped).toBeUndefined();
    const sent = upstream.calls.at(-1)!.messages;
    // Every tool call keeps its result, in order; only the superseded log text shrank.
    expect(sent.filter(m => m.role === 'tool').map(m => m.tool_call_id)).toEqual(['t1', 't2']);
    expect(sent.filter(m => m.tool_calls).map(m => (m.tool_calls as Array<{ id: string }>)[0].id)).toEqual(['t1', 't2']);
    expect(String(sent.find(m => m.tool_call_id === 't1')!.content)).toContain('elided by Cascade');
    expect(sent.find(m => m.tool_call_id === 't2')!.content).toBe(log);
    expect(String(sent[2].content)).toContain('Structured Failure Autopsy');
    expect(escalated.decision.compression!.after).toBeLessThan(escalated.decision.compression!.before);
  });

  it('streams through unchanged and records usage from the final chunk', async () => {
    const router = new CascadeRouter(new FakeUpstream(), DEFAULT_CONFIG);
    const usage: CascadeEvent[] = [];
    router.events.on('event', e => e.type === 'usage' && usage.push(e));
    const { body, decision } = await router.stream('st', { ...task(), stream: true });
    expect(decision.tier).toBe('small');
    const text = await new Response(body).text();
    expect(text).toContain('"content":"hi"');
    expect(text).toContain('[DONE]');
    expect(usage[0]).toMatchObject({ type: 'usage', usage: { input: 42, output: 7 }, status: 'ok' });
  });
});

describe('Cascade sandbox', () => {
  it('runs tests, and denies file reads outside the task folder, child processes and the network', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-sbx-'));
    const tests = `const test=require('node:test');const assert=require('node:assert');
test('works',()=>assert.equal(require('./m.js').add(2,3),5));
test('no fs escape',()=>assert.throws(()=>require('fs').readFileSync('/etc/hosts'),/ERR_ACCESS_DENIED|restricted/));
test('no child',()=>assert.throws(()=>require('child_process').execSync('echo hi')));
test('no net',async()=>{await assert.rejects(fetch('http://127.0.0.1:9'))});`;
    const result = await runSandboxedTests(dir, { 'm.js': 'module.exports={add:(a,b)=>a+b}', 'm.test.js': tests }, 'm.test.js');
    expect(result.passed).toBe(4);
    expect(result.ok).toBe(true);
  });

  it('kills runaway code and reports a failure', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-sbx-'));
    const result = await runSandboxedTests(dir, { 'loop.test.js': "require('node:test')('spin',()=>{for(;;){}})" }, 'loop.test.js', 1500);
    expect(result.timedOut).toBe(true);
    expect(result.ok).toBe(false);
  });

  it('takes the last fenced block from a reply', () => {
    expect(extractCode('Here:\n```js\nconst a=1;\n```\nfixed:\n```javascript\nconst a=2;\n```')).toBe('const a=2;\n');
    expect(extractCode('No code here.')).toBeUndefined();
  });
});

describe('Cascade race', () => {
  const fix = "'use strict';\nfunction slugify(t){return t.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}\nmodule.exports={slugify};\n";
  const buggy = "'use strict';\nfunction slugify(text){return text.toLowerCase().replace(/[^a-z0-9]/g,'-');}\nmodule.exports={slugify};\n";

  it('runs three lanes on real sandboxed tests; the small model stays stuck, Cascade escalates and solves', async () => {
    // The small model keeps returning the same buggy file; the large model returns the fix.
    const upstream = new FakeUpstream(request => '```js\n' + (request.model === DEFAULT_CONFIG.large.model ? fix : buggy) + '```');
    const router = new CascadeRouter(upstream, DEFAULT_CONFIG);
    const dataDir = mkdtempSync(join(tmpdir(), 'pb-race-'));
    const races = new RaceManager({ router, upstream, dataDir, workDir: join(dataDir, 'work') });
    const id = races.start({ taskIds: ['slugify'], maxAttempts: 4 });
    const events: RaceEvent[] = [];
    await new Promise<void>(resolve => races.subscribe(id, e => events.push(e), resolve));

    const done = events.find(e => e.type === 'race-done');
    if (done?.type !== 'race-done') throw new Error('race did not finish');
    expect(done.totals.small.solved).toBe(0);
    expect(done.totals.large.solved).toBe(1);
    expect(done.totals.cascade).toMatchObject({ solved: 1, escalations: 1, calls: 3 });
    expect(events.some(e => e.type === 'attempt-start' && e.lane === 'cascade' && e.decision?.kind === 'escalate')).toBe(true);
    expect(readdirSync(join(dataDir, 'cascade-races'))).toHaveLength(1);
  });

  it('the UI reducer reproduces the recorded live race totals exactly', () => {
    const dir = join(process.cwd(), 'docs/evidence/cascade');
    for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
      const saved = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { events: RaceEvent[] };
      const view = saved.events.reduce((state, event) => applyRaceEvent(state, event as never), emptyRace);
      const done = saved.events.find(e => e.type === 'race-done');
      if (done?.type !== 'race-done') throw new Error(`${file} has no result`);
      expect(view.done).toBe(true);
      for (const lane of view.lanes) {
        expect(lane.solved).toBe(done.totals[lane.id].solved);
        expect(lane.calls).toBe(done.totals[lane.id].calls);
        expect(lane.usage).toEqual(done.totals[lane.id].usage);
      }
    }
  });
});
