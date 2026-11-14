import { useState, type CSSProperties } from 'react';
import { RotateCcw } from 'lucide-react';
import { useViewportEntry } from './PresentationArt';
import type { useControlledBenchmark } from './ControlledBenchmark';
import './pitch.css';

type Summary = NonNullable<ReturnType<typeof useControlledBenchmark>['data']>['summary'];
type Step = { label: string; detail: string; kind?: 'small' | 'large' | 'control' | 'pass' | 'fail' };

// The cheap model works first; the expensive one is called only with a compact,
// evidence-only autopsy of what failed (the NeuroMesh worker ladder, drawn the
// way its TUI team graph lights up edges as work is handed on).
const lanes: { key: keyof Summary; title: string; caption: string; steps: (passed: boolean) => Step[] }[] = [
  { key: 'controlled_direct_small', title: 'Small model alone', caption: 'Cheap, but stuck',
    steps: passed => [{ label: 'Task', detail: 'Same prompt' }, { label: 'Qwen 1.5B', detail: 'Writes the patch', kind: 'small' },
      { label: 'cargo test', detail: passed ? 'Passed' : 'Failed, no way up', kind: passed ? 'pass' : 'fail' }] },
  { key: 'controlled_direct_frontier', title: 'Big model always', caption: 'Works, at full price',
    steps: passed => [{ label: 'Task', detail: 'Same prompt' }, { label: 'Qwen 9B', detail: 'Every turn', kind: 'large' },
      { label: 'cargo test', detail: passed ? 'Passed' : 'Failed', kind: passed ? 'pass' : 'fail' }] },
  { key: 'controlled_escalation_only', title: 'ProofBench governed', caption: 'Cheap first, expert on evidence',
    steps: passed => [{ label: 'Task', detail: 'Same prompt' }, { label: 'Qwen 1.5B', detail: 'Tries first', kind: 'small' },
      { label: 'M2 loop breaker', detail: 'Stops repeat failures', kind: 'control' },
      { label: 'M3a autopsy', detail: 'Errors and diffs only, ≤ 2,000 tokens', kind: 'control' },
      { label: 'Qwen 9B', detail: 'Repairs from the autopsy', kind: 'large' },
      { label: 'cargo test', detail: passed ? 'Passed' : 'Failed', kind: passed ? 'pass' : 'fail' }] },
];

const number = new Intl.NumberFormat('en-US');
const STEP_MS = 420;

export function EscalationLadder({ summary }: { summary: Summary }) {
  const { ref, entered } = useViewportEntry<HTMLElement>();
  const [replay, setReplay] = useState(0);
  const maxTokens = Math.max(...lanes.map(lane => summary[lane.key].avgTotalTokens ?? 0), 1);
  let offset = 0;

  return <section className="escalation-ladder" ref={ref} data-entered={entered} aria-labelledby="ladder-title">
    <header className="ladder-heading">
      <div><p className="eyebrow">[ HOW THE ROUTING WORKS ]</p>
        <h2 id="ladder-title">The expensive model is called only when the cheap one is provably stuck.</h2></div>
      <button type="button" className="secondary ladder-replay" onClick={() => setReplay(value => value + 1)}><RotateCcw size={14} aria-hidden="true"/> Replay</button>
    </header>
    <ol className="ladder-lanes" key={replay}>
      {lanes.map(lane => {
        const result = summary[lane.key];
        const passed = result.passedTrials > 0;
        const steps = lane.steps(passed);
        const start = offset;
        offset += steps.length;
        const tokens = result.avgTotalTokens;
        return <li key={lane.key} className="ladder-lane" data-governed={lane.key === 'controlled_escalation_only'}>
          <div className="ladder-lane-title"><strong>{lane.title}</strong><span>{lane.caption}</span></div>
          <ol className="ladder-steps" aria-label={`${lane.title}: ${steps.map(step => step.label).join(', then ')}`}>
            {steps.map((step, index) => <li key={step.label + index} data-kind={step.kind ?? 'input'}
              style={{ '--step-delay': `${(start + index) * STEP_MS}ms` } as CSSProperties}>
              <strong>{step.label}</strong><small>{step.detail}</small>
            </li>)}
          </ol>
          <div className="ladder-result" style={{ '--step-delay': `${(start + steps.length) * STEP_MS}ms` } as CSSProperties}>
            <span className={`pill ${passed ? 'passed' : 'failed'}`}>{result.passedTrials}/{result.totalTrials} passed</span>
            <div className="ladder-tokens"><span style={{ width: `${(tokens ?? 0) / maxTokens * 100}%` }}/></div>
            <span className="ladder-figure">{tokens === null ? 'Tokens not reported' : `${number.format(tokens)} tokens`}
              {result.avgWallDurationMs !== null && ` · ${(result.avgWallDurationMs / 1000).toFixed(1)} s`}</span>
          </div>
        </li>;
      })}
    </ol>
    <p className="track-comparison-note">One recorded trial per strategy on the same Rust task, with the same tools and checks. An illustration of the mechanism, not a statistic.</p>
  </section>;
}
