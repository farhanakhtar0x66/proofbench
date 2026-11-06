import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowDownToLine, ArrowRight, FlaskConical, Play, RotateCcw } from 'lucide-react';
import { TrackDSession, TrackDStatus, type TrackDRequest, type TrackDRun } from '../../../packages/contracts/src/track-d';
import { api } from './client';
import { useViewportEntry } from './PresentationArt';

const tasks = { 'distance-width': 'Long-distance overflow', 'directed-edges': 'Directed reachability' };
const faults = { none: 'Clean run', 'model-outage': 'Model outage', 'tool-error': 'Grader interruption', 'misleading-input': 'Misleading input' };
const display = (value: number | null) => value === null ? '—' : value.toLocaleString();

function RunProof({ run, onVerify }: { run: TrackDRun; onVerify: (text: string) => void }) {
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const event = run.trace[cursor];
  const phase = event?.source ?? 'adapter';
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (cursor + 1 >= run.trace.length) setPlaying(false);
      else setCursor(cursor + 1);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [cursor, playing, run.trace.length]);
  return <article className="track-proof" aria-labelledby="track-proof-title">
    <header className="panel-heading">
      <div><p className="eyebrow">[ RUN EVIDENCE ]</p><h3 id="track-proof-title">{run.agent}</h3></div>
      <span className={`pill ${run.verdict === 'failed' ? 'failed' : ''}`}>{run.verdict}</span>
    </header>
    <div className="track-replay" data-playing={playing}>
      <div className="track-phases" aria-label="Evidence sources">
        {(['adapter', 'gateway', 'grader'] as const).map((name, index) => <span key={name} data-current={phase === name}>
          <small>0{index + 1}</small> {name}{index < 2 && <ArrowRight size={13} aria-hidden="true"/>}
        </span>)}
      </div>
      <div className="track-event"><small>{cursor + 1} / {run.trace.length} · {phase}</small><p>{event?.message}</p></div>
      <div className="track-playback">
        <button className="secondary" type="button" onClick={() => {
          if (!playing && cursor + 1 >= run.trace.length) setCursor(0);
          setPlaying(!playing);
        }}><Play size={14} aria-hidden="true"/> {playing ? 'Pause replay' : 'Play replay'}</button>
        <input aria-label="Trace event" type="range" min={0} max={Math.max(0, run.trace.length - 1)} value={cursor}
          onChange={e => { setPlaying(false); setCursor(Number(e.target.value)); }}/>
      </div>
    </div>
    <ul className="track-checks">
      {run.checks.map(check => <li key={check.name}><strong>{check.name}</strong>
        <span className={`pill ${check.outcome === 'failed' ? 'failed' : ''}`}>{check.outcome}</span><p>{check.detail}</p></li>)}
    </ul>
    <details className="track-disclosure"><summary>Patch diff and source hash</summary>
      <p className="track-hash">{run.sourceSha256 ?? 'Source hash unavailable'}</p>
      <pre tabIndex={0}>{run.diff || 'No change to the starter.'}</pre>
    </details>
    {run.receipts.length > 0 && <details className="track-disclosure"><summary>Gateway receipts</summary>
      <ul className="track-checks">{run.receipts.map((receipt, index) => <li key={index}>
        <strong>HTTP {receipt.status} · {receipt.injected ? 'Injected fault' : (receipt.model ?? 'Model unconfirmed')}</strong>
        <p>{receipt.requestId ?? 'No request ID'} · {display(receipt.input)} in / {display(receipt.output)} out</p>
      </li>)}</ul>
    </details>}
    {run.agentNote && <details className="track-disclosure"><summary>Agent explanation</summary>
      <p>{run.agentNote}</p>
      <button className="text-button" type="button" onClick={() => onVerify(run.agentNote!)}>Check claims in Freshness Verifier <ArrowRight size={14}/></button>
    </details>}
  </article>;
}

