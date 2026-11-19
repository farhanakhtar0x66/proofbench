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
  action?: 'replay-ladder' | 'load-assessment' | 'start-race';
  /** Planned seconds on this stop; their sum is the pitch length. */
  seconds: number;
  cues: string[];
};

export const stops: Stop[] = [
  { title: 'Title', path: '/', card: 'title', seconds: 15, cues: [
    'Every coding agent sends every step to the most expensive model it has.',
    'Cascade: change one URL, and your agent spends big-model tokens only when its own tests prove it needs them.',
  ] },
  { title: 'Live race', path: '/race', target: '.race-lanes', action: 'start-race', seconds: 75, cues: [
    'Three lanes, same 5 real bugs, same agent loop, all through a local Bifrost gateway (virtual key, $5/day budget).',
    'Left: small model only. Middle: big model only, what agents do today. Right: Cascade.',
    'Every patch runs in a Node permission sandbox: no files outside the task, no child processes, and on Node 26 no network.',
    'Watch the calculator task: the small model gets stuck on the same failing tests.',
    'Cascade sees it in the test output, escalates, and hands the big model an autopsy instead of the failed history.',
  ] },
  { title: 'Result', path: '/race', target: '.scoreboard', seconds: 35, cues: [
    'Every recorded live race (3): Cascade 15/15 for 60% less than big-only (15/15), about half the time. Small-only 13/15.',
    'Not every run is a win: one cost 26% more (a runaway 6,000-token reply). The page keeps it.',
    'Best run: 82% less, 3.9× sooner; with the autopsy the big model fixed calc first try where big-only needed four.',
    'Dollars are projected at list prices: the NVIDIA endpoints in the demo are free. Tokens are real.',
  ] },
  { title: 'Any agent', path: '/race', target: '.any-agent', seconds: 45, cues: [
    'Cascade is OpenAI-compatible: we ran the real OpenCode CLI, unmodified, with only its base URL changed.',
    'It reads the test output the agent already sends back. No plugin, no SDK.',
    '12 recorded OpenCode runs: every task fixed both ways; Cascade $0.26 vs $0.79 for big-only (67% less), faster on every task.',
    'Routine bugs about 95% cheaper; the hard one about 54% at the median, with one escalation per run.',
    'Our first version lost on the hard task: the big model re-read every failed step. We added safe compaction, and the README shows both.',
  ] },
  { title: 'Under the hood', path: '/benchmarks/routing', target: '.escalation-ladder', action: 'replay-ladder', seconds: 35, cues: [
    'The brain is ProofBench: M2 loop breaker (repeated patch, same failure signature, no test progress).',
    'M3a autopsy: errors and diffs only, compacted to a 2,000-token budget, used only when it is actually smaller.',
    'Outcome-based, not a guess: Bifrost 2.6 has a complexity analyzer that predicts from the prompt; Cascade routes on what the tests prove.',
  ] },
  { title: 'Graph Repair', path: '/benchmarks', target: '.track-comparison', seconds: 35, cues: [
    'Same engine against OpenCode on C++ bugs in Docker: both 6/6, 860 vs 17,438 tokens per trial.',
    'Not a ranking: ProofBench sees public test feedback while editing. The screen says so.',
  ] },
  { title: 'Verifier', path: '/verify', target: '#freshness-findings', action: 'load-assessment', seconds: 30, cues: [
    'Tavily track: claims checked against live, dated sources. "Steve Ballmer is CEO" is contradicted by two independent sources.',
    'Fails closed: one source is never enough; an undated page never counts.',
  ] },
  { title: 'Close', path: '/', card: 'close', seconds: 30, cues: [
    'One URL. Small model first. The big model only on proof. Every patch tested.',
    'Built for Bifrost PS01 (token-efficient coding agent) and PS04 (a gateway feature operators would miss).',
    'Credits: Routing engine & Cascade Farhan · Graph Repair & UI Aryan · Verifier Mohit · Evaluation Khushi. Questions?',
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
