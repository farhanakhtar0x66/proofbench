import {test,expect} from '@playwright/test';
test('runs an offline fixture, inspects evidence, verifies stale answer',async({page})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:'Trust the evidence.'})).toBeVisible();
 await expect(page.getByRole('button',{name:'+ Run fixture'})).toBeEnabled();
 await page.getByRole('button',{name:'+ Run fixture'}).click();
 await expect(page.getByText('Exact output comparison: 6')).toBeVisible();
 await page.getByRole('button',{name:'Compare runs'}).click();
 await expect(page.getByRole('heading',{name:'Comparison',exact:true})).toBeVisible();
 await page.getByRole('button',{name:/Freshness verifier/}).click();
 await page.getByLabel('Verification flow').selectOption('fixture');
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
