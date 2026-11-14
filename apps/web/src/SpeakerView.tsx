import { useEffect, useRef, useState } from 'react';
import { CHANNEL, PITCH_SECONDS, clock, plannedStart, stops, type PresentMessage } from './presentation';
import './present.css';

/** The speaker window (`/?speaker`): cues, what's next and the pace, driving the stage window. */
export function SpeakerView() {
  const [state, setState] = useState<{ index: number; startedAt: number }>();
  const [now, setNow] = useState(() => Date.now());
  const bus = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    document.title = 'Speaker · ProofBench';
    const channel = new BroadcastChannel(CHANNEL);
    bus.current = channel;
    channel.onmessage = ({ data }: MessageEvent<PresentMessage>) => {
      if (data.type === 'state') setState({ index: data.index, startedAt: data.startedAt });
    };
    channel.postMessage({ type: 'hello' } satisfies PresentMessage);
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => { channel.close(); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (!state) return;
      const step = event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ' ? 1
        : event.key === 'ArrowLeft' || event.key === 'PageUp' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      go(state.index + step);
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [state]);

  function go(index: number) {
    bus.current?.postMessage({ type: 'go', index: Math.max(0, Math.min(stops.length - 1, index)) } satisfies PresentMessage);
  }

  if (!state) return <main className="speaker speaker-waiting">
    <h1>Speaker view</h1>
    <p>Waiting for the stage window. Open ProofBench in another window, press <kbd>P</kbd> to present, then <kbd>S</kbd>.</p>
  </main>;

  const stop = stops[state.index];
  const next = stops[state.index + 1];
  const elapsed = (now - state.startedAt) / 1000;
  const due = plannedStart[state.index] + stop.seconds;
  const left = due - elapsed;
  return <main className="speaker">
    <header>
      <span className="speaker-step">{state.index + 1} / {stops.length}</span>
      <span className="speaker-clock" data-pace={left < -10 ? 'behind' : elapsed > PITCH_SECONDS ? 'over' : 'ok'}>{clock(elapsed)} <small>of {clock(PITCH_SECONDS)}</small></span>
    </header>
    <div className="speaker-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, elapsed / PITCH_SECONDS * 100)}%` }}/>
      <i style={{ left: `${due / PITCH_SECONDS * 100}%` }}/></div>
    <h1>{stop.title}</h1>
    <p className="speaker-budget">{left >= 0 ? `${Math.ceil(left)} s left on this stop` : `${Math.ceil(-left)} s over this stop's plan`}</p>
    <ul className="speaker-cues">{stop.cues.map(cue => <li key={cue}>{cue}</li>)}</ul>
    <footer>
      <button type="button" onClick={() => go(state.index - 1)} disabled={state.index === 0}>← Back</button>
      <span>{next ? <>Next: <b>{next.title}</b></> : 'Last stop'}</span>
      <button type="button" className="primary" onClick={() => go(state.index + 1)} disabled={!next}>Next →</button>
    </footer>
  </main>;
}
