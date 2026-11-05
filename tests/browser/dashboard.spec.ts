import {test,expect} from '@playwright/test';
test('runs an offline fixture, inspects evidence, verifies stale answer',async({page})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'Trust the evidence.'})).toBeVisible();
 await expect(page.getByRole('button',{name:'+ Run fixture'})).toBeEnabled();
 await page.getByRole('button',{name:'+ Run fixture'}).click();
 await expect(page.getByText('Exact output comparison: 6')).toBeVisible();
 await page.getByRole('button',{name:'Compare runs'}).click();
 await expect(page.getByRole('heading',{name:'Comparison',exact:true})).toBeVisible();
 await page.getByRole('button',{name:/Freshness verifier/}).click();
 await page.getByRole('button',{name:'Verify answer →'}).click();
 await expect(page.getByText('contradicted',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:/Offline reference: python2-eol/})).toHaveAttribute('href','https://www.python.org/doc/sunset-python-2/');
 await page.screenshot({path:`.local/screenshots/dashboard-${test.info().project.name}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('shows a recoverable API error',async({page})=>{
 await page.route('**/api/capabilities',r=>r.fulfill({status:503,body:'{}'}));await page.goto('/');
 await expect(page.getByRole('alert')).toContainText('503');
 await expect(page.getByRole('button',{name:'Retry connection'})).toBeVisible();
});
test('discovers stored runs, inspects truthful Task 9 escalation, and displays controlled benchmark',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Trust the evidence.'})).toBeVisible();
 // Verify stored runs are visible in the ledger
 await expect(page.getByText('Held-out Sensor Fusion & Telemetry Aggregation Service')).toBeVisible();
 await expect(page.getByText('Multi-Module Bidirectional Event Pipeline Service')).toBeVisible();
 await expect(page.getByText('Zero-Token Deterministic Mechanical Repair')).toBeVisible();

 // Click to inspect Task 9
 await page.getByRole('button',{name:/Multi-Module Bidirectional Event Pipeline Service/}).click();
 await expect(page.getByText('M3A ESCALATION (1.5B ➔ 9B)')).toBeVisible();
 // Verify truthful trace: contains escalation, does NOT contain fake downward delegation
 await expect(page.getByText(/Tier transition event: SMALL_LLM -> STRONGER_LLM/)).toBeVisible();
 await expect(page.getByText('STRONGER_LLM -> SMALL_LLM (Delegation)')).not.toBeVisible();

 // Open comparison and verify controlled benchmark numbers
 await page.getByRole('button',{name:'Compare runs'}).click();
 await expect(page.getByRole('heading',{name:'Comparison',exact:true})).toBeVisible();
 await expect(page.getByText('7,766 tokens')).toBeVisible();
 await expect(page.getByText('4,461 tokens')).toBeVisible();
 await expect(page.getByText('6,215 tokens')).toBeVisible();
 await expect(page.getByText('2,500 tokens')).toBeVisible();
 await expect(page.getByText('-3,305 tokens, -42.5%')).toBeVisible();

 // Verify reload persistence
 await page.reload();
 await expect(page.getByRole('heading',{name:'Trust the evidence.'})).toBeVisible();
 await expect(page.getByText('Held-out Sensor Fusion & Telemetry Aggregation Service')).toBeVisible();
 await expect(page.getByText('Multi-Module Bidirectional Event Pipeline Service')).toBeVisible();
 await expect(page.getByText('Zero-Token Deterministic Mechanical Repair')).toBeVisible();
});
