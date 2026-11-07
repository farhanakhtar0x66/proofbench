import { expect, test } from '@playwright/test';

const session = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-11-07T00:00:00.000Z',
  request: { mode: 'fixture', tasks: ['distance-width'], repeats: 1, fault: 'none' },
  status: 'running',
  model: null,
  comparable: false,
  worker: { kind: 'docker', id: 'test-worker' },
  oracle: 'test-oracle',
  limits: { modelCalls: 6, outputTokensPerCall: 3500, agentSeconds: 150 },
  runs: [],
};

test('shows a missing session link and lets the user choose the available session', async ({ page }) => {
  const missing = '22222222-2222-4222-8222-222222222222';
  await page.route('**/api/track-d', route => route.fulfill({
    json: { liveConfigured: false, sessions: [{ ...session, status: 'completed' }] },
  }));
  await page.route(`**/api/track-d/${missing}`, route => route.fulfill({
    status: 404, json: { message: 'Track D session not found.' },
  }));
  await page.goto(`/?trackSession=${missing}#track-d`);
  const track = page.locator('#track-d');
  await expect(track.getByRole('alert')).toContainText('linked Graph Repair session is missing');
  await expect(track.getByText('0 results')).toHaveCount(0);
  await track.getByRole('combobox', { name: 'Saved sessions' }).selectOption(session.id);
  await expect(track.getByText('0 results')).toBeVisible();
});

test('stops automatically polling a missing active session and allows a manual check', async ({ page }) => {
  let checks = 0;
  await page.route('**/api/track-d', route => route.fulfill({
    json: { liveConfigured: true, activeSessionId: session.id, sessions: [session] },
  }));
  await page.route(`**/api/track-d/${session.id}`, route => {
    checks++;
    return route.fulfill({ status: 404, json: { message: 'Track D session not found.' } });
  });
  await page.goto('/#track-d');
  const track = page.locator('#track-d');
  await expect(track.getByRole('alert')).toContainText('session disappeared');
  await expect(track.getByRole('status')).toContainText('Tracking stopped');
  await expect(track.getByRole('button', { name: 'New benchmark' })).toBeEnabled();
  await track.getByRole('button', { name: 'Check session again' }).click();
  await expect(track.getByRole('alert')).toContainText('session disappeared');
  expect(checks).toBe(2);
});
