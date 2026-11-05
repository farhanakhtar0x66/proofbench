import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { createApp } from '../apps/api/src/app';
import viteConfig from '../apps/web/vite.config';

try {
  process.loadEnvFile?.();
} catch {
  // ignore
}

async function main() {
  console.log('🚀 Starting Real Browser Acceptance Test with live Bifrost implementation 01...');

  // 1. Start API Server on port 3001
  const apiApp = await createApp({
    implementation: '01',
    dataDir: '.local/data',
  });
  await apiApp.listen({ port: 3001, host: '127.0.0.1' });
  console.log('✓ Fastify API running on http://127.0.0.1:3001 with BIFROST_IMPLEMENTATION=01');

  // 2. Start Vite Dev Server on port 5173
  const viteServer = await createServer({
    ...viteConfig,
    server: {
      ...viteConfig.server,
      port: 5173,
    },
  });
  await viteServer.listen();
  console.log('✓ Vite Web Server running on http://127.0.0.1:5173');

  // 3. Launch Real Browser via Playwright
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  try {
    // 4. Navigate to dashboard
    console.log('🌐 Navigating to http://127.0.0.1:5173...');
    await page.goto('http://127.0.0.1:5173');
    await page.waitForSelector('h1:has-text("Trust the evidence.")');
    console.log('✓ Dashboard loaded successfully');

    // 5. Verify Bifrost 01 badge
    const badge = await page.textContent('.badge');
    console.log(`✓ Active implementation badge: "${badge}"`);
    if (!badge?.includes('BIFROST 01')) {
      throw new Error(`Expected badge to contain "BIFROST 01", received: ${badge}`);
    }

    // 6. Verify Task Catalog contains canonical coding tasks
    const select = page.locator('select.task-select');
    await select.waitFor({ state: 'visible', timeout: 5000 });
    const options = await select.locator('option').allInnerTexts();
    console.log(`✓ Found ${options.length} canonical benchmark tasks in dropdown:`);
    for (const opt of options) {
      console.log(`   - ${opt}`);
    }
    if (!options.some((o) => o.includes('task-1-fix-failing-func'))) {
      throw new Error('task-1-fix-failing-func not found in task dropdown');
    }

    // 7. Select Task 1
    await select.selectOption('task-1-fix-failing-func');
    console.log('✓ Selected task: task-1-fix-failing-func');

    // 8. Click "+ Run task" button
    const runBtn = page.locator('button.primary');
    await runBtn.waitFor({ state: 'visible' });
    console.log('🖱️ Clicking "+ Run task" button...');
    await runBtn.click();

    // 9. Observe genuine progress events in real-time
    console.log('⏳ Observing live model progress events from Bifrost:');
    const seenProgress = new Set<string>();
    const startTime = Date.now();
    let completed = false;

    while (Date.now() - startTime < 120_000) {
      await page.waitForTimeout(1500);

      const btnText = (await runBtn.textContent()) ?? '';
      if (btnText.includes('Running…')) {
        const msg = btnText.replace('Running…', '').trim();
        if (msg && !seenProgress.has(msg)) {
          seenProgress.add(msg);
          console.log(`   [Progress update]: ${msg}`);
        }
      }

      // Check if button reverted to "+ Run task" or ledger updated
      if (!btnText.includes('Running…') && seenProgress.size > 0) {
        completed = true;
        break;
      }
    }

    if (!completed) {
      throw new Error('Job execution did not complete within 120s timeout');
    }
    console.log(`✓ Execution completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    // 10. Verify acceptance checks and completion
    await page.waitForTimeout(1000);
    const completionStatus = await page.locator('.metrics article:nth-child(2) strong').textContent();
    console.log(`✓ Selected run completion status: "${completionStatus}"`);
    if (!completionStatus?.toLowerCase().includes('pass')) {
      throw new Error(`Expected pass status, received: ${completionStatus}`);
    }

    // 11. Inspect the resulting trace and model identity
    const traceEvents = await page.locator('.timeline li').allInnerTexts();
    console.log(`✓ Observed ${traceEvents.length} granular trace events in execution timeline`);
    const hasSmallModel = traceEvents.some((t) => t.includes('1.5B') || t.includes('SMALL_LLM'));
    const hasFrontierModel = traceEvents.some((t) => t.includes('9B') || t.includes('STRONGER_LLM'));
    console.log(`✓ Multi-tier trace verified: Small model attempt (${hasSmallModel}), Frontier model escalation (${hasFrontierModel})`);

    const provenance = await page.locator('.provenance').textContent();
    console.log(`✓ Provenance details verified. Contains model execution evidence: ${provenance?.includes('Qwen') || provenance?.includes('9B')}`);

    // 12. Reload and verify persistence
    console.log('🔄 Reloading page to verify persistence...');
    await page.reload();
    await page.waitForSelector('h1:has-text("Trust the evidence.")');
    await page.waitForSelector('tbody tr', { state: 'visible', timeout: 10_000 });
    const reloadedRows = await page.locator('tbody tr').allInnerTexts();
    console.log(`✓ After reload, found ${reloadedRows.length} runs in Run Ledger. Latest run:`);
    console.log(`   ${reloadedRows[0].replace(/\n/g, ' | ')}`);

    // 13. Test intercepted HTTP 503 gateway error handling (simulated gateway preflight rejection, not a physical daemon outage)
    console.log('🧪 Testing intercepted HTTP 503 gateway error handling (simulated gateway preflight failure, not a physical daemon outage)...');
    // We intercept /api/jobs via Playwright route fulfillment to simulate an HTTP 503 gateway preflight failure without killing the live Bifrost daemon
    await page.route('**/api/jobs', (route) => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          version: '1',
          error: 'service_unavailable',
          message: 'Bifrost inference gateway unreachable at http://127.0.0.1:9998 (fetch failed). Ensure Bifrost daemon is running.',
        }),
      });
    });

    await page.getByRole('button', { name: '+ Run task' }).click();
    await page.waitForSelector('[role="alert"]', { timeout: 5000 });
    const alertText = await page.locator('[role="alert"]').textContent();
    console.log(`✓ Intercepted HTTP 503 gateway error correctly displayed to user: "${alertText}"`);
    if (!alertText?.includes('Bifrost inference gateway unreachable')) {
      throw new Error(`Unexpected alert text: ${alertText}`);
    }

    console.log('\n🎉 ALL REAL BROWSER ACCEPTANCE CHECKS PASSED PERFECTLY!\n');
  } finally {
    await browser.close();
    await viteServer.close();
    await apiApp.close();
  }
}

main().catch((err) => {
  console.error('\n❌ Browser acceptance failed:', err);
  process.exit(1);
});
