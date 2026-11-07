import { expect, test } from '@playwright/test';
import { trackDAgentLabels, type TrackDAgent, type TrackDRun, type TrackDSession } from '../../packages/contracts/src/track-d';

const id = '33333333-3333-4333-8333-333333333333';
const session: TrackDSession = {
  id, createdAt: '2026-11-07T00:00:00.000Z', model: 'ollama/test', comparable: true,
  request: { mode: 'live', tasks: ['distance-width', 'directed-edges'], repeats: 2, fault: 'none' },
  status: 'completed', worker: { kind: 'docker', id: 'test-worker' }, oracle: 'test-oracle',
  limits: { modelCalls: 6, outputTokensPerCall: 3500, agentSeconds: 150 }, runs: [],
};

function trial(agent: TrackDAgent, task: TrackDRun['task'], repeat: number, verdict: TrackDRun['verdict'], inputTokens: number | null): TrackDRun {
  return { id: `${agent}-${task}-${repeat}`, agent: trackDAgentLabels[agent], task, repeat, seed: repeat + 1,
    verdict, inputTokens, outputTokens: inputTokens === null ? null : 10, agentMs: agent === 'proofbench' ? 1500 : 500, toolCalls: 2,
    steps: 1, costUsd: null, sourceSha256: null, diff: '', receipts: [],
    checks: [{ name: 'Hidden overflow', outcome: verdict, detail: verdict === 'failed' ? 'Answer 1: expected 5000000000, got 0.' : 'Exact output matched.' }],
    trace: [{ source: 'gateway', message: 'HTTP 200 · ollama/test', at: session.createdAt }] };
}

test('submits exactly the selected coding agents and tasks', async ({ page }) => {
  await page.route('**/api/track-d', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 202, json: { ...session, status: 'running', request: route.request().postDataJSON() } })
    : route.fulfill({ json: { liveConfigured: true, sessions: [] } }));
  await page.route(`**/api/track-d/${id}`, route => route.fulfill({ json: { ...session, status: 'failed' } }));
  await page.goto('/#track-d');
  const track = page.locator('#track-d');
  await expect(track.getByRole('heading', { name: 'Graph Repair' })).toBeVisible();
  await expect(track.getByRole('form', { name: 'New benchmark setup' })).toHaveCount(0);
  await track.getByRole('button', { name: 'New benchmark' }).click();
  await expect(track.getByRole('combobox', { name: 'Mode' })).toBeFocused();
  await track.getByRole('combobox', { name: 'Mode' }).selectOption('live');
  await track.getByRole('checkbox', { name: /OpenCode CLI/ }).uncheck();
  await track.getByRole('combobox', { name: 'Task', exact: true }).selectOption('directed-edges');
  await expect(track.getByText(/1 planned trial/)).toBeVisible();
  const [request] = await Promise.all([
    page.waitForRequest(request => request.url().endsWith('/api/track-d') && request.method() === 'POST'),
    track.getByRole('button', { name: 'Run benchmark' }).click(),
  ]);
  expect(request.postDataJSON()).toEqual({ mode: 'live', agents: ['proofbench'], tasks: ['directed-edges'], repeats: 1, fault: 'none' });
  await expect(track.getByRole('form', { name: 'New benchmark setup' })).toHaveCount(0);
});

