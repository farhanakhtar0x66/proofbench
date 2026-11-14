import type { WorkspacePath } from './WorkspaceNavigation';

// The pitch as a sequence of stops. Each stop opens a page, scrolls to the part
// that matters and can trigger what the demo needs, so nothing is typed or
// hunted for on stage. Cues are short on purpose: they remind, they don't script.

export const SAVED_ASSESSMENT_ID = '994ce642-e336-4273-9ce3-37e8d01c2a52';
export const PITCH_SECONDS = 5 * 60;

export type Stop = {
  title: string;
  path: WorkspacePath;
  /** CSS selector to bring under the masthead; none means the top of the page. */
  target?: string;
  card?: 'title' | 'close';
  action?: 'replay-ladder' | 'load-assessment';
  /** Planned seconds on this stop; their sum is the pitch length. */
  seconds: number;
  cues: string[];
};

export const stops: Stop[] = [
  { title: 'Title', path: '/', card: 'title', seconds: 15, cues: [
    'Coding agents burn expensive tokens and ask you to trust the result.',
    'ProofBench spends small-model tokens first and proves every patch.',
  ] },
  { title: 'The claim', path: '/', seconds: 15, cues: [
    'Agents and AI answers make claims. ProofBench makes them show evidence.',
    'Patches are graded in a sandbox; facts are checked against sources you can open.',
  ] },
  { title: 'Four numbers', path: '/', target: '.proof-strip', seconds: 30, cues: [
    '~20× fewer tokens per repair trial than OpenCode, same bugs, same model.',
    '42.6% fewer tokens than going straight to the big model.',
    '12 of 12 patches pass hidden tests in a no-network sandbox.',
    'Two independent sources before any verdict. Every number is a link.',
  ] },
  { title: 'Graph Repair scorecard', path: '/benchmarks', target: '.track-comparison', seconds: 60, cues: [
    'ProofBench vs OpenCode, same local Qwen3.5-9B, same Bifrost gateway, alternating order.',
    '2 C++ graph bugs × 3 repeats. Docker, no network, pinned reference oracle (Speed Demon 2026, MIT).',
    'Both 6/6. "Pinned Bifrost model verified": every model receipt matched.',
    '860 vs 17,438 tokens per trial; 13 s vs 31 s median.',
    'Not a ranking: ProofBench sees public test feedback while editing. The screen says so.',
  ] },
  { title: 'Cost on a paid API', path: '/benchmarks', target: '.cost-projection', seconds: 30, cues: [
    'Same recorded tokens at list prices. Sonnet 5.5, 10k repairs/month: ~$49 vs ~$411, 8.4× cheaper.',
    'Less than 20× because our tokens are output-heavy, and the screen shows why.',
    'An estimate: the runs used a local model.',
  ] },
  { title: 'Model routing', path: '/benchmarks/routing', target: '.escalation-ladder', action: 'replay-ladder', seconds: 45, cues: [
    'Small model alone gets stuck: 0 of 1. Big model passes, at full price.',
    'ProofBench starts on 1.5B; the loop breaker sees repeat failures,',
    'the 9B gets a compact autopsy of only the errors and diffs.',
    '4,461 vs 7,766 tokens, 42.6% fewer, 2.6× faster. One trial each: an illustration.',
  ] },
  { title: 'Verifier', path: '/verify', target: '#freshness-findings', action: 'load-assessment', seconds: 60, cues: [
    'Claim: "Steve Ballmer is the current CEO of Microsoft."',
    'Tavily retrieved live sources; the local model compared each, quoting the full excerpt; the backend decided.',
    'Microsoft and a Detroit Regional Chamber bio say he retired: contradicted by two independent sources.',
    'Forbes agreed, but its page date was invalid, so it was not counted.',
    'Fails closed: one source is never enough; a timeout is never a verdict.',
  ] },
  { title: 'Receipts', path: '/benchmarks', seconds: 20, cues: [
    'Every number downloads as JSON with model receipts (Evidence JSON, top right).',
    'Our first pilot said OpenCode 0 of 6. It did not reproduce, so we published the rerun.',
    'That is the point of ProofBench.',
  ] },
  { title: 'Close', path: '/', card: 'close', seconds: 25, cues: [
    'Cheap tokens first. The expensive model only on evidence. Proof every time.',
    'Credits: Graph Repair & UI Aryan · Verifier Mohit · Routing engine & integration Farhan · Evaluation Khushi.',
    'Thank you. Questions?',
  ] },
];

/** Seconds into the pitch at which each stop should start. */
export const plannedStart = stops.map((_, index) => stops.slice(0, index).reduce((sum, stop) => sum + stop.seconds, 0));

export const clock = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;

// Messages between the stage window and the speaker window.
export const CHANNEL = 'proofbench-present';
export type PresentMessage =
  | { type: 'state'; index: number; startedAt: number }
  | { type: 'go'; index: number }
  | { type: 'hello' };
