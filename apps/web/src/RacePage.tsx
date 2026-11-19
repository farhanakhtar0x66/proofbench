import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, CirclePlay, Copy, Flag, History, Radio, Rocket, Zap } from 'lucide-react';
import { EncryptedText } from './EncryptedText';
import { PRICES, formatUsd } from './pricing';
import { applyRaceEvent, emptyRace, laneCost, laneTokens, type Attempt, type LaneView, type PriceRef, type RaceEvent, type RaceView, type TierId } from './race-state';
import './race.css';

interface Status {
  gateway: 'up' | 'down';
  live: boolean;
  virtualKey: boolean;
  tiers: Record<TierId, { model: string; label: string }>;
  policy: { maxSmallFailures: number; autopsyBudgetTokens: number };
  endpoint: string;
}

interface SavedTotals { solved: number; tasks: number; calls: number; wallMs: number; escalations: number; usage: Record<TierId, { input: number; output: number }> }
interface SavedRace { id: string; startedAt: string; bundled: boolean; totals?: Record<'small' | 'large' | 'cascade', SavedTotals> }

interface FeedItem { key: string; at: string; session: string; text: string; tone: 'start' | 'escalate' | 'deescalate' | 'usage' | 'error' }

const DEFAULT_PRICES: Record<TierId, string> = { small: 'gpt-6-luna', large: 'claude-sonnet-5-5' };

/** Presentation mode fires this: run live when the gateway is up, otherwise replay the selected (default: latest) recorded live race. */
export const START_RACE_EVENT = 'proofbench:start-race';

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function compact(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();
}

/** Ticks a race clock locally between events so meters move smoothly. */
function useRaceClock(race: RaceView, running: boolean): number {
  const [now, setNow] = useState(0);
  const anchor = useRef<{ t: number; at: number }>({ t: 0, at: performance.now() });
  useEffect(() => {
    anchor.current = { t: race.lastT, at: performance.now() };
  }, [race.lastT]);
  useEffect(() => {
    if (!running) {
      setNow(race.lastT);
      return;
    }
    const id = window.setInterval(() => setNow(anchor.current.t + (performance.now() - anchor.current.at)), 100);
    return () => window.clearInterval(id);
  }, [running, race.lastT]);
  return now;
}

