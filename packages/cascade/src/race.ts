import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CascadeRouter } from './router';
import { runSandboxedTests, summarizeTestOutput } from './sandbox';
import { RACE_TASKS, type RaceTask } from './tasks/index';
import type { ChatMessage, RouteDecision, TierId, TokenUsage } from './types';
import type { CompletionBody, Upstream } from './upstream';

export type LaneId = 'small' | 'large' | 'cascade';

export const LANES: Array<{ id: LaneId; label: string; blurb: string }> = [
  { id: 'small', label: 'Small model only', blurb: 'Cheapest tier on every call' },
  { id: 'large', label: 'Big model only', blurb: 'What most coding agents do' },
  { id: 'cascade', label: 'ProofBench Cascade', blurb: 'Cheap first, escalate on proof of failure' },
];

/** Three routine bugs the small model fixes, and two where it gets stuck (measured with scripts/cascade-probe.ts). */
export const DEFAULT_SUITE = ['slugify', 'semver', 'lru', 'calc', 'duration'];

export type RaceEvent =
  | { type: 'race-start'; t: number; raceId: string; tasks: Array<Pick<RaceTask, 'id' | 'title' | 'difficulty'>>; lanes: typeof LANES; models: Record<TierId, { model: string; label: string }>; replay?: boolean; recordedAt?: string }
  | { type: 'attempt-start'; t: number; lane: LaneId; taskId: string; attempt: number; tier: TierId; model: string; decision?: RouteDecision }
  | {
      type: 'attempt';
      t: number;
      lane: LaneId;
      taskId: string;
      attempt: number;
      tier: TierId;
      model: string;
      usage: TokenUsage;
      latencyMs: number;
      passed: number;
      failed: number;
      ok: boolean;
      testOutput: string;
      decision?: RouteDecision;
      error?: string;
    }
  | { type: 'task-done'; t: number; lane: LaneId; taskId: string; ok: boolean; attempts: number }
  | { type: 'lane-done'; t: number; lane: LaneId; totals: LaneTotals }
  | { type: 'race-done'; t: number; totals: Record<LaneId, LaneTotals>; savedPath?: string }
  | { type: 'race-error'; t: number; message: string };

export interface LaneTotals {
  solved: number;
  tasks: number;
  calls: number;
  usage: Record<TierId, TokenUsage>;
  wallMs: number;
  escalations: number;
}

const SYSTEM_PROMPT =
  'You are a precise coding agent. You get one JavaScript file, its node:test suite and the latest test output. ' +
  'Reply with the complete corrected file in a single ```js code block and nothing else.';

export interface RaceOptions {
  taskIds?: string[];
  lanes?: LaneId[];
  maxAttempts?: number;
}

interface RaceRecord {
  id: string;
  startedAt: string;
  events: RaceEvent[];
  done: boolean;
}

/** Runs the same buggy tasks through three routing strategies at once and streams every step. */
export class RaceManager {
  private readonly races = new Map<string, RaceRecord & { emitter: EventEmitter }>();

  constructor(
    private readonly options: { router: CascadeRouter; upstream: Upstream; dataDir: string; workDir?: string; bundledDir?: string },
  ) {}

  private get raceDir(): string {
    return join(this.options.dataDir, 'cascade-races');
  }

