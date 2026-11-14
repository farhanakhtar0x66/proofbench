import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Pause, Play, X } from 'lucide-react';
import { trackDGatewayAttempts, type TrackDRun } from '../../../packages/contracts/src/track-d';

export const verdictClass = { passed: 'pill', failed: 'pill failed', unavailable: 'pill unknown' };
const display = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString();
const unavailableDetails = {
  'agent-timeout': 'The agent reached its time limit. Retry when the local model is ready.',
  'gateway-error': 'The agent could not get a usable gateway response. Check the receipts and local Bifrost logs.',
  'agent-error': 'The agent could not submit a usable source file. Check the trace and adapter setup.',
  'grader-error': 'The grader could not finish. Check the configured worker and rerun the trial.',
  interrupted: 'The server stopped during this trial. Start a new run to finish the comparison.',
};

function TrialTimeline({ trace }: { trace: TrackDRun['trace'] }) {
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const eventList = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = eventList.current;
    const item = list?.children[cursor] as HTMLElement | undefined;
    if (!list || !item || !list.clientHeight) return;
    const end = item.offsetTop + item.offsetHeight;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (end > list.scrollTop + list.clientHeight) list.scrollTop = end - list.clientHeight;
  }, [cursor]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (cursor + 1 >= trace.length) setPlaying(false);
      else setCursor(cursor + 1);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [cursor, playing, trace.length]);
  return <div className="track-timeline">
    <div className="track-playback">
      <button className="secondary" type="button" onClick={() => {
        if (!playing && cursor + 1 >= trace.length) setCursor(0);
        setPlaying(!playing);
      }}>{playing ? <Pause size={14} aria-hidden="true"/> : <Play size={14} aria-hidden="true"/>} {playing ? 'Pause' : 'Replay'}</button>
      <input aria-label="Trace event" type="range" min={0} max={trace.length - 1} value={cursor}
        onChange={event => { setPlaying(false); setCursor(Number(event.target.value)); }}/>
      <span>{cursor + 1}/{trace.length}</span>
    </div>
    <ol className="track-events" aria-label="Trial events" ref={eventList}>{trace.map((event, index) => <li key={index}>
      <button type="button" aria-current={index === cursor ? 'step' : undefined} onClick={() => { setPlaying(false); setCursor(index); }}>
        <small>{String(index + 1).padStart(2, '0')} · {event.source === 'gateway' ? 'Bifrost' : event.source}</small>
        <span>{event.message}</span>
      </button>
    </li>)}</ol>
  </div>;
}

export function TrackDRunEvidence({ run, fixture, onVerify, onClose }: {
  run: TrackDRun; fixture: boolean; onVerify: (text: string) => void; onClose: () => void;
}) {
  const checks = [...run.checks].sort((left, right) => Number(left.outcome === 'passed') - Number(right.outcome === 'passed'));
  return <article className="track-proof" id="track-run-evidence" aria-labelledby="track-proof-title" tabIndex={-1}>
    <header className="panel-heading">
      <div><p className="eyebrow">[ 03 / TRIAL EVIDENCE ]</p><h3 id="track-proof-title">{run.agent}</h3></div>
      <div className="track-proof-actions"><span className={verdictClass[run.verdict]}>{run.verdict}</span>
        <button className="track-close" type="button" aria-label="Close trial evidence" onClick={onClose}><X size={16} aria-hidden="true"/></button></div>
    </header>
    {run.unavailableReason && <p className="track-intro">{unavailableDetails[run.unavailableReason]}</p>}
    {!run.unavailableReason && run.receipts.some(receipt => receipt.relayRejection) &&
      <p className="track-intro">The shared model-call budget was reached. Final grading used the last source artifact.</p>}
    <div className="track-check-summary"><h4>Grader checks</h4><p>{checks.length ? `${checks.filter(check => check.outcome === 'passed').length} of ${checks.length} passed` : 'No checks recorded'}</p></div>
    <ul className="track-checks">
      {checks.map(check => <li key={check.name}><strong>{check.name}</strong>
        <span className={verdictClass[check.outcome]}>{check.outcome}</span><p>{check.detail}</p></li>)}
    </ul>
    {!fixture && <details className="track-disclosure"><summary>Trial metrics</summary>
      <dl className="track-trial-metrics">
        <div><dt>Agent latency</dt><dd>{(run.agentMs / 1000).toFixed(1)} s</dd></div>
        <div><dt>Time to verdict</dt><dd>{run.verdictMs === undefined ? 'Unavailable' : `${(run.verdictMs / 1000).toFixed(1)} s`}</dd></div>
        <div><dt>Tool calls</dt><dd>{display(run.toolCalls)}</dd></div>
        <div><dt>Steps</dt><dd>{display(run.steps)}</dd></div>
        <div><dt>Input tokens</dt><dd>{display(run.inputTokens)}</dd></div>
        <div><dt>Output tokens</dt><dd>{display(run.outputTokens)}</dd></div>
        <div><dt>Gateway attempts</dt><dd>{trackDGatewayAttempts(run.receipts)}</dd></div>
        <div><dt>Relay cap rejections</dt><dd>{run.receipts.filter(receipt => receipt.relayRejection).length}</dd></div>
        <div><dt>Cost</dt><dd>{run.costUsd === null ? 'Unavailable' : `$${run.costUsd.toFixed(4)}`}</dd></div>
      </dl>
    </details>}
    <details className="track-disclosure"><summary>Patch diff and source hash</summary>
      <p className="track-hash">{run.sourceSha256 ?? 'Source hash unavailable'}</p>
      <pre tabIndex={0}>{run.diff || (run.unavailableReason && run.unavailableReason !== 'grader-error'
        ? 'No usable patch was available for grading.' : 'No change to the starter.')}</pre>
    </details>
    {run.trace.length > 0 && <details className="track-disclosure"><summary>Execution timeline <small>{run.trace.length} events</small></summary>
      <TrialTimeline trace={run.trace}/>
    </details>}
    {run.receipts.length > 0 && <details className="track-disclosure"><summary>Bifrost receipts</summary>
      <ul className="track-checks">{run.receipts.map((receipt, index) => <li key={index}>
        <strong>HTTP {receipt.status} · {receipt.relayRejection ? 'Relay call limit' : receipt.injected ? 'Injected fault' : (receipt.model ?? 'Model unconfirmed')}</strong>
        <p>{receipt.relayRejection ? 'Not forwarded to Bifrost' : (receipt.requestId ?? 'No request ID')} · {display(receipt.input)} in / {display(receipt.output)} out</p>
      </li>)}</ul>
    </details>}
    {run.agentNote && <details className="track-disclosure"><summary>Agent explanation</summary>
      <p>{run.agentNote}</p>
      <button className="text-button" type="button" onClick={() => onVerify(run.agentNote!)}>Check claims in Freshness Verifier <ArrowRight size={14}/></button>
    </details>}
  </article>;
}
