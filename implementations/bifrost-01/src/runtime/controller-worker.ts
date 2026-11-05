import { AdaptiveExecutionEngine } from '../controller/engine';
import { BifrostClient } from '../gateway/client';
import { EmbeddedBifrostGateway } from '../gateway/embedded';
import { createWorkspaceApprovalHandler } from '../governance/approval';
import { TaskSpec } from '../../../../packages/contracts/src/index';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

function parseArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        options[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        options[arg.slice(2)] = args[++i];
      } else {
        options[arg.slice(2)] = 'true';
      }
    }
  }
  return options;
}

async function runWorker() {
  const options = parseArgs();
  const workspacePath = options.workspace;
  const taskId = options.task;
  const maxTurns = options.maxTurns ? parseInt(options.maxTurns, 10) : 1;
  const gatewayUrl = options.gatewayUrl || process.env.BIFROST_GATEWAY_URL || 'http://127.0.0.1:8089';
  const virtualKey = options.virtualKey || process.env.BIFROST_VIRTUAL_KEY;
  const taskSpecPath = options.taskSpec;

  if (!workspacePath) {
    console.error('Error: --workspace is required');
    process.exit(1);
  }

  let taskSpec: TaskSpec;
  if (taskSpecPath) {
    const raw = await fs.readFile(taskSpecPath, 'utf8');
    taskSpec = TaskSpec.parse(JSON.parse(raw));
  } else if (taskId) {
    const candidatePaths = [
      path.resolve(process.cwd(), 'fixtures/coding-tasks', taskId, 'task.json'),
      path.resolve(process.cwd(), 'proofbench/fixtures/coding-tasks', taskId, 'task.json'),
    ];
    let found = '';
    for (const p of candidatePaths) {
      try {
        await fs.access(p);
        found = p;
        break;
      } catch (_err) {
        void _err;
      }
    }
    if (!found) {
      console.error(`Error: Could not locate task.json for task ${taskId}`);
      process.exit(1);
    }
    const raw = await fs.readFile(found, 'utf8');
    taskSpec = TaskSpec.parse(JSON.parse(raw));
  } else {
    console.error('Error: Either --task or --taskSpec is required');
    process.exit(1);
  }

  const isMock = options.mock === 'true';
  let client: BifrostClient;

  if (isMock) {
    const embeddedGateway = new EmbeddedBifrostGateway();
    let callCount = 0;
    embeddedGateway.setCustomHandler(async () => {
      callCount++;
      if (options.failTurn1 === 'true' && callCount === 1) {
        return {
          content: `// File: src/lib.rs\n// Turn 1 partial attempt\n`,
          usage: { prompt_tokens: 150, completion_tokens: 15 },
        };
      }
      return {
        content: `// File: src/lib.rs
<<<<<<< SEARCH
    for i in 0..=(values.len() - window_size + 1) {
=======
    for i in 0..=(values.len() - window_size) {
>>>>>>> REPLACE`,
        usage: { prompt_tokens: 180, completion_tokens: 35 },
      };
    });
    client = new BifrostClient({ embeddedGateway });
  } else {
    client = new BifrostClient({
      mode: 'live',
      gatewayUrl,
      virtualKey,
    });
  }

  const engine = new AdaptiveExecutionEngine({
    bifrostClient: client,
    approvalHandler: createWorkspaceApprovalHandler(),
    maxTurns,
  });

  process.on('SIGTERM', () => {
    console.log('[Worker] Received SIGTERM - graceful suspension requested');
    process.exit(0);
  });

  if (process.send) {
    process.send({ type: 'ready', pid: process.pid, workspacePath });
  }

  try {
    const result = await engine.runTask(taskSpec, { workspacePath });

    const summary = {
      pid: process.pid,
      taskId: taskSpec.id,
      status: result.run.status,
      acceptance: result.run.acceptance.status,
      turns: result.controllerState.turnCount,
      currentTier: result.controllerState.currentTier,
      totalTokens: result.controllerState.totalTokens,
      resumed: result.trace.events.some((e) => e.message.includes('Restored') || e.message.includes('resumed')),
      transitions: result.controllerState.transitions,
      sourceRevision: result.controllerState.sourceRevision,
    };

    if (process.send) {
      process.send({ type: 'result', data: summary });
    }
    console.log(`[WORKER_RESULT] ${JSON.stringify(summary)}`);
    process.exit(0);
  } catch (err: unknown) {
    console.error('[Worker] Execution error:', err);
    if (process.send) {
      process.send({ type: 'error', error: (err as Error).message });
    }
    process.exit(1);
  }
}

runWorker().catch((err) => {
  console.error('[Worker Fatal]', err);
  process.exit(1);
});
