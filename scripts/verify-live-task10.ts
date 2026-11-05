import * as path from 'node:path';
import {
  AdaptiveExecutionEngine,
  createWorkspaceApprovalHandler,
  BifrostClient,
  TaskWorkspace,
  getCodingTasksDir,
} from '../implementations/bifrost-01/src/index';
import { TaskSpec } from '../packages/contracts/src/index';

try {
  process.loadEnvFile?.();
} catch {
  // Continue if loadEnvFile is not supported
}

const GATEWAY_URL = process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089';
const VIRTUAL_KEY = process.env.BIFROST_VIRTUAL_KEY;
const SMALL_MODEL_ID = process.env.BIFROST_DEFAULT_MODEL ?? 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M';
const STRONGER_MODEL_ID = process.env.BIFROST_RECOVERY_MODEL ?? 'gguf/Qwen3.5-9B-GGUF:Q4_K_M';
const tasksDir = getCodingTasksDir();

async function main() {
  console.log('='.repeat(80));
  console.log('LIVE BIFROST-BACKED ACCEPTANCE TEST: HELD-OUT TASK 10');
  console.log('Task: task-10-sensor-fusion-aggregator (unfamiliar symbols & files)');
  console.log('='.repeat(80));

  const liveClient = new BifrostClient({
    mode: 'live',
    gatewayUrl: GATEWAY_URL,
    virtualKey: VIRTUAL_KEY,
  });

  const task10Path = path.join(tasksDir, 'task-10-sensor-fusion-aggregator', 'task.json');
  const task10Spec = TaskSpec.parse(JSON.parse(await (await import('node:fs/promises')).readFile(task10Path, 'utf8')));

  const ws10 = await TaskWorkspace.create(task10Spec.id);
  const engine10 = new AdaptiveExecutionEngine({
    bifrostClient: liveClient,
    smallModel: SMALL_MODEL_ID,
    strongerModel: STRONGER_MODEL_ID,
    approvalHandler: createWorkspaceApprovalHandler(),
    maxTurns: 5,
  });

  const res10 = await engine10.runTask(task10Spec, { workspacePath: ws10.workspacePath });

  console.log(`[Task 10] Result Status:    ${res10.run.status}`);
  console.log(`[Task 10] Acceptance:       ${res10.run.acceptance.status}`);
  console.log(`[Task 10] Turns Executed:   ${res10.controllerState.turnCount}`);
  console.log(`[Task 10] Avoided Requests: ${res10.avoidedModelRequests}`);
  console.log(`[Task 10] Prompt Tokens:    ${JSON.stringify(res10.run.usage.inputTokens)}`);
  console.log(`[Task 10] Compl Tokens:     ${JSON.stringify(res10.run.usage.outputTokens)}`);

  for (const ev of res10.trace.events) {
    if (ev.type === 'output' || ev.type === 'check' || ev.type === 'error') {
      console.log(`  [${ev.type}] ${ev.message}`);
    }
  }

  if (res10.run.acceptance.status === 'passed') {
    console.log('\n✅ Task 10 successfully resolved live through Bifrost!');
  } else {
    console.log(`\nTask 10 ended with acceptance: ${res10.run.acceptance.status}`);
  }
}

main().catch((err) => {
  console.error('Task 10 live test failed:', err);
  process.exit(1);
});
