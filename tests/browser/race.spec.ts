import { expect, test } from '@playwright/test';

// Replays the recorded live race shipped in docs/evidence/cascade: no model calls, deterministic result.
test('replays a recorded live race to the scoreboard without horizontal overflow', async ({ page }) => {
  // The big-model lane takes 332 s live, about 42 s at 8×.
  test.setTimeout(120_000);
  await page.goto('/race');
  await expect(page.getByRole('heading', { name: /Same agent\. Same bugs\./ })).toBeVisible();
  await page.locator('.replay-pick select').selectOption('2026-11-19T17-19-32-917Z-852bb4');
  await page.locator('.replay-speed select').selectOption('8');
  await page.getByRole('button', { name: 'Replay recorded race' }).click();
  await expect(page.locator('.lane')).toHaveCount(3);
  await expect(page.locator('.lane-cascade .escalation')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.scoreboard h2')).toContainText('Cascade solved 5/5', { timeout: 60_000 });
  await expect(page.locator('.lane-small .finish-badge')).toContainText('GAVE UP');
  await expect(page.locator('.lane-large.finished')).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.scoreboard h2')).toContainText('sooner');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
