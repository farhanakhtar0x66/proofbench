import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MonitorSpeaker, NotebookText, X } from 'lucide-react';
import { LOAD_ASSESSMENT_EVENT } from './Verifier';
import { CHANNEL, PITCH_SECONDS, SAVED_ASSESSMENT_ID, clock, plannedStart, stops, type PresentMessage, type Stop } from './presentation';
import { useCountUp } from './useCountUp';
import { toggleTheme } from './theme';
import './present.css';

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/** Waits for an element to exist (a page may still be loading its data), up to `ms`. */
function waitFor(selector: string, ms = 5000): Promise<HTMLElement | null> {
  return new Promise(resolve => {
    const began = performance.now();
    const look = () => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element || performance.now() - began > ms) resolve(element);
      // A timer, not requestAnimationFrame: frames pause while the window is hidden or covered.
      else setTimeout(look, 50);
    };
    look();
  });
}

async function arrive(stop: Stop, isCurrent: () => boolean) {
  // Let the route's own scroll-to-top run first.
  await new Promise(resolve => setTimeout(resolve, 60));
  if (!isCurrent()) return;
  if (!stop.target) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
  else {
    const element = await waitFor(stop.target);
    if (!element || !isCurrent()) return;
    const offset = () => (document.querySelector('.masthead')?.getBoundingClientRect().height ?? 0) + 16;
    window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - offset(), behavior: 'smooth' });
    // On a first visit, content above the target (charts, art) can still be arriving and
    // push it down after the scroll. Re-align for a moment until the layout settles.
    for (let check = 0; check < 6; check++) {
      await new Promise(resolve => setTimeout(resolve, 300));
      if (!isCurrent()) return;
      const drift = element.getBoundingClientRect().top - offset();
      if (Math.abs(drift) > 24) window.scrollTo({ top: window.scrollY + drift, behavior: 'smooth' });
    }
  }
  if (stop.action === 'replay-ladder') {
    await new Promise(resolve => setTimeout(resolve, 650));
    if (isCurrent()) document.querySelector<HTMLButtonElement>('.ladder-replay')?.click();
  }
  if (stop.action === 'load-assessment') {
    await waitFor('#saved-assessment');
    if (isCurrent()) window.dispatchEvent(new CustomEvent(LOAD_ASSESSMENT_EVENT, { detail: SAVED_ASSESSMENT_ID }));
  }
}

function Figure({ value, decimals = 0, suffix, label }: { value: number; decimals?: number; suffix: string; label: string }) {
  const shown = useCountUp(value, true, 1300);
  return <div><strong>{shown.toFixed(decimals)}<em>{suffix}</em></strong><span>{label}</span></div>;
}

const team = [['Farhan', 'Routing engine'], ['Aryan', 'Graph Repair & UI'], ['Mohit', 'Verifier'], ['Khushi', 'Evaluation']];

