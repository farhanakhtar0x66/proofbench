// Folds the race event stream into view state. Live races and recorded replays
// share this reducer, so a replay renders exactly what the live run showed.

export type LaneId = 'small' | 'large' | 'cascade';
export type TierId = 'small' | 'large';

export interface Usage { input: number; output: number }

export interface RouteDecision {
  kind: 'start' | 'stay' | 'escalate' | 'deescalate' | 'hold-large';
  tier: TierId;
  model: string;
  reason: string;
  compression?: { before: number; after: number; skipped?: string };
}

export interface Attempt {
  attempt: number;
  tier: TierId;
  ok?: boolean;
  passed?: number;
  failed?: number;
  usage?: Usage;
  latencyMs?: number;
  decision?: RouteDecision;
  error?: string;
  testOutput?: string;
}

export interface TaskView { id: string; title: string; difficulty: 'routine' | 'tricky' }

export interface LaneView {
  id: LaneId;
  label: string;
  blurb: string;
  tasks: Record<string, { attempts: Attempt[]; status: 'waiting' | 'running' | 'passed' | 'failed' }>;
  usage: Record<TierId, Usage>;
  solved: number;
  calls: number;
  escalations: Array<{ taskId: string; decision: RouteDecision; t: number }>;
  doneAt?: number;
  lastT: number;
}

export interface RaceView {
  raceId?: string;
  replay: boolean;
  recordedAt?: string;
  tasks: TaskView[];
  lanes: LaneView[];
  models: Record<TierId, { model: string; label: string }>;
  done: boolean;
  error?: string;
  lastT: number;
}

// Wire events are plain JSON from the API (packages/cascade/src/race.ts RaceEvent); fields are read per type below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RaceEvent = { type: string; t: number; [key: string]: any };

export const emptyRace: RaceView = { replay: false, tasks: [], lanes: [], models: { small: { model: '', label: '' }, large: { model: '', label: '' } }, done: false, lastT: 0 };

function zero(): Record<TierId, Usage> {
  return { small: { input: 0, output: 0 }, large: { input: 0, output: 0 } };
}

export function applyRaceEvent(state: RaceView, event: RaceEvent): RaceView {
  if (event.type === 'race-start') {
    const tasks: TaskView[] = event.tasks;
    return {
      raceId: event.raceId,
      replay: Boolean(event.replay),
      recordedAt: event.recordedAt,
      tasks,
      models: event.models,
      done: false,
      lastT: 0,
      lanes: (event.lanes as Array<{ id: LaneId; label: string; blurb: string }>).map(lane => ({
        ...lane,
        tasks: Object.fromEntries(tasks.map(task => [task.id, { attempts: [], status: 'waiting' as const }])),
        usage: zero(),
        solved: 0,
        calls: 0,
        escalations: [],
        lastT: 0,
      })),
    };
  }
  if (event.type === 'race-done') return { ...state, done: true, lastT: Math.max(state.lastT, event.t) };
  if (event.type === 'race-error') return { ...state, error: event.message, done: true };
  if (!('lane' in event)) return state;

  const lanes = state.lanes.map(lane => {
    if (lane.id !== event.lane) return lane;
    const next: LaneView = { ...lane, tasks: { ...lane.tasks }, usage: { small: { ...lane.usage.small }, large: { ...lane.usage.large } }, lastT: Math.max(lane.lastT, event.t) };
    const task = event.taskId ? next.tasks[event.taskId] : undefined;
    if (event.type === 'attempt-start' && task) {
      const attempts = [...task.attempts.filter(a => a.attempt !== event.attempt), { attempt: event.attempt, tier: event.tier, decision: event.decision }];
      next.tasks[event.taskId] = { attempts, status: 'running' };
      if (event.decision?.kind === 'escalate') next.escalations = [...lane.escalations, { taskId: event.taskId, decision: event.decision, t: event.t }];
    }
    if (event.type === 'attempt' && task) {
      const done: Attempt = {
        attempt: event.attempt,
        tier: event.tier,
        ok: event.ok,
        passed: event.passed,
        failed: event.failed,
        usage: event.usage,
        latencyMs: event.latencyMs,
        decision: event.decision,
        error: event.error,
        testOutput: event.testOutput,
      };
      next.tasks[event.taskId] = { attempts: [...task.attempts.filter(a => a.attempt !== event.attempt), done].sort((a, b) => a.attempt - b.attempt), status: 'running' };
      next.usage[event.tier as TierId].input += event.usage.input;
      next.usage[event.tier as TierId].output += event.usage.output;
      next.calls += 1;
    }
    if (event.type === 'task-done' && task) {
      next.tasks[event.taskId] = { ...task, status: event.ok ? 'passed' : 'failed' };
      if (event.ok) next.solved += 1;
    }
    if (event.type === 'lane-done') next.doneAt = event.t;
    return next;
  });
  return { ...state, lanes, lastT: Math.max(state.lastT, event.t) };
}

export interface PriceRef { id: string; label: string; input: number; output: number }

export function laneCost(lane: LaneView, prices: Record<TierId, PriceRef>): number {
  return (['small', 'large'] as const).reduce((sum, tier) => sum + (lane.usage[tier].input * prices[tier].input + lane.usage[tier].output * prices[tier].output) / 1_000_000, 0);
}

export function laneTokens(lane: LaneView): number {
  return lane.usage.small.input + lane.usage.small.output + lane.usage.large.input + lane.usage.large.output;
}
