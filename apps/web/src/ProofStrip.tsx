import { ArrowUpRight } from 'lucide-react';
import { useViewportEntry } from './PresentationArt';
import { WorkspaceLink } from './WorkspaceNavigation';
import { useCountUp } from './useCountUp';
import './pitch.css';

// Headline numbers for the pitch. Each comes from a saved live record that the
// linked page loads, so a judge can click straight through to its evidence:
// - Graph Repair session 94313e39 (docs/evidence/local-rerun-2026-11-07):
//   median tokens per trial 860.5 (ProofBench) vs 17,437.5 (OpenCode), 6/6 each.
// - Controlled routing benchmark (.local/data/optimization-benchmark-evidence.json):
//   4,461 tokens (governed escalation) vs 7,766 (direct 9B), one trial each.
const facts = [
  { value: 17_437.5 / 860.5, decimals: 0, suffix: '×', label: 'fewer tokens per repair trial',
    detail: '860 vs 17,438 median tokens per trial, same bugs, same model. Both agents passed 6 of 6.',
    href: '/benchmarks', link: 'Graph Repair' },
  { value: (1 - 4_461 / 7_766) * 100, decimals: 1, suffix: '%', label: 'fewer tokens than the big model',
    detail: 'Start on a 1.5B model, escalate to 9B only after a diagnosed failure. One recorded trial.',
    href: '/benchmarks/routing', link: 'Model routing' },
  { value: 12, decimals: 0, suffix: '/12', label: 'patches pass hidden tests',
    detail: 'Built in a Docker sandbox with no network and graded against a pinned reference oracle.',
    href: '/benchmarks', link: 'Trial matrix' },
  { value: 2, decimals: 0, suffix: '+', label: 'sources before any verdict',
    detail: 'Fails closed: a timeout, a malformed answer or an undated page never counts as evidence.',
    href: '/verify', link: 'Verifier' },
] as const;

function Fact({ fact, entered, index, navigate }: { fact: typeof facts[number]; entered: boolean; index: number; navigate: (href: string) => void }) {
  const shown = useCountUp(fact.value, entered, 900 + index * 180);
  return <WorkspaceLink href={fact.href} navigate={navigate} className="proof-fact">
    <span className="proof-fact-index">0{index + 1}</span>
    <strong aria-label={`${fact.value.toFixed(fact.decimals)}${fact.suffix}`}>
      <span aria-hidden="true">{shown.toFixed(fact.decimals)}</span><em aria-hidden="true">{fact.suffix}</em>
    </strong>
    <span className="proof-fact-label">{fact.label}</span>
    <p>{fact.detail}</p>
    <span className="proof-fact-link">{fact.link}<ArrowUpRight size={13} aria-hidden="true"/></span>
  </WorkspaceLink>;
}

export function ProofStrip({ navigate }: { navigate: (href: string) => void }) {
  const { ref, entered } = useViewportEntry<HTMLElement>();
  return <section className="proof-strip" ref={ref} data-entered={entered} aria-labelledby="proof-strip-title">
    <h2 id="proof-strip-title" className="eyebrow">[ MEASURED, NOT CLAIMED · LIVE RUNS, 7 NOV 2026 ]</h2>
    <div className="proof-facts">
      {facts.map((fact, index) => <Fact key={fact.label} fact={fact} entered={entered} index={index} navigate={navigate}/>)}
    </div>
    <p className="proof-strip-note">Qwen3.5-9B through one Bifrost gateway, 2 C++ bugs × 3 repeats. ProofBench sees public test feedback while editing and OpenCode does not, so this compares cost, not skill. Every number links to its records and downloads as JSON.</p>
  </section>;
}
