import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, FlaskConical, Plus, X } from 'lucide-react';
import { TrackDSession, TrackDStatus, trackDAgentLabels, trackDAgentsByMode,
  type TrackDAgent, type TrackDRequest } from '../../../packages/contracts/src/track-d';
import { api, ApiResponseError } from './client';
import { TrackDComparison, trackDTaskLabels as tasks } from './TrackDComparison';
import { WorkspaceOpening } from './WorkspaceOpening';

const faults = { none: 'Clean run', 'model-outage': 'Model outage', 'tool-error': 'Grader interruption', 'misleading-input': 'Misleading input' };
const agentDescriptions: Record<TrackDAgent, string> = {
  proofbench: 'Built-in repair loop with public checks.',
  opencode: 'Independent coding CLI with its own tools.',
  'reference-repair': 'Known-correct C++ patch.',
  'unpatched-starter': 'Original C++ source with the bug.',
};

function rememberSession(id: string) {
  const url = new URL(window.location.href);
  if (url.pathname !== '/benchmarks' && !(url.pathname === '/' && (url.hash === '#track-d' || url.searchParams.has('trackSession')))) return;
  url.searchParams.set('trackSession', id);
  if (url.pathname === '/') url.hash = 'track-d';
  window.history.replaceState(window.history.state, '', url);
}