export function RacePage() {
  const [status, setStatus] = useState<Status>();
  const [saved, setSaved] = useState<SavedRace[]>([]);
  const [race, setRace] = useState<RaceView>(emptyRace);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [speed, setSpeed] = useState(4);
  const [replayId, setReplayId] = useState('');
  const [priceIds, setPriceIds] = useState<Record<TierId, string>>(DEFAULT_PRICES);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const source = useRef<EventSource | null>(null);

  const prices = useMemo(() => {
    const find = (id: string) => (PRICES.find(p => p.id === id) ?? PRICES[0]) as PriceRef;
    return { small: find(priceIds.small), large: find(priceIds.large) } as Record<TierId, PriceRef>;
  }, [priceIds]);

  async function refresh() {
    try {
      const [s, r] = await Promise.all([fetch('/api/cascade/status').then(res => res.json()), fetch('/api/cascade/races').then(res => res.json())]);
      setStatus(s);
      setSaved(r.races ?? []);
    } catch {
      setError('The ProofBench API is not reachable. Start it with npm run dev.');
    }
  }

  useEffect(() => {
    void refresh();
    // Gateway feed: routing decisions from any client that uses the Cascade endpoint.
    const feedSource = new EventSource('/api/cascade/events');
    feedSource.onmessage = message => {
      const event = JSON.parse(message.data);
      const item = describeFeed(event);
      if (item) setFeed(previous => [item, ...previous].slice(0, 40));
    };
    return () => {
      feedSource.close();
      source.current?.close();
    };
  }, []);

  function follow(id: string) {
    source.current?.close();
    setRace(emptyRace);
    setStreaming(true);
    const events = new EventSource(`/api/cascade/races/${encodeURIComponent(id)}/events`);
    source.current = events;
    events.onmessage = message => {
      const event = JSON.parse(message.data) as RaceEvent;
      if (event.type === 'stream-end') {
        events.close();
        setStreaming(false);
        void refresh();
        return;
      }
      setRace(previous => applyRaceEvent(previous, event));
    };
    events.onerror = () => {
      events.close();
      setStreaming(false);
    };
  }

  async function start(replay?: string) {
    setError('');
    const response = await fetch('/api/cascade/races', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(replay ? { replay, speed } : {}),
    });
    const body = await response.json();
    if (!response.ok && !body.id) {
      setError(body.message ?? 'Could not start the race.');
      return;
    }
    follow(body.id);
  }

  // Presentation mode starts the race without anyone touching the page.
  // The event can arrive before the gateway status has loaded, so it waits in `pendingStart`.
  const pendingStart = useRef(false);
  const presenter = useRef<() => void>(() => {});
  presenter.current = () => {
    if (streaming && !race.done) return;
    if (!status) {
      pendingStart.current = true;
      return;
    }
    pendingStart.current = false;
    if (status.live) void start();
    else {
      const pick = saved.find(r => r.id === replayId) ?? saved[0];
      if (pick) void start(pick.id);
    }
  };
  useEffect(() => {
    const onStart = () => presenter.current();
    window.addEventListener(START_RACE_EVENT, onStart);
    return () => window.removeEventListener(START_RACE_EVENT, onStart);
  }, []);
  useEffect(() => {
    if (status && pendingStart.current) presenter.current();
  }, [status, saved]);

  const clock = useRaceClock(race, streaming && !race.done);
  const latest = saved.find(r => r.id === replayId) ?? saved[0];
  const running = streaming && !race.done;

  return (
    <div className="race-page">
      <section className="race-hero" aria-labelledby="race-title">
        <p className="eyebrow">[ <EncryptedText text="LIVE · BIFROST PS01 + PS04" /> ]</p>
        <h1 id="race-title">
          Same agent. Same bugs.
          <br />
          <span>One URL change.</span>
        </h1>
        <p className="race-lede">
          Three routing strategies fix the same real bugs at the same time, through a local Bifrost gateway. Every patch runs in a sandbox
          against its tests. Cascade starts on the small model and escalates only when the tests prove it is stuck.
        </p>
        <div className="race-controls">
          <button type="button" className="race-go" disabled={running || !status?.live} onClick={() => void start()} title={status?.live ? 'Run all three lanes live' : 'Needs the local Bifrost gateway'}>
            <Rocket size={18} aria-hidden="true" /> {running && !race.replay ? 'Racing…' : 'Start live race'}
          </button>
          <div className="race-replay">
            <button type="button" className="secondary" disabled={running || !latest} onClick={() => latest && void start(latest.id)}>
              <History size={16} aria-hidden="true" /> Replay recorded race
            </button>
            <label className="replay-pick">
              <span className="sr-only">Recorded race to replay</span>
              <select value={latest?.id ?? ''} onChange={e => setReplayId(e.target.value)} disabled={running || saved.length === 0}>
                {saved.map(r => {
                  const verdict = r.totals ? savedCost(r.totals.cascade, prices) < savedCost(r.totals.large, prices) ? 'Cascade cheaper' : 'Cascade dearer' : '';
                  return (
                    <option key={r.id} value={r.id}>
                      {new Date(r.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {verdict}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="replay-speed">
              <span className="sr-only">Replay speed</span>
              <select value={speed} onChange={e => setSpeed(Number(e.target.value))} disabled={running}>
                {[1, 2, 4, 8].map(s => (
                  <option key={s} value={s}>
                    {s}× speed
                  </option>
                ))}
              </select>
            </label>
          </div>
          <span className={`gateway-chip ${status?.live ? 'up' : 'down'}`}>
            <Radio size={14} aria-hidden="true" /> {status ? (status.live ? 'Bifrost gateway live' : status.gateway === 'up' ? 'Gateway up · no virtual key' : 'Gateway offline · replay only') : 'Checking gateway…'}
          </span>
        </div>
        {error && <p className="race-error" role="alert">{error}</p>}
        {status && (
          <p className="race-models">
            Small tier <strong>{status.tiers.small.label}</strong> · large tier <strong>{status.tiers.large.label}</strong> · escalate after{' '}
            {status.policy.maxSmallFailures} failed checks or an M2 stall · autopsy ≤ {status.policy.autopsyBudgetTokens.toLocaleString()} tokens
          </p>
        )}
      </section>

      {race.lanes.length === 0 ? (
        <section className="race-empty">
          <Flag size={22} aria-hidden="true" />
          <p>
            Press <strong>Start live race</strong> to run it now, or replay a recorded live race
            {latest ? ` from ${new Date(latest.startedAt).toLocaleString()}` : ''}.
          </p>
        </section>
      ) : (
        <>
          <div className="race-banner" aria-live="polite">
            {race.replay ? (
              <span className="tag replay">REPLAY · recorded live {race.recordedAt ? new Date(race.recordedAt).toLocaleString() : ''} · {speed}×</span>
            ) : (
              <span className="tag live">{race.done ? 'LIVE RUN · FINISHED' : 'LIVE'}</span>
            )}
            <span className="clock">{seconds(clock)}</span>
          </div>
          <section className="race-lanes" aria-label="Race lanes">
            {race.lanes.map(lane => (
              <Lane key={lane.id} lane={lane} race={race} clock={clock} prices={prices} />
            ))}
          </section>
          <Scoreboard race={race} prices={prices} clock={clock} />
        </>
      )}

      <AllRaces saved={saved} prices={prices} />

      <section className="race-prices" aria-label="Price reference">
        <p>
          The NVIDIA endpoints in this demo are free, so dollars are a projection: recorded tokens at list prices
          (as of 2026-11-11). Price the small tier like
        </p>
        <select value={priceIds.small} onChange={e => setPriceIds(p => ({ ...p, small: e.target.value }))} aria-label="Small tier price reference">
          {PRICES.map(p => (
            <option key={p.id} value={p.id}>
              {p.label} (${p.input}/${p.output} per M)
            </option>
          ))}
        </select>
        <p>and the large tier like</p>
        <select value={priceIds.large} onChange={e => setPriceIds(p => ({ ...p, large: e.target.value }))} aria-label="Large tier price reference">
          {PRICES.map(p => (
            <option key={p.id} value={p.id}>
              {p.label} (${p.input}/${p.output} per M)
            </option>
          ))}
        </select>
      </section>

      <AnyAgent status={status} feed={feed} />
    </div>
  );
}

function Lane({ lane, race, clock, prices }: { lane: LaneView; race: RaceView; clock: number; prices: Record<TierId, PriceRef> }) {
  const finished = lane.doneAt !== undefined;
  const elapsed = finished ? lane.doneAt! : clock;
  const cost = laneCost(lane, prices);
  // Only lanes that fixed every bug can finish "first"; a lane that gave up is not a winner however fast it stopped.
  const complete = (l: LaneView) => l.doneAt !== undefined && l.solved === race.tasks.length;
  const finishOrder = race.lanes.filter(complete).sort((a, b) => a.doneAt! - b.doneAt!).findIndex(l => l.id === lane.id);
  const badge = !finished ? '' : complete(lane) ? (finishOrder === 0 ? `FIRST TO ${lane.solved}/${race.tasks.length} · ${seconds(lane.doneAt!)}` : `${lane.solved}/${race.tasks.length} · ${seconds(lane.doneAt!)}`) : `GAVE UP · ${lane.solved}/${race.tasks.length}`;
  return (
    <article className={`lane lane-${lane.id}${finished ? ' finished' : ''}`}>
      <header>
        <div>
          <h2>{lane.label}</h2>
          <p>{lane.blurb}</p>
        </div>
        {finished && <span className={`finish-badge${complete(lane) ? '' : ' gave-up'}`}>{badge}</span>}
      </header>
      <div className="lane-meters">
        <div className="meter cost">
          <span>Projected cost</span>
          <strong>{formatUsd(cost)}</strong>
        </div>
        <div className="meter">
          <span>Tokens</span>
          <strong>{compact(laneTokens(lane))}</strong>
        </div>
        <div className="meter">
          <span>Solved</span>
          <strong>
            {lane.solved}/{race.tasks.length}
          </strong>
        </div>
        <div className="meter">
          <span>Time</span>
          <strong>{seconds(elapsed)}</strong>
        </div>
      </div>
      <div className="tier-split" aria-label="Tokens by tier">
        <TierBar lane={lane} />
      </div>
      <ol className="lane-tasks">
        {race.tasks.map(task => {
          const view = lane.tasks[task.id];
          return (
            <li key={task.id} className={`task-row ${view.status}`}>
              <div className="task-name">
                <span>{task.title}</span>
                <small>{task.difficulty}</small>
              </div>
              <div className="attempts" aria-label={`${view.attempts.length} attempts`}>
                {view.attempts.map(a => (
                  <AttemptDot key={a.attempt} attempt={a} />
                ))}
              </div>
              <span className="task-status">{view.status === 'passed' ? 'PASS' : view.status === 'failed' ? 'STUCK' : view.status === 'running' ? '…' : ''}</span>
            </li>
          );
        })}
      </ol>
      {lane.escalations.map(e => (
        <div key={`${e.taskId}-${e.t}`} className="escalation" role="status">
          <Zap size={15} aria-hidden="true" />
          <div>
            <strong>Escalated · {race.tasks.find(t => t.id === e.taskId)?.title}</strong>
            <p>{e.decision.reason}</p>
            {e.decision.compression && !e.decision.compression.skipped && (
              <p className="autopsy">
                Failed history replaced by an autopsy: ≈{e.decision.compression.before.toLocaleString()} → {e.decision.compression.after.toLocaleString()} prompt tokens
              </p>
            )}
          </div>
        </div>
      ))}
    </article>
  );
}

function TierBar({ lane }: { lane: LaneView }) {
  const small = lane.usage.small.input + lane.usage.small.output;
  const large = lane.usage.large.input + lane.usage.large.output;
  const total = Math.max(1, small + large);
  return (
    <>
      <div className="bar">
        <span className="small" style={{ width: `${(small / total) * 100}%` }} />
        <span className="large" style={{ width: `${(large / total) * 100}%` }} />
      </div>
      <p>
        <i className="key small" /> small {compact(small)} <i className="key large" /> large {compact(large)}
      </p>
    </>
  );
}

function AttemptDot({ attempt }: { attempt: Attempt }) {
  const state = attempt.ok === undefined ? 'pending' : attempt.ok ? 'pass' : 'fail';
  const label = `Attempt ${attempt.attempt} on the ${attempt.tier} model: ${state === 'pending' ? 'running' : state === 'pass' ? 'tests pass' : `${attempt.passed ?? 0}/${(attempt.passed ?? 0) + (attempt.failed ?? 0)} tests`}`;
  return (
    <span className={`att ${attempt.tier} ${state}`} title={`${label}${attempt.usage ? ` · ${attempt.usage.input}+${attempt.usage.output} tokens · ${seconds(attempt.latencyMs ?? 0)}` : ''}${attempt.error ? ` · ${attempt.error}` : ''}`} aria-label={label}>
      {state === 'fail' && attempt.passed !== undefined ? `${attempt.passed}/${attempt.passed + (attempt.failed ?? 0)}` : ''}
    </span>
  );
}

function Scoreboard({ race, prices, clock }: { race: RaceView; prices: Record<TierId, PriceRef>; clock: number }) {
  const cascade = race.lanes.find(l => l.id === 'cascade');
  const large = race.lanes.find(l => l.id === 'large');
  const small = race.lanes.find(l => l.id === 'small');
  if (!cascade || !large) return null;
  const ready = cascade.doneAt !== undefined;
  const largeTime = large.doneAt ?? clock;
  const saving = laneCost(large, prices) > 0 ? 1 - laneCost(cascade, prices) / laneCost(large, prices) : 0;
  const faster = cascade.doneAt ? largeTime / cascade.doneAt : 0;
  return (
    <section className={`scoreboard${ready ? ' ready' : ''}`} aria-live="polite">
      <p className="eyebrow">[ RESULT{race.done ? '' : ' · SO FAR'} ]</p>
      {ready ? (
        <h2>
          {/* Worded for either outcome: a single live run can go against Cascade, and the page says so. */}
          Cascade solved <strong>{cascade.solved}/{race.tasks.length}</strong>{' '}
          {saving >= 0.005 ? (
            <>
              for <strong>{Math.round(saving * 100)}% less</strong> than
            </>
          ) : saving <= -0.005 ? (
            <>
              but cost <strong className="worse">{Math.round(-saving * 100)}% more</strong> than
            </>
          ) : (
            <>for about the same cost as</>
          )}{' '}
          the big model alone
          {large.doneAt === undefined ? (
            <>, which is still working.</>
          ) : cascade.doneAt! < large.doneAt ? (
            <>
              , and finished <strong>{faster.toFixed(1)}× sooner</strong>.
            </>
          ) : (
            <>, and finished {seconds(cascade.doneAt! - large.doneAt)} later.</>
          )}
        </h2>
      ) : (
        <h2>Waiting for Cascade to finish…</h2>
      )}
      <table>
        <thead>
          <tr>
            <th>Lane</th>
            <th>Solved</th>
            <th>Calls</th>
            <th>Tokens</th>
            <th>Projected cost</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {[small, large, cascade].filter((l): l is LaneView => !!l).map(lane => (
            <tr key={lane.id} className={lane.id}>
              <td>{lane.label}</td>
              <td>
                {lane.solved}/{race.tasks.length}
              </td>
              <td>{lane.calls}</td>
              <td>{laneTokens(lane).toLocaleString()}</td>
              <td>{formatUsd(laneCost(lane, prices))}</td>
              <td>{lane.doneAt !== undefined ? seconds(lane.doneAt) : `${seconds(clock)}…`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="honesty">
        One live run, not a statistic: model output varies between runs. Every number above comes from the provider usage that Bifrost
        returned and the test results from the sandbox.
      </p>
    </section>
  );
}

function savedCost(totals: SavedTotals, prices: Record<TierId, PriceRef>): number {
  return (['small', 'large'] as const).reduce((sum, tier) => sum + (totals.usage[tier].input * prices[tier].input + totals.usage[tier].output * prices[tier].output) / 1_000_000, 0);
}

/** Every recorded live race, wins and losses alike: the number that does not depend on one lucky run. */
function AllRaces({ saved, prices }: { saved: SavedRace[]; prices: Record<TierId, PriceRef> }) {
  const races = saved.filter(r => r.totals?.cascade && r.totals.large && r.totals.small);
  if (races.length < 2) return null;
  const lanes = (['small', 'large', 'cascade'] as const).map(id => {
    const all = races.map(r => r.totals![id]);
    return {
      id,
      label: id === 'small' ? 'Small model only' : id === 'large' ? 'Big model only' : 'ProofBench Cascade',
      solved: all.reduce((n, t) => n + t.solved, 0),
      tasks: all.reduce((n, t) => n + t.tasks, 0),
      cost: all.reduce((n, t) => n + savedCost(t, prices), 0),
      wallMs: all.reduce((n, t) => n + t.wallMs, 0),
    };
  });
  const [, large, cascade] = lanes;
  const saving = large.cost > 0 ? 1 - cascade.cost / large.cost : 0;
  return (
    <section className="all-races" aria-labelledby="all-races-title">
      <p className="eyebrow">[ EVERY RECORDED LIVE RACE · {races.length} RUNS ]</p>
      <h2 id="all-races-title">
        Across all {races.length} recorded races, Cascade fixed {cascade.solved}/{cascade.tasks}{' '}
        {saving >= 0 ? <>for <strong>{Math.round(saving * 100)}% less</strong></> : <>but cost <strong className="worse">{Math.round(-saving * 100)}% more</strong></>} than the big model alone ({large.solved}/{large.tasks}).
      </h2>
      <div className="all-races-grid">
        <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Lane</th><th>Fixed</th><th>Cost*</th><th>Time</th></tr>
          </thead>
          <tbody>
            {lanes.map(lane => (
              <tr key={lane.id} className={lane.id}>
                <td>{lane.label}</td>
                <td>{lane.solved}/{lane.tasks}</td>
                <td>{formatUsd(lane.cost)}</td>
                <td>{seconds(lane.wallMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <ol className="race-list" aria-label="Each recorded race">
          {races.map(race => {
            const c = savedCost(race.totals!.cascade, prices);
            const l = savedCost(race.totals!.large, prices);
            const win = c < l;
            return (
              <li key={race.id} className={win ? 'win' : 'loss'}>
                <time>{new Date(race.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                <span>Cascade {formatUsd(c)} · big {formatUsd(l)}</span>
                <strong>{win ? `${Math.round((1 - c / l) * 100)}% less` : `${Math.round((c / l - 1) * 100)}% more`}</strong>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="honesty">Losses are kept. In the run where Cascade cost more, its first escalated call ran to the 6,000-token output cap without returning code; the big-only lane fixed the same bug on its first try.</p>
    </section>
  );
}

function AnyAgent({ status, feed }: { status?: Status; feed: FeedItem[] }) {
  const base = `${window.location.origin}${status?.endpoint ?? '/api/cascade/v1'}`;
  const snippet = `export OPENAI_BASE_URL=${base}\nexport OPENAI_API_KEY=unused   # Cascade holds the Bifrost virtual key\n# then use the model name "cascade" in any OpenAI-compatible agent`;
  const [copied, setCopied] = useState(false);
  return (
    <section className="any-agent" aria-labelledby="any-agent-title">
      <div>
        <p className="eyebrow">[ <EncryptedText text="BRING YOUR OWN AGENT" /> ]</p>
        <h2 id="any-agent-title">Point any coding agent at Cascade</h2>
        <p>
          Cascade speaks the OpenAI chat API, so OpenCode, Aider, Continue or your own agent can use it by changing a base URL. It reads
          the test output your agent already sends back, so no plugin or SDK is needed.
        </p>
        <pre>
          <code>{snippet}</code>
        </pre>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(snippet);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Copy size={14} aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="feed">
        <h3>
          <CirclePlay size={14} aria-hidden="true" /> Live gateway feed
        </h3>
        {feed.length === 0 ? (
          <p className="empty">Routing decisions appear here as requests arrive, from the race or from any outside agent.</p>
        ) : (
          <ol>
            {feed.map(item => (
              <li key={item.key} className={item.tone}>
                <time>{new Date(item.at).toLocaleTimeString()}</time>
                <span className="session">{item.session}</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ol>
        )}
        <a className="text-button" href="http://localhost:8089/" target="_blank" rel="noreferrer">
          Open the Bifrost dashboard <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

// Gateway events are plain JSON from /api/cascade/events (CascadeEvent in packages/cascade/src/types.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describeFeed(event: any): FeedItem | undefined {
  const session = String(event.sessionId ?? '').replace(/^race:[^:]+:/, 'race · ').slice(0, 28);
  const key = `${event.type}-${event.sessionId}-${event.turn ?? ''}-${event.at}`;
  if (event.type === 'session') return { key, at: event.at, session, text: `new session from ${event.client}`, tone: 'start' };
  if (event.type === 'decision' && ['escalate', 'deescalate'].includes(event.decision.kind))
    return { key, at: event.at, session, text: `${event.decision.kind === 'escalate' ? '⇡ escalate' : '⇣ back to small'}: ${event.decision.reason}`, tone: event.decision.kind };
  if (event.type === 'usage')
    return {
      key,
      at: event.at,
      session,
      text: event.status === 'ok' ? `${event.tier} · ${event.usage.input}+${event.usage.output} tok · ${seconds(event.latencyMs)}` : `${event.tier} call failed: ${event.error ?? ''}`,
      tone: event.status === 'ok' ? 'usage' : 'error',
    };
  return undefined;
}
