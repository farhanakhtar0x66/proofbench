import {test,expect} from '@playwright/test';
test('runs an offline fixture, inspects evidence, verifies stale answer',async({page})=>{
 await page.goto('/execution');await expect(page.getByRole('heading',{name:'Execution lab'})).toBeVisible();
 await expect(page.getByRole('button',{name:'+ Run fixture'})).toBeEnabled();
 await page.getByRole('button',{name:'+ Run fixture'}).click();
 await expect(page.getByText('Exact output comparison: 6')).toBeVisible();
 await page.getByRole('link',{name:'Verifier',exact:true}).click();
 await page.getByLabel('Verification flow').selectOption('fixture');
 await page.getByRole('button',{name:'Verify answer →'}).click();
 await expect(page.getByText('contradicted',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:/Offline reference: python2-eol/})).toHaveAttribute('href','https://www.python.org/doc/sunset-python-2/');
 await page.screenshot({path:`.local/screenshots/dashboard-${test.info().project.name}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('shows a recoverable API error on intercepted HTTP 503',async({page})=>{
 await page.route('**/api/capabilities',r=>r.fulfill({status:503,body:'{}'}));await page.goto('/execution');
 await expect(page.getByRole('alert')).toContainText('503');
 await expect(page.getByRole('button',{name:'Retry connection'})).toBeVisible();
});
test('discovers stored runs, inspects truthful Task 9 escalation, and displays controlled benchmark',async({page})=>{
 await page.goto('/execution/runs');
 await expect(page.getByRole('heading',{name:'Run ledger'})).toBeVisible();
 // Verify stored runs are visible in the ledger
 await expect(page.getByText('Multi-Module Sensor Fusion & Telemetry Aggregation Service')).toBeVisible();
 await expect(page.getByText('Multi-Module Bidirectional Event Pipeline Service')).toBeVisible();
 await expect(page.getByText('Zero-Token Deterministic Mechanical Repair')).toBeVisible();

 // Click to inspect Task 9
 await page.getByRole('button',{name:/Multi-Module Bidirectional Event Pipeline Service/}).click();
 await expect(page).toHaveURL(/\/execution#run-inspector$/);
 // Verify truthful trace: contains escalation, does NOT contain fake downward delegation
 await expect(page.getByText(/Tier transition event: SMALL_LLM -> STRONGER_LLM/)).toBeVisible();
 await expect(page.getByText('STRONGER_LLM -> SMALL_LLM (Delegation)')).not.toBeVisible();

 // Open comparison and verify controlled benchmark numbers
 await page.getByRole('navigation',{name:'Workspace',exact:true}).getByRole('link',{name:'Benchmarks'}).click();
 await page.getByRole('link',{name:'Model routing',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Comparison',exact:true})).toBeVisible();
 // The escalation ladder above repeats these totals, so check the table itself.
 const comparison=page.locator('#comparison');
 await expect(comparison.getByText('7,766 tokens')).toBeVisible();
 await expect(comparison.getByText('4,461 tokens')).toBeVisible();
 await expect(comparison.getByText('6,215 tokens')).toBeVisible();
 await expect(comparison.getByText('2,500 tokens')).toBeVisible();
 await expect(comparison.getByText('-3,305 tokens, -42.6%')).toBeVisible();

 // Verify reload persistence
 await page.reload();
 await expect(page.getByRole('heading',{name:'Model routing',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Execution',exact:true}).click();
 await page.getByRole('link',{name:'Run ledger',exact:true}).click();
 await expect(page.getByText('Multi-Module Sensor Fusion & Telemetry Aggregation Service')).toBeVisible();
 await expect(page.getByText('Multi-Module Bidirectional Event Pipeline Service')).toBeVisible();
 await expect(page.getByText('Zero-Token Deterministic Mechanical Repair')).toBeVisible();
});

test('handles active job lifecycle, stop/resume monitoring, and reload recovery', async ({ page }) => {
 await page.goto('/execution');
 await expect(page.getByRole('heading', { name: 'Execution lab' })).toBeVisible();

 await expect(page.getByRole('heading', { name: 'Execution map' })).toBeVisible();
 await page.evaluate(() => {
  localStorage.setItem('proofbench_active_job_id', 'test-job-recovery-1');
 });
 await page.route('**/api/jobs/test-job-recovery-1', (route) => {
  route.fulfill({
   status: 200,
   contentType: 'application/json',
   body: JSON.stringify({
    version: '1',
    id: 'test-job-recovery-1',
    status: 'running',
    task: {
     version: '1',
     id: 'task-1-fix-failing-func',
     title: 'Fix bounds bug',
     prompt: 'Fix bounds',
     acceptance: ['test passes'],
    },
    agentId: 'bifrost-01',
    runId: 'run-recovered-1',
    progress: 'Executing Turn 2 in workspace…',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
   }),
  });
 });

 await page.reload();
 await expect(page.getByText('Executing Turn 2 in workspace…')).toBeVisible();
 await expect(page.getByRole('button', { name: 'Stop monitoring' })).toBeVisible();

 // User clicks stop monitoring
 await page.getByRole('button', { name: 'Stop monitoring' }).click();
 await expect(page.getByRole('button', { name: 'Resume monitoring' })).toBeVisible();
});

test('handles server restart during in-flight job honestly', async ({ page }) => {
 await page.goto('/execution');
 await expect(page.getByRole('heading', { name: 'Execution map' })).toBeVisible();
 await page.evaluate(() => {
  localStorage.setItem('proofbench_active_job_id', 'stale-restarted-job');
 });
 await page.route('**/api/jobs/stale-restarted-job', (route) => {
  route.fulfill({
   status: 200,
   contentType: 'application/json',
   body: JSON.stringify({
    version: '1',
    id: 'stale-restarted-job',
    status: 'failed',
    task: {
     version: '1',
     id: 'task-1-fix-failing-func',
     title: 'Fix bounds bug',
     prompt: 'Fix bounds',
     acceptance: ['test passes'],
    },
    agentId: 'bifrost-01',
    error: 'Interrupted by server restart; computation did not survive process restart.',
    progress: 'Execution interrupted: server restarted while job was in-flight.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
   }),
  });
 });

 await page.reload();
 await expect(page.getByRole('alert')).toContainText('Interrupted by server restart');
});