export function TrackDBench({ onVerify }: { onVerify: (text: string) => void }) {
  const [status, setStatus] = useState<TrackDStatus>();
  const [session, setSession] = useState<TrackDSession>();
  const [setupOpen, setSetupOpen] = useState(false);
  const setupToggle = useRef<HTMLButtonElement>(null);
  const modeControl = useRef<HTMLSelectElement>(null);
  const progress = useRef<HTMLParagraphElement>(null);
  const [mode, setMode] = useState<TrackDRequest['mode']>('fixture');
  const [selectedAgents, setSelectedAgents] = useState<readonly TrackDAgent[]>(trackDAgentsByMode.fixture);
  const [task, setTask] = useState<'both' | TrackDRequest['tasks'][number]>('both');
  const [repeats, setRepeats] = useState(1);
  const [fault, setFault] = useState<TrackDRequest['fault']>('none');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [stoppedId, setStoppedId] = useState<string>();
  const stopped = Boolean(session && session.id === stoppedId);
  const activeId = session?.status === 'running' && !stopped ? session.id : undefined;
  const liveReady = Boolean(status?.liveConfigured && !status.liveIssue);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const value = await api('/track-d', TrackDStatus);
        if (!active) return;
        setStatus(value);
        const requested = new URLSearchParams(window.location.search).get('trackSession');
        if (requested === null) {
          setSession(previous => previous ?? value.sessions.find(item => item.id === value.activeSessionId)
            ?? value.sessions.find(item => item.request.mode === 'live' && item.comparable && item.runs.length > 0)
            ?? value.sessions[0]);
          return;
        }
        const parsed = TrackDSession.shape.id.safeParse(requested);
        if (!parsed.success) {
          setError('This Graph Repair session link is invalid. Choose a saved session or start a new benchmark.');
          return;
        }
        const recorded = value.sessions.find(item => item.id === parsed.data)
          ?? await api(`/track-d/${parsed.data}`, TrackDSession);
        if (active) setSession(previous => previous ?? recorded);
      } catch (error) {
        if (!active) return;
        setError(error instanceof ApiResponseError && error.status === 404
          ? 'The linked Graph Repair session is missing. Choose a saved session or start a new benchmark.'
          : 'Could not load Graph Repair. Check that the ProofBench API is running and refresh setup.');
      }
    }
    void load();
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    if (!activeId) return;
    let active = true;
    let timer: number;
    let failures = 0;
    async function poll() {
      try {
        const result = await api(`/track-d/${activeId}`, TrackDSession);
        if (!active) return;
        failures = 0;
        setError('');
        setSession(result);
        if (result.status !== 'running') {
          setStatus(previous => previous && ({
            ...previous, activeSessionId: previous.activeSessionId === result.id ? undefined : previous.activeSessionId,
            sessions: [result, ...previous.sessions.filter(item => item.id !== result.id)].slice(0, 5),
          }));
          return;
        }
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiResponseError && error.status >= 400 && error.status < 500) {
          setStoppedId(activeId);
          setStatus(previous => previous && previous.activeSessionId === activeId
            ? { ...previous, activeSessionId: undefined } : previous);
          setError(error.status === 404
            ? 'The Graph Repair session disappeared from the server. Choose another session or start a new benchmark.'
            : error.message);
          return;
        }
        if (++failures >= 3) {
          setStoppedId(activeId);
          setError('Could not reconnect to the Graph Repair session. Check that the API is running, then check the session again.');
          return;
        }
        setError('Lost contact with the benchmark worker. Reconnecting…');
      }
      timer = window.setTimeout(() => { void poll(); }, 1500);
    }
    timer = window.setTimeout(() => { void poll(); }, 900);
    return () => { active = false; window.clearTimeout(timer); };
  }, [activeId]);

  async function start() {
    if (selectedAgents.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const request: TrackDRequest = { mode, agents: trackDAgentsByMode[mode].filter(agent => selectedAgents.includes(agent)),
        tasks: task === 'both' ? ['distance-width', 'directed-edges'] : [task], repeats, fault };
      const result = await api('/track-d', TrackDSession, request);
      setSession(result);
      setStatus(previous => previous && ({
        ...previous, activeSessionId: result.id, sessions: [result, ...previous.sessions].slice(0, 5),
      }));
      setStoppedId(undefined);
      setSetupOpen(false);
      rememberSession(result.id);
      window.requestAnimationFrame(() => progress.current?.focus({ preventScroll: true }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not start Graph Repair.');
      if (error instanceof ApiResponseError && (error.status === 409 || error.status === 503)) {
        setRefresh(previous => previous + 1);
      }
    } finally { setSubmitting(false); }
  }

  const expected = session ? session.request.tasks.length * session.request.repeats *
    (session.request.agents ?? trackDAgentsByMode[session.request.mode]).length : 0;
  const planned = (task === 'both' ? 2 : 1) * repeats * selectedAgents.length;
  const unavailable = session?.runs.filter(item => item.verdict === 'unavailable').length ?? 0;
  const otherActive = status?.sessions.find(item => item.id === status.activeSessionId && item.id !== session?.id);
  const busy = submitting || Boolean(activeId || otherActive);
  const showSetupHelp = setupOpen && status && mode === 'live' && !liveReady;
  const history = status?.sessions ?? [];
  const savedSessions = session && !history.some(item => item.id === session.id) ? [session, ...history] : history;
  const selectSession = (selected: TrackDSession | undefined) => {
    setError('');
    setSession(selected);
    setSetupOpen(false);
    if (selected) rememberSession(selected.id);
  };
  return <section className="showcase-section track-bench" id="track-d" aria-labelledby="track-title">
    <WorkspaceOpening scene="graph" label="CODING AGENT BENCHMARK" title="Graph Repair" titleId="track-title"
      description="Compare coding agents on the same C++ bugs and inspect the proof behind every verdict.">
      <button className={setupOpen ? 'secondary' : 'primary'} ref={setupToggle} type="button" aria-expanded={setupOpen}
        aria-controls={setupOpen ? 'track-setup' : undefined} disabled={busy && !setupOpen} onClick={() => {
          setSetupOpen(!setupOpen);
          if (!setupOpen) window.requestAnimationFrame(() => modeControl.current?.focus());
        }}>{setupOpen ? <X size={15} aria-hidden="true"/> : <Plus size={15} aria-hidden="true"/>}
        {setupOpen ? 'Close setup' : 'New benchmark'}</button>
    </WorkspaceOpening>
    <div className="track-console">
      {setupOpen && <form className="track-controls" id="track-setup" aria-label="New benchmark setup"
        onKeyDown={event => { if (event.key === 'Escape' && !submitting) { setSetupOpen(false); setupToggle.current?.focus(); } }}
        onSubmit={event => { event.preventDefault(); void start(); }}>
        <label>Mode<select ref={modeControl} value={mode} disabled={busy} onChange={event => {
          const nextMode = event.target.value as typeof mode;
          setMode(nextMode);
          setSelectedAgents(trackDAgentsByMode[nextMode]);
          setFault('none');
        }}>
          <option value="fixture">Offline fixtures</option><option value="live">Live Bifrost agents</option></select></label>
        <label>Task<select value={task} disabled={busy} onChange={event => setTask(event.target.value as typeof task)}>
          <option value="both">Both graph tasks</option>{Object.entries(tasks).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
        <label>Repeats<select value={repeats} disabled={busy} onChange={event => setRepeats(Number(event.target.value))}>
          {[1, 2, 3].map(count => <option key={count} value={count}>{count} per entry</option>)}</select></label>
        <label>Scenario<select value={fault} disabled={busy} onChange={event => setFault(event.target.value as typeof fault)}>
          {Object.entries(faults).filter(([value]) => mode === 'live' || value === 'none' || value === 'tool-error')
            .map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <fieldset className="track-agents" disabled={busy}>
          <legend>{mode === 'live' ? 'Coding agents' : 'Offline entries'}</legend>
          {trackDAgentsByMode[mode].map(agent => <label key={agent}>
            <input type="checkbox" checked={selectedAgents.includes(agent)} onChange={event => {
              const checked = event.target.checked;
              setSelectedAgents(previous => checked ? [...previous, agent] : previous.filter(id => id !== agent));
            }}/>
            <span><strong>{trackDAgentLabels[agent]}</strong><small>{agentDescriptions[agent]}</small></span>
          </label>)}
        </fieldset>
        <div className="track-launch">
          <p>{planned === 0 ? 'Select at least one entry.' : `${planned} planned ${planned === 1 ? 'trial' : 'trials'}`}
            {selectedAgents.length === 1 && ' · Select both entries for a side-by-side comparison.'}</p>
          <button className="primary" type="submit" disabled={busy || !status || !selectedAgents.length || (mode === 'live' && !liveReady)}>
            <FlaskConical size={15} aria-hidden="true"/> {busy ? 'Benchmark running' : 'Run benchmark'}</button>
        </div>
      </form>}
      {error && <p className="track-error" role="alert">{error}</p>}
      {(showSetupHelp || (error && !status) || otherActive || stopped) && <div className="track-status">
        {showSetupHelp && <p>{status.liveIssue ?? 'Live mode requires a pinned Bifrost model and OpenCode CLI.'}</p>}
        {(showSetupHelp || (error && !status)) && <button className="secondary" type="button" onClick={() => {
          setError('');
          setRefresh(previous => previous + 1);
        }}>Refresh setup</button>}
        {otherActive && <button className="secondary" type="button" onClick={() => {
          selectSession(otherActive);
        }}>Open active benchmark</button>}
        {stopped && <button className="secondary" type="button" onClick={() => {
          setError('');
          setStoppedId(undefined);
        }}>Check session again</button>}
      </div>}
      {(session || savedSessions.length > 0) && <div className="track-session">
        {session && <p className="track-session-status" role="status" tabIndex={-1} ref={progress}>
          <strong>{stopped ? 'Tracking stopped' : session.status === 'running' ? `${session.runs.length} of ${expected} trials finished`
            : session.message ?? `${session.runs.length} results${unavailable ? ` · ${unavailable} unavailable` : ''}`}</strong>
          <span>{session.request.mode === 'fixture' ? 'Offline fixtures' : session.comparable ? 'Pinned Bifrost model verified'
            : session.status === 'running' ? 'Live Bifrost session' : 'Pinned model comparability unconfirmed'}</span></p>}
        {savedSessions.some(item => item.id !== session?.id) && <label className="track-session-select">Saved sessions
          <select value={session?.id ?? ''} disabled={submitting} onChange={event => selectSession(savedSessions.find(item => item.id === event.target.value))}>
            <option value="" hidden>Select a session</option>{savedSessions.map(item => <option key={item.id} value={item.id}>
              {item.request.mode === 'live' ? 'Live' : 'Fixture'} · {new Date(item.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </option>)}
          </select></label>}
        {session && <a className="secondary" href={`/api/track-d/${session.id}`} download={`proofbench-graph-repair-${session.id}.json`}>
          <ArrowDownToLine size={14} aria-hidden="true"/> Evidence JSON</a>}
      </div>}
      {session ? <>
        <dl className="track-session-meta">
          <div><dt>Model</dt><dd>{session.model ?? 'Offline fixtures'}</dd></div>
          <div><dt>Task suite</dt><dd>{session.request.tasks.length === 1 ? tasks[session.request.tasks[0]] : 'Both graph tasks'} · {session.request.repeats} {session.request.repeats === 1 ? 'repeat' : 'repeats'}</dd></div>
          <div><dt>Scenario</dt><dd>{faults[session.request.fault]}</dd></div>
          <div><dt>Per-trial limits</dt><dd>{session.request.mode === 'fixture' ? 'Independent grader only'
            : `${session.limits.modelCalls} model calls · ${session.limits.outputTokensPerCall.toLocaleString()} output tokens/call · ${session.limits.agentSeconds}s`}</dd></div>
        </dl>
        <TrackDComparison key={session.id} session={session} onVerify={onVerify}/>
      </> : <div className="track-empty">
        <strong>{status ? 'No benchmark selected' : error ? 'Results unavailable' : 'Loading saved comparisons…'}</strong>
        <p>{status && 'Start a live comparison or run offline fixtures through the same isolated grader.'}</p>
      </div>}
      <details className="track-method">
        <summary>How a patch passes</summary>
        <ol>
          <li><strong>01 · Same starting point</strong><span>Each agent gets a fresh copy of the task and the same pinned model and limits in live mode.</span></li>
          <li><strong>02 · Independent checks</strong><span>An isolated worker compiles the patch and compares its answers with the Speed Demon Track D reference on public, edge-case, and seeded inputs.</span></li>
          <li><strong>03 · One verdict per trial</strong><span>Every output must match exactly. The grade measures functional correctness. Solver speed and maintainability are separate.</span></li>
        </ol>
        <p className="track-comparison-note">ProofBench counts file edits and public checks. OpenCode counts tool events from its CLI.
          {' '}ProofBench receives public feedback during editing; OpenCode receives host grading after editing.
          {session && <> Grader revision <code>{session.oracle}</code>.
            {session.publicSuiteRevision && <> Public suite <code>{session.publicSuiteRevision}</code>.</>}
            {session.reasoningEffort && <> Requested reasoning effort: {session.reasoningEffort}.</>}</>}</p>
      </details>
    </div>
  </section>;
}