  start(options: RaceOptions = {}): string {
    const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 6);
    const record = { id, startedAt: new Date().toISOString(), events: [] as RaceEvent[], done: false, emitter: new EventEmitter() };
    record.emitter.setMaxListeners(50);
    this.races.set(id, record);
    void this.run(record, options);
    return id;
  }

  /** Replays a saved live race with its original timing, scaled by `speed`. */
  async replay(savedId: string, speed = 1): Promise<string> {
    const saved = JSON.parse(await this.readSaved(savedId)) as { id: string; startedAt: string; events: RaceEvent[] };
    const id = `replay-${savedId}-${randomUUID().slice(0, 4)}`;
    const record = { id, startedAt: new Date().toISOString(), events: [] as RaceEvent[], done: false, emitter: new EventEmitter() };
    record.emitter.setMaxListeners(50);
    this.races.set(id, record);
    void (async () => {
      const started = Date.now();
      for (const event of saved.events) {
        const due = event.t / speed;
        const wait = due - (Date.now() - started);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        const replayed = (event.type === 'race-start' ? { ...event, replay: true, recordedAt: saved.startedAt, raceId: id } : event) as RaceEvent;
        this.push(record, replayed, true);
      }
      record.done = true;
      record.emitter.emit('end');
    })();
    return id;
  }

  subscribe(id: string, listener: (event: RaceEvent) => void, onEnd: () => void): (() => void) | undefined {
    const record = this.races.get(id);
    if (!record) return undefined;
    for (const event of record.events) listener(event);
    if (record.done) {
      onEnd();
      return () => {};
    }
    record.emitter.on('event', listener);
    record.emitter.once('end', onEnd);
    return () => {
      record.emitter.off('event', listener);
      record.emitter.off('end', onEnd);
    };
  }

  private async readSaved(id: string): Promise<string> {
    for (const dir of [this.raceDir, this.options.bundledDir].filter(Boolean) as string[]) {
      try {
        return await readFile(join(dir, `${safeId(id)}.json`), 'utf8');
      } catch {
        /* try the next directory */
      }
    }
    throw new Error(`No recorded race ${id}`);
  }

  /** Completed live races: this machine's recordings first, then the ones shipped in the repository. */
  async listSaved(): Promise<Array<{ id: string; startedAt: string; bundled: boolean; totals?: Record<LaneId, LaneTotals> }>> {
    const out: Array<{ id: string; startedAt: string; bundled: boolean; totals?: Record<LaneId, LaneTotals> }> = [];
    const seen = new Set<string>();
    for (const [dir, bundled] of [[this.raceDir, false], [this.options.bundledDir, true]] as Array<[string | undefined, boolean]>) {
      if (!dir) continue;
      let files: string[] = [];
      try {
        files = (await readdir(dir)).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 20);
      } catch {
        continue;
      }
      for (const file of files) {
        try {
          const saved = JSON.parse(await readFile(join(dir, file), 'utf8'));
          const done = saved.events?.find((e: RaceEvent) => e.type === 'race-done');
          if (!done || seen.has(saved.id)) continue;
          seen.add(saved.id);
          out.push({ id: saved.id, startedAt: saved.startedAt, bundled, totals: done.totals });
        } catch {
          /* skip unreadable recordings */
        }
      }
    }
    return out;
  }

  private push(record: RaceRecord & { emitter: EventEmitter }, event: RaceEvent, keepTime = false): void {
    const stamped = keepTime ? event : ({ ...event, t: Date.now() - Date.parse(record.startedAt) } as RaceEvent);
    record.events.push(stamped);
    record.emitter.emit('event', stamped);
  }

  private async run(record: RaceRecord & { emitter: EventEmitter }, options: RaceOptions): Promise<void> {
    const wanted = options.taskIds?.length ? options.taskIds : DEFAULT_SUITE;
    const tasks = wanted.map(id => RACE_TASKS.find(t => t.id === id)).filter((t): t is RaceTask => !!t);
    const lanes = LANES.filter(l => !options.lanes?.length || options.lanes.includes(l.id));
    const { router } = this.options;
    this.push(record, {
      type: 'race-start',
      t: 0,
      raceId: record.id,
      tasks: tasks.map(({ id, title, difficulty }) => ({ id, title, difficulty })),
      lanes,
      models: { small: { model: router.config.small.model, label: router.config.small.label }, large: { model: router.config.large.model, label: router.config.large.label } },
    });
    try {
      const results = await Promise.all(lanes.map(lane => this.runLane(record, lane.id, tasks, options.maxAttempts ?? 5)));
      const totals = Object.fromEntries(lanes.map((lane, i) => [lane.id, results[i]])) as Record<LaneId, LaneTotals>;
      const savedPath = await this.save(record, totals);
      this.push(record, { type: 'race-done', t: 0, totals, savedPath });
      await this.save(record, totals);
    } catch (error) {
      this.push(record, { type: 'race-error', t: 0, message: (error as Error).message });
    } finally {
      record.done = true;
      record.emitter.emit('end');
    }
  }

  private async save(record: RaceRecord, _totals: Record<LaneId, LaneTotals>): Promise<string> {
    await mkdir(this.raceDir, { recursive: true });
    const path = join(this.raceDir, `${record.id}.json`);
    await writeFile(path, JSON.stringify({ id: record.id, startedAt: record.startedAt, events: record.events }, null, 1));
    return path;
  }

  private async runLane(record: RaceRecord & { emitter: EventEmitter }, lane: LaneId, tasks: RaceTask[], maxAttempts: number): Promise<LaneTotals> {
    const totals: LaneTotals = { solved: 0, tasks: tasks.length, calls: 0, usage: { small: { input: 0, output: 0 }, large: { input: 0, output: 0 } }, wallMs: 0, escalations: 0 };
    const started = Date.now();
    for (const task of tasks) {
      const ok = await this.runTask(record, lane, task, maxAttempts, totals);
      if (ok) totals.solved += 1;
    }
    totals.wallMs = Date.now() - started;
    this.push(record, { type: 'lane-done', t: 0, lane, totals });
    return totals;
  }

  private async runTask(record: RaceRecord & { emitter: EventEmitter }, lane: LaneId, task: RaceTask, maxAttempts: number, totals: LaneTotals): Promise<boolean> {
    const dir = join(this.options.workDir ?? join(tmpdir(), 'proofbench-cascade'), record.id, lane, task.id);
    const initial = await runSandboxedTests(dir, { [task.file]: task.source, [task.testFile]: task.tests }, task.testFile);
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `Task: ${task.prompt}\n\nFile ${task.file}:\n\`\`\`js\n${task.source}\`\`\`\n\n` +
          `Tests ${task.testFile}:\n\`\`\`js\n${task.tests}\`\`\`\n\nCurrent test output:\n${summarizeTestOutput(initial.output)}`,
      },
    ];
    const sessionId = `race:${record.id}:${task.id}`;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let tier: TierId = lane === 'large' ? 'large' : 'small';
      let decision: RouteDecision | undefined;
      let content = '';
      let usage: TokenUsage = { input: 0, output: 0 };
      let latencyMs = 0;
      let error: string | undefined;
      const request = { messages, max_tokens: 6000, temperature: 0 };
      try {
        if (lane === 'cascade') {
          const routed = this.options.router.decide(sessionId, request, 'proofbench-race');
          decision = routed.decision;
          tier = decision.tier;
          if (decision.kind === 'escalate') totals.escalations += 1;
          this.push(record, { type: 'attempt-start', t: 0, lane, taskId: task.id, attempt, tier, model: decision.model, decision });
          const result = await this.options.router.send(sessionId, request, routed);
          ({ usage, latencyMs } = result);
          if (result.status >= 400) error = describeError(result.body);
          content = readContent(result.body);
        } else {
          const { model, params } = this.options.router.config[tier];
          this.push(record, { type: 'attempt-start', t: 0, lane, taskId: task.id, attempt, tier, model });
          const result = await this.options.upstream.complete({ ...request, ...params, model });
          ({ usage, latencyMs } = result);
          if (result.status >= 400) error = describeError(result.body);
          content = readContent(result.body);
        }
      } catch (e) {
        error = (e as Error).message;
      }
      totals.calls += 1;
      totals.usage[tier].input += usage.input;
      totals.usage[tier].output += usage.output;
      const code = extractCode(content);
      const check = code
        ? await runSandboxedTests(dir, { [task.file]: code }, task.testFile)
        : { passed: 0, failed: 1, ok: false, output: error ? `Model call failed: ${error}` : 'No ```js code block in the reply.', timedOut: false, durationMs: 0 };
      const testOutput = summarizeTestOutput(check.output);
      this.push(record, {
        type: 'attempt',
        t: 0,
        lane,
        taskId: task.id,
        attempt,
        tier,
        model: this.options.router.config[tier].model,
        usage,
        latencyMs,
        passed: check.passed,
        failed: check.failed,
        ok: check.ok,
        testOutput: testOutput.slice(0, 1500),
        decision,
        error,
      });
      if (check.ok) {
        // Let the router see the verified fix so the session de-escalates, as a real agent's next turn would.
        if (lane === 'cascade') this.options.router.decide(sessionId, { messages: [...messages, { role: 'assistant', content }, { role: 'user', content: `${testOutput}\n# fail 0\nAll tests passed.` }] }, 'proofbench-race');
        this.push(record, { type: 'task-done', t: 0, lane, taskId: task.id, ok: true, attempts: attempt });
        return true;
      }
      messages.push({ role: 'assistant', content: content || '(empty reply)' });
      messages.push({ role: 'user', content: `Tests still fail:\n${testOutput}\n\nReply with the complete corrected ${task.file}.` });
    }
    this.push(record, { type: 'task-done', t: 0, lane, taskId: task.id, ok: false, attempts: maxAttempts });
    return false;
  }
}

function readContent(body: CompletionBody): string {
  const message = body?.choices?.[0]?.message;
  return typeof message?.content === 'string' ? message.content : '';
}

function describeError(body: CompletionBody): string {
  const error = body?.error;
  return String(typeof error === 'string' ? error : (error?.message ?? 'model call failed')).slice(0, 300);
}

/** The last fenced JS block, or the whole reply when it is plainly code. */
export function extractCode(content: string): string | undefined {
  const blocks = [...content.matchAll(/```(?:js|javascript|cjs|node)?\s*\n([\s\S]*?)```/g)];
  if (blocks.length) return blocks[blocks.length - 1][1];
  if (/module\.exports|function |class /.test(content) && !content.includes('```')) return content;
  return undefined;
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}
