import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WorkspaceIdentity, TaskSpec } from '../../../packages/contracts/src/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getCodingTasksDir(): string {
  const candidates = [
    path.resolve(__dirname, '../../../fixtures/coding-tasks'),
    path.resolve(process.cwd(), 'fixtures/coding-tasks'),
    path.resolve(process.cwd(), 'proofbench/fixtures/coding-tasks'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export async function loadTaskSpec(taskId: string): Promise<TaskSpec> {
  const tasksDir = getCodingTasksDir();
  const taskJsonPath = path.join(tasksDir, taskId, 'task.json');
  const content = await fs.readFile(taskJsonPath, 'utf8');
  return TaskSpec.parse(JSON.parse(content));
}

export async function listTaskSpecs(): Promise<TaskSpec[]> {
  const tasksDir = getCodingTasksDir();
  const entries = await fs.readdir(tasksDir, { withFileTypes: true });
  const tasks: TaskSpec[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      try {
        const spec = await loadTaskSpec(entry.name);
        tasks.push(spec);
      } catch {
        // Skip non-task directories
      }
    }
  }
  // Sort stably by task id
  tasks.sort((a, b) => a.id.localeCompare(b.id));
  return tasks;
}

export async function createIsolatedWorkspace(taskId: string, agentId: string): Promise<WorkspaceIdentity> {
  const tasksDir = getCodingTasksDir();
  const templateDir = path.join(tasksDir, taskId, 'workspace');

  // Verify template directory exists
  try {
    const stat = await fs.stat(templateDir);
    if (!stat.isDirectory()) {
      throw new Error(`Template path is not a directory: ${templateDir}`);
    }
  } catch (err) {
    throw new Error(`Task template directory not found for ${taskId} at ${templateDir}: ${(err as Error).message}`);
  }

  // Create isolated temp directory
  const uuid = randomUUID();
  const workspaceId = `ws-${uuid.slice(0, 12)}`;
  const tempDir = path.join(os.tmpdir(), `proofbench-ws-${taskId}-${uuid.slice(0, 8)}`);
  await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });

  // Copy template files recursively into isolated workspace
  await copyDirRecursive(templateDir, tempDir);

  // Initialize a fresh local git repository so coding agents that rely on git work seamlessly
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    await execFileAsync('git', ['init'], { cwd: tempDir });
    await execFileAsync('git', ['config', 'user.name', 'ProofBench Agent'], { cwd: tempDir });
    await execFileAsync('git', ['config', 'user.email', 'proofbench@local.invalid'], { cwd: tempDir });
    await execFileAsync('git', ['add', '.'], { cwd: tempDir });
    await execFileAsync('git', ['commit', '-m', 'Initial benchmark task baseline', '--quiet'], { cwd: tempDir });
  } catch {
    // If git isn't available or fails, continue with non-git workspace
  }

  return WorkspaceIdentity.parse({
    version: '1',
    workspaceId,
    path: tempDir,
    taskId,
    agentId,
    clean: true,
    createdAt: new Date().toISOString(),
  });
}

export async function cleanupWorkspace(workspacePath: string): Promise<void> {
  try {
    await fs.rm(workspacePath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === 'target' || entry.name === '.git') {
      continue; // Skip target and git directories
    }
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
