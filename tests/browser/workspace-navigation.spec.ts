import { expect, test } from '@playwright/test';

test('keeps workspaces separate and preserves a verifier draft across navigation', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Workspace', exact: true });
  await expect(nav.getByRole('link')).toHaveCount(6);
  await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#track-d, #run-ledger, #verification-input')).toHaveCount(0);

  await nav.getByRole('link', { name: 'Benchmarks' }).click();
  await expect(page).toHaveURL(/\/benchmarks$/);
  await expect(page.getByRole('heading', { name: 'Graph Repair' })).toBeVisible();
  await expect(page.locator('#execution-map, #controlled-benchmark')).toHaveCount(0);
  await page.getByRole('link', { name: 'Model routing' }).click();
  await expect(page.getByRole('heading', { name: 'Model routing' })).toBeVisible();
  await expect(page.locator('#track-d')).toHaveCount(0);

  await nav.getByRole('link', { name: 'Verifier' }).click();
  const answer = page.getByRole('textbox', { name: /paste an answer|answer text/i });
  await answer.fill('A draft stays here while I browse.');
  await nav.getByRole('link', { name: 'Guide' }).click();
  await expect(page.getByRole('heading', { name: 'Local API examples' })).toBeVisible();
  await expect(answer).not.toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/verify$/);
  await expect(nav.getByRole('link', { name: 'Verifier' })).toHaveAttribute('aria-current', 'page');
  await expect(answer).toHaveValue('A draft stays here while I browse.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