test('compares matched trials, accounts for failed attempts, and keeps missing usage distinct', async ({ page }) => {
  await page.route('**/api/track-d', route => route.fulfill({ json: { liveConfigured: true, sessions: [{ ...session, runs: [
    trial('proofbench', 'distance-width', 1, 'passed', 90), trial('opencode', 'distance-width', 1, 'failed', 40),
    trial('proofbench', 'distance-width', 2, 'failed', 190), trial('opencode', 'distance-width', 2, 'failed', 50),
    trial('proofbench', 'directed-edges', 1, 'passed', null), trial('opencode', 'directed-edges', 1, 'failed', 30),
    trial('opencode', 'directed-edges', 2, 'passed', 600),
  ] }] } }));
  await page.goto('/#track-d');
  const track = page.locator('#track-d');
  await expect(track.getByText(/3 of 4 matched trials per entry/)).toBeVisible();
  await expect(track.getByRole('note', { name: 'Comparison limits' })).toBeVisible();
  const scorecard = track.getByRole('table', { name: 'Agent scorecard' });
  await expect(scorecard.getByText('Usage incomplete')).toBeVisible();
  await expect(scorecard.getByText('No passing repairs')).toBeVisible();
  await track.getByRole('combobox', { name: 'Task filter' }).selectOption('distance-width');
  await expect(scorecard.getByText('300', { exact: true })).toBeVisible();
  await expect(scorecard.getByText('50%', { exact: true })).toBeVisible();
  await scorecard.getByRole('button', { name: 'Agent latency' }).click();
  await expect(scorecard.getByRole('row').nth(1)).toContainText('OpenCode CLI');
  await track.getByRole('button', { name: 'Latency', exact: true }).click();
  await expect(track.getByRole('img', { name: /Pass rate versus median agent latency/ })).toBeVisible();

  const matrix = track.getByRole('table', { name: 'Task verdict matrix' });
  await expect(matrix.getByText('Directed reachability')).toHaveCount(0);
  const verdict = matrix.getByRole('button', { name: 'OpenCode CLI, Long-distance overflow, run 1, failed' });
  await verdict.click();
  const evidence = track.getByRole('article', { name: 'OpenCode CLI' });
  await expect(evidence.getByText('Answer 1: expected 5000000000, got 0.')).toBeVisible();
  await evidence.getByText('Execution timeline').click();
  await expect(evidence.getByText('HTTP 200 · ollama/test')).toBeVisible();
  await evidence.getByRole('button', { name: 'Close trial evidence' }).click();
  await expect(verdict).toBeFocused();
  await expect(evidence).toHaveCount(0);
});

test('separates relay cap rejections from forwarded gateway attempts', async ({ page }) => {
  const run = trial('opencode', 'distance-width', 1, 'failed', 120);
  run.outputTokens = 30;
  const receipt = { status: 200, injected: false, model: 'test', provider: 'ollama', requestId: 'fixture', input: 20, output: 5, costUsd: null };
  run.receipts = [
    ...Array.from({ length: 6 }, () => ({ ...receipt })),
    ...Array.from({ length: 6 }, () => ({ status: 429, injected: false, model: null, provider: null, requestId: null,
      input: 0, output: 0, costUsd: 0, relayRejection: 'model-call-limit' as const })),
  ];
  await page.route('**/api/track-d', route => route.fulfill({ json: { liveConfigured: true, sessions: [{ ...session,
    request: { ...session.request, agents: ['opencode'], tasks: ['distance-width'], repeats: 1 }, runs: [run] }] } }));
  await page.goto('/#track-d');
  await expect(page.getByText('6 median gateway attempts')).toBeVisible();
  await page.getByRole('button', { name: 'OpenCode CLI, Long-distance overflow, run 1, failed' }).click();
  const evidence = page.getByRole('article', { name: 'OpenCode CLI' });
  await expect(evidence.getByText('The shared model-call budget was reached. Final grading used the last source artifact.')).toBeVisible();
  await evidence.getByText('Trial metrics', { exact: true }).click();
  await expect(evidence.locator('.track-trial-metrics > div').filter({ hasText: 'Gateway attempts' })).toContainText('6');
  await expect(evidence.locator('.track-trial-metrics > div').filter({ hasText: 'Relay cap rejections' })).toContainText('6');
  await evidence.getByText('Bifrost receipts', { exact: true }).click();
  await expect(evidence.getByText('Not forwarded to Bifrost', { exact: false })).toHaveCount(6);
});
