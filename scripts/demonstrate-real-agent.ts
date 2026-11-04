import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  loadTaskSpec,
  runBenchmarkOnTask,
  OpenCodeCliAdapter,
  CodexCliAdapter,
} from '../implementations/bifrost-02/src/index';

async function main() {
  console.log('=== ProofBench Bifrost #02: Live Agent Demonstration ===\n');

  const evidenceDir = path.resolve(process.cwd(), '.local/data');
  await fs.mkdir(evidenceDir, { recursive: true });

  // 1. Run OpenCode CLI on Task 1
  console.log('1. Dispatching OpenCode CLI on Task 1: Fix off-by-one bounds bug...');
  const task1 = await loadTaskSpec('task-1-fix-failing-func');
  const opencodeAdapter = new OpenCodeCliAdapter({
    model: 'opencode/deepseek-v4.1-flash-free',
    timeoutMs: 180_000,
  });

  const startTime = Date.now();
  let opencodeResult;
  try {
    opencodeResult = await runBenchmarkOnTask({
      task: task1,
      adapter: opencodeAdapter,
      seed: 101,
      keepWorkspace: false,
    });
    console.log(`OpenCode run completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log(`Run status: ${opencodeResult.run.status}`);
    console.log(`Acceptance status: ${opencodeResult.run.acceptance.status}`);
    console.log(`Input tokens: ${JSON.stringify(opencodeResult.run.usage.inputTokens)}`);
    console.log(`Output tokens: ${JSON.stringify(opencodeResult.run.usage.outputTokens)}`);
    console.log(`Events recorded: ${opencodeResult.trace.events.length}`);
  } catch (err) {
    console.warn(`OpenCode run encountered an error: ${(err as Error).message}`);
  }

  // 2. Dispatch Codex CLI to capture honest trace
  console.log('\n2. Dispatching Codex CLI to inspect honest local execution...');
  const codexAdapter = new CodexCliAdapter({
    timeoutMs: 30_000,
  });

  let codexResult;
  try {
    codexResult = await runBenchmarkOnTask({
      task: task1,
      adapter: codexAdapter,
      seed: 102,
      keepWorkspace: false,
    });
    console.log(`Codex run status: ${codexResult.run.status}`);
    console.log(`Codex exit code: ${codexResult.outcome.exitCode}`);
    console.log(`Codex events recorded: ${codexResult.trace.events.length}`);
    console.log(`Codex token reporting: ${JSON.stringify(codexResult.run.usage.inputTokens)}`);
  } catch (err) {
    console.warn(`Codex run encountered error: ${(err as Error).message}`);
  }

  // 3. Save demonstration evidence
  const evidenceReport = {
    timestamp: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    },
    opencode: opencodeResult
      ? {
          run: opencodeResult.run,
          trace: opencodeResult.trace,
          report: opencodeResult.report,
          outcome: opencodeResult.outcome,
        }
      : null,
    codex: codexResult
      ? {
          run: codexResult.run,
          trace: codexResult.trace,
          report: codexResult.report,
          outcome: codexResult.outcome,
        }
      : null,
  };

  const evidencePath = path.join(evidenceDir, 'real-agent-evidence.json');
  await fs.writeFile(evidencePath, JSON.stringify(evidenceReport, null, 2), 'utf8');
  console.log(`\nEvidence written to ${evidencePath}`);
}

main().catch((err) => {
  console.error('Demonstration failed:', err);
  process.exit(1);
});