export function TrackDBench({ onVerify }: { onVerify: (text: string) => void }) {
  const { ref, entered } = useViewportEntry<HTMLElement>();
  const [status, setStatus] = useState<TrackDStatus>();
  const [session, setSession] = useState<TrackDSession>();
  const [runId, setRunId] = useState('');
  const [mode, setMode] = useState<TrackDRequest['mode']>('fixture');
  const [task, setTask] = useState<'both' | TrackDRequest['tasks'][number]>('both');
  const [repeats, setRepeats] = useState(1);
  const [fault, setFault] = useState<TrackDRequest['fault']>('none');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const activeId = session?.status === 'running' ? session.id : undefined;

  useEffect(() => {
    if (window.location.hash === '#track-d') ref.current?.scrollIntoView();
  }, [ref]);

  useEffect(() => {
    if (!entered && window.location.hash !== '#track-d') return;
    let active = true;
    void api('/track-d', TrackDStatus).then(async value => {
      if (!active) return;
      setStatus(value);
      const requested = TrackDSession.shape.id.safeParse(new URLSearchParams(window.location.search).get('trackSession'));
      const recorded = requested.success ? value.sessions.find(item => item.id === requested.data) ??
        await api(`/track-d/${requested.data}`, TrackDSession).catch(() => undefined) : undefined;
      if (active) setSession(previous => previous ?? recorded ?? value.sessions[0]);
    }, () => { if (active) setError('Track D needs the connected ProofBench API.'); });
    return () => { active = false; };
  }, [entered]);

  useEffect(() => {
    if (!activeId) return;
    let active = true;
    let timer: number;
    async function poll() {
      try {
        const result = await api(`/track-d/${activeId}`, TrackDSession);
        if (!active) return;
        setError('');
        setSession(result);
        if (result.status !== 'running') {
          setStatus(previous => previous && ({ ...previous, sessions: [result, ...previous.sessions.filter(item => item.id !== result.id)].slice(0, 5) }));
          return;
        }
      } catch {
        if (!active) return;
        setError('Lost contact with the benchmark worker. Reconnecting…');
      }
      timer = window.setTimeout(() => { void poll(); }, 1500);
    }
    timer = window.setTimeout(() => { void poll(); }, 900);
    return () => { active = false; window.clearTimeout(timer); };
  }, [activeId]);

  async function start() {
    setSubmitting(true);
    setError('');
    try {
      const request: TrackDRequest = { mode, tasks: task === 'both' ? ['distance-width', 'directed-edges'] : [task], repeats, fault };
      setSession(await api('/track-d', TrackDSession, request));
      setRunId('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not start Track D.');
    } finally { setSubmitting(false); }
  }

  const run = session?.runs.find(item => item.id === runId) ?? session?.runs[0];
  const agents = [...new Set(session?.runs.map(item => item.agent))];
  const expected = session ? session.request.tasks.length * session.request.repeats * 2 : 0;
  const unavailable = session?.runs.filter(item => item.verdict === 'unavailable').length ?? 0;
  const busy = submitting || Boolean(activeId);
  return <section className="showcase-section track-bench" id="track-d" ref={ref} data-entered={entered} aria-labelledby="track-title">
    <header className="showcase-heading"><p className="eyebrow">[ AGENT BENCHMARK · TRACK D ]</p><h2 id="track-title">Which patch holds up?</h2>
      <p>Run both entries on the same graph task. Open any result to see its patch, execution trace, and exact-output checks.</p></header>
    <div className="track-console">
      <form className="track-controls" onSubmit={event => { event.preventDefault(); void start(); }}>
        <label>Mode<select value={mode} disabled={busy} onChange={event => { setMode(event.target.value as typeof mode); setFault('none'); }}>
          <option value="fixture">Offline fixtures</option><option value="live" disabled={!status?.liveConfigured}>Live Bifrost agents</option></select></label>
        <label>Task<select value={task} disabled={busy} onChange={event => setTask(event.target.value as typeof task)}>
          <option value="both">Both graph tasks</option>{Object.entries(tasks).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
        <label>Repeats<select value={repeats} disabled={busy} onChange={event => setRepeats(Number(event.target.value))}>
          {[1, 2, 3].map(count => <option key={count} value={count}>{count} per entry</option>)}</select></label>
        <label>Scenario<select value={fault} disabled={busy} onChange={event => setFault(event.target.value as typeof fault)}>
          {Object.entries(faults).filter(([value]) => mode === 'live' || value === 'none' || value === 'tool-error')
            .map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button className="primary" type="submit" disabled={busy || !status}><FlaskConical size={15} aria-hidden="true"/> {busy ? 'Benchmark running' : 'Run benchmark'}</button>
      </form>
      {error && <p className="track-error" role="alert">{error}</p>}
      {session && <>
        <div className="track-status">
          <p role="status"><strong>{session.status === 'running' ? `Grading ${session.runs.length} of ${expected} results`
            : session.message ?? `${session.runs.length} results${unavailable ? ` · ${unavailable} unavailable` : ''}`}</strong><br/>
            {session.request.mode === 'fixture' ? 'Source fixtures · real oracle checks' : session.comparable
              ? `Pinned gateway model verified · ${session.model}` : 'Live session · pinned model comparability unconfirmed'}</p>
          <a className="secondary" href={`/api/track-d/${session.id}`} download={`proofbench-track-d-${session.id}.json`}><ArrowDownToLine size={14}/> Evidence JSON</a>
        </div>
        {agents.length > 0 && <div className="track-score">
          {agents.map(agent => {
            const results = session.runs.filter(item => item.agent === agent);
            const passed = results.filter(item => item.verdict === 'passed').length;
            return <div key={agent}><span>{agent}</span><strong>{passed} / {results.length} passed</strong>
              <div className="track-meter" aria-hidden="true"><span style={{ '--rate': passed / results.length } as CSSProperties}/></div></div>;
          })}
        </div>}
        {run && <div className="track-results">
          <div className="track-run-list"><p className="eyebrow">[ TRIALS ]</p>{session.runs.map(item =>
            <button className="track-row" key={item.id} type="button" aria-pressed={run.id === item.id} onClick={() => setRunId(item.id)}>
              <span><strong>{item.agent}</strong><small>{tasks[item.task]} · Run {item.repeat}</small></span>
              <span className={`pill ${item.verdict === 'failed' ? 'failed' : ''}`}>{item.verdict}</span>
              {session.request.mode === 'live' && <small className="track-metrics">{display(item.inputTokens)} in / {display(item.outputTokens)} out · {display(item.steps)} steps · {item.receipts.length} model attempts · {display(item.toolCalls)} tool calls · {(item.agentMs / 1000).toFixed(1)}s agent{item.verdictMs !== undefined && ` · ${(item.verdictMs / 1000).toFixed(1)}s to verdict`} · {item.costUsd === null ? 'Cost unavailable' : `$${item.costUsd.toFixed(4)}`}</small>}
            </button>)}</div>
          <RunProof key={run.id} run={run} onVerify={onVerify}/>
        </div>}
      </>}
      {!session && <p className="track-intro">Offline fixtures use a known repair and an unchanged starter. Both go through the same isolated grader used for live sessions.
        {status && !status.liveConfigured && ' Live mode requires a pinned Bifrost model and OpenCode CLI.'}</p>}
      {(status?.sessions.length ?? 0) > 1 && <div className="track-history"><RotateCcw size={14} aria-hidden="true"/>
        <label>Previous sessions <select value={session?.id ?? ''} disabled={busy} onChange={event => {
          setSession(status?.sessions.find(item => item.id === event.target.value)); setRunId('');
        }}><option value="" hidden>Select a session</option>{status?.sessions.map(item => <option key={item.id} value={item.id}>
          {new Date(item.createdAt).toLocaleString()} · {item.request.mode} · {faults[item.request.fault]}
        </option>)}</select></label>
      </div>}
    </div>
  </section>;
}