function Card({ kind }: { kind: 'title' | 'close' }) {
  return <section className="present-card" data-kind={kind} aria-live="polite">
    <div className="present-card-inner">
      <p className="eyebrow">[ GLOBAL AI HACKATHON · BIFROST #01 · TAVILY ]</p>
      {kind === 'title' ? <>
        <h1>ProofBench</h1>
        <p className="present-card-lead">The coding agent that spends small-model tokens first, calls the big model only on evidence, and proves every patch.</p>
      </> : <>
        <h1>Cheap tokens first.<br/><span>Proof every time.</span></h1>
        <div className="present-figures">
          <Figure value={20} suffix="×" label="fewer tokens per repair trial"/>
          <Figure value={42.6} decimals={1} suffix="%" label="fewer than the big model alone"/>
          <Figure value={12} suffix="/12" label="patches pass hidden tests"/>
        </div>
        <p className="present-card-lead">Every number downloads as JSON with model receipts.</p>
      </>}
      <ul className="present-team">{team.map(([name, role]) => <li key={name}><b>{name}</b>{role}</li>)}</ul>
      {kind === 'close' && <p className="present-thanks">Thank you. Questions?</p>}
    </div>
  </section>;
}

/** Presentation mode for the stage window. Off until `P`, the Present button or `?present`. */
export function PresentMode({ active, onExit, navigate }: { active: boolean; onExit: () => void; navigate: (href: string) => void }) {
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [notes, setNotes] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const current = useRef(index);
  current.current = index;
  const stop = stops[index];

  const go = useCallback((next: number) => setIndex(Math.max(0, Math.min(stops.length - 1, next))), []);

  // Start from the title card each time presentation mode is switched on.
  useEffect(() => {
    if (!active) return;
    setIndex(0);
    setStartedAt(Date.now());
    document.documentElement.dataset.presenting = '';
    return () => { delete document.documentElement.dataset.presenting; };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    navigate(stop.path);
    void arrive(stop, () => current.current === index);
  }, [active, index]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [active]);

  // Keep the speaker window in step: it can move the stage, and is told every move.
  useEffect(() => {
    if (!active || !('BroadcastChannel' in window)) return;
    const bus = new BroadcastChannel(CHANNEL);
    channel.current = bus;
    bus.onmessage = ({ data }: MessageEvent<PresentMessage>) => {
      if (data.type === 'go') go(data.index);
      if (data.type === 'hello') bus.postMessage({ type: 'state', index: current.current, startedAt } satisfies PresentMessage);
    };
    return () => { bus.close(); channel.current = null; };
  }, [active, go, startedAt]);
  useEffect(() => {
    if (active) channel.current?.postMessage({ type: 'state', index, startedAt } satisfies PresentMessage);
  }, [active, index, startedAt]);

  useEffect(() => {
    if (!active) return;
    const keys = (event: KeyboardEvent) => {
      if (typing(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      if (key === 'ArrowRight' || key === 'PageDown' || key === ' ') go(current.current + 1);
      else if (key === 'ArrowLeft' || key === 'PageUp') go(current.current - 1);
      else if (key === 'Home') go(0);
      else if (key === 'End') go(stops.length - 1);
      else if (key === 'Escape') onExit();
      else if (key === 'n' || key === 'N') setNotes(value => !value);
      else if (key === 's' || key === 'S') openSpeaker();
      else if (key === 'd' || key === 'D') toggleTheme();
      else if (key === 'r' || key === 'R') setStartedAt(Date.now());
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [active, go, onExit]);

  if (!active) return null;
  const elapsed = (now - startedAt) / 1000;
  const behind = elapsed - (plannedStart[index] + stop.seconds);
  const pace = behind > 10 ? 'behind' : elapsed > PITCH_SECONDS ? 'over' : 'ok';

  return <>
    {stop.card && <Card key={stop.card} kind={stop.card}/>}
    {notes && <aside className="present-notes" aria-label="Speaker cues"><ul>{stop.cues.map(cue => <li key={cue}>{cue}</li>)}</ul></aside>}
    <nav className="present-hud" aria-label="Presentation">
      <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous stop"><ChevronLeft size={16}/></button>
      <span className="present-step"><b>{index + 1}</b>/{stops.length}</span>
      <span className="present-title">{stop.title}</span>
      <span className="present-dots" aria-hidden="true">{stops.map((item, dot) => <i key={item.title} data-on={dot <= index}/>)}</span>
      <span className="present-clock" data-pace={pace} title="Elapsed (R resets)">{clock(elapsed)}</span>
      <button type="button" onClick={() => setNotes(value => !value)} aria-pressed={notes} aria-label="Show cues (N)"><NotebookText size={15}/></button>
      <button type="button" onClick={openSpeaker} aria-label="Open speaker window (S)"><MonitorSpeaker size={15}/></button>
      <button type="button" onClick={() => go(index + 1)} disabled={index === stops.length - 1} aria-label="Next stop"><ChevronRight size={16}/></button>
      <button type="button" onClick={onExit} aria-label="Exit presentation (Esc)"><X size={15}/></button>
    </nav>
  </>;
}

export function openSpeaker() {
  window.open('/?speaker', 'proofbench-speaker', 'popup,width=560,height=760');
}
