import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Activity, ArrowDown, ArrowUpRight, Braces, Check, CircleHelp, FileText, GitFork, Pause, Play, ShieldCheck, X } from 'lucide-react';
import type { ExecutionTrace, RunRecord } from '../../../packages/contracts/src/index';
import { EncryptedText } from './EncryptedText';

const TraceScene = lazy(() => import('./TraceScene'));
const REPLAY_STEP_MS = 4200;
const stages = [
  { name: 'Task', icon: FileText },
  { name: 'Routing', icon: GitFork },
  { name: 'Execution', icon: Braces },
  { name: 'Checks', icon: Activity },
  { name: 'Verdict', icon: ShieldCheck },
];

function Blueprint({ active }: { active: number }) {
  return <svg className="blueprint" viewBox="0 0 660 220" aria-hidden="true">
    <path d="M40 147H105l43-28h70l44 20h70l44-30h70l44 20h129" fill="none" stroke="#75a999" strokeWidth="2"/>
    {[100, 215, 330, 445, 560].map((x, index) => <g key={x} transform={`translate(${x} ${index % 2 ? 112 : 135})`}>
      <path d="M-41 0 0 -22 41 0 0 22z" fill={index === active ? '#43b79a' : '#acc6bb'}/>
      <path d="M-41 0 0 22 41 0v15L0 37l-41-22z" fill={index === active ? '#21856d' : '#789a8e'}/>
      <path d="M-18 -2 0 -12 18 -2 0 8z" fill="none" stroke={index === active ? '#0e6c54' : '#688d80'} strokeWidth="2"/>
      <path d="M0 38v15m-7 0h14" stroke="#75a999"/>
    </g>)}
  </svg>;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export function EvidenceMap({ run, trace, replayToken }: { run?: RunRecord; trace?: ExecutionTrace; replayToken?: number }) {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const lastStage = stages.length - 1;

  useEffect(() => {
    if (replayToken === undefined) return;
    setActive(0);
    setPlaying(true);
  }, [replayToken]);

  useEffect(() => {
    if (!playing || !trace) return;
    const timer = window.setTimeout(() => {
      if (active === lastStage) setPlaying(false);
      else setActive(active + 1);
    }, REPLAY_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [active, lastStage, playing, replayToken, trace]);

  function selectStage(index: number) {
    setPlaying(false);
    setActive(index);
  }

  function toggleReplay() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (active === lastStage) setActive(0);
    setPlaying(true);
  }
  const stage = stages[active];
  const StageIcon = stage.icon;
  const events = trace?.events ?? [];
  const isRoute = (event: ExecutionTrace['events'][number]) =>
    event.type === 'output' && (Boolean(event.data?.toTier) || /tier transition|routing|fallback provider/i.test(event.message));
  const stageEvents = active === 1 ? events.filter(isRoute) :
    active === 2 ? events.filter(event => event.type === 'error' || (event.type === 'output' && !isRoute(event))) :
    active === 4 ? events.filter(event => event.type === 'finish') : [];

  const acceptance = run?.acceptance.status;
  const passed = run?.acceptance.checks.filter(check => check.passed === true).length ?? 0;
  const mode = run?.reproducibility.simulated ? 'Simulated fixture' : 'Recorded run';

  return <section className="evidence-grid" id="execution-map" aria-label="Run evidence map">
    <div className="trace-plate">
      <div className="plate-header"><div><p className="plate-label"><span>FIG. 01</span> RUN ANATOMY</p><h2>Execution map</h2></div>
        <span className="plate-mode"><span aria-hidden="true"/>{run ? mode : 'Awaiting run'}</span></div>
      <div className="plot" aria-hidden="true">
        <span className="plot-axis axis-top">A — A</span><span className="plot-axis axis-bottom">SELECT A STATION</span>
        <span className="plot-reticle plot-reticle-start"/><span className="plot-reticle plot-reticle-end"/>
        <Blueprint active={active}/>
        <div className="plot-scene">
          <SceneBoundary>
            <Suspense fallback={null}><TraceScene active={active} onSelect={selectStage}/></Suspense>
          </SceneBoundary>
        </div>
      </div>
      <div className="stage-controls" data-playing={playing&&Boolean(trace)} style={{animationDuration:`${REPLAY_STEP_MS}ms`}} role="group" aria-label="Execution stages">
        {stages.map(({ name, icon: Icon }, index) => <button key={name} type="button" aria-pressed={index === active} onClick={() => selectStage(index)}>
          <span className="stage-index">0{index + 1}</span><Icon size={15} aria-hidden="true"/><span>{name}</span>
        </button>)}
      </div>
    </div>
    <div className="run-inspector" id="run-inspector" tabIndex={-1}>
      <div className="inspector-meta"><span className="eyebrow"><EncryptedText text="EVIDENCE INSPECTOR"/></span><span className="small">0{active + 1} / 05</span></div>
      <div className="inspector-body" aria-live={playing?'off':'polite'} aria-atomic="true"><div className="inspector-stage" key={active}>
        <span className="stage-symbol"><StageIcon size={19} aria-hidden="true"/></span>
        <h2>{stage.name}</h2>
        {!run ? <p>Run a task or select a record from the ledger to inspect its evidence.</p> : <>
          {active === 0 && <>
            <p className="inspector-title">{run.task.title}</p>
            <p>{run.task.prompt}</p>
            <dl className="run-facts">
              <div><dt>Task ID</dt><dd>{run.task.id}</dd></div>
              <div><dt>Trace events</dt><dd>{trace ? trace.events.length : 'Pending'}</dd></div>
            </dl>
          </>}
          {active === 1 && <p>{run.reproducibility.simulated ? 'The fixture ran locally without model routing.' : run.agent.model ? `Recorded model · ${run.agent.model}` : 'No model was recorded for this run.'}</p>}
          {active === 2 && run.output && <p>{run.output}</p>}
          {active === 3 && <><p><strong>{passed} / {run.acceptance.checks.length}</strong> checks passed</p>
            <ul className="stage-events">{run.acceptance.checks.map(check => <li key={check.name}><span>{check.passed === null ? 'Unknown' : check.passed ? 'Passed' : 'Failed'}</span> {check.name}</li>)}</ul></>}
          {active === 4 && <><p className={`verdict ${acceptance}`}>{acceptance === 'passed' ? <Check size={16}/> : acceptance === 'failed' ? <X size={16}/> : <CircleHelp size={16}/>} {acceptance}</p><p>{run.acceptance.method}</p></>}
          {stageEvents.length > 0 && <ul className="stage-events">{stageEvents.map(event => <li key={event.sequence}><span>#{event.sequence + 1}</span> {event.message}</li>)}</ul>}
          {active === 2 && !run.output && !stageEvents.length && <p>No execution output was recorded.</p>}
        </>}
        </div>
      </div>
      {run && <div className="inspector-actions">
        <button className="playback" type="button" disabled={!trace} onClick={toggleReplay} aria-label={playing ? 'Pause replay' : 'Play trace'}>
          {playing ? <Pause size={14} aria-hidden="true"/> : <Play size={14} aria-hidden="true"/>}
          <span>{playing ? 'Pause' : 'Play trace'}</span>
        </button>
        <a className="inspector-link" href="#execution-trace">Full trace <ArrowDown size={15} aria-hidden="true"/></a>
      </div>}
      {!run && <a className="inspector-link" href="#run-ledger">Open run ledger <ArrowUpRight size={15} aria-hidden="true"/></a>}
    </div>
  </section>;
}
