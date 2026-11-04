import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

export interface CommandExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  outputLimitExceeded: boolean;
  error?: string;
}

export function getCodingTasksDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'fixtures/coding-tasks'),
    path.resolve(process.cwd(), 'proofbench/fixtures/coding-tasks'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

export class TaskWorkspace {
  public workspaceId: string;
  public workspacePath: string;
  public taskId: string;

  constructor(taskId: string, workspacePath: string, workspaceId: string) {
    this.taskId = taskId;
    this.workspacePath = workspacePath;
    this.workspaceId = workspaceId;
  }

  static async create(taskId: string): Promise<TaskWorkspace> {
    const tasksDir = getCodingTasksDir();
    const templateDir = path.join(tasksDir, taskId, 'workspace');

    if (!existsSync(templateDir)) {
      throw new Error(`Task template directory not found for ${taskId} at ${templateDir}`);
    }

    const uuid = randomUUID();
    const workspaceId = `ws-b1-${uuid.slice(0, 8)}`;
    const workspacePath = path.join(os.tmpdir(), `proofbench-b1-${taskId}-${uuid.slice(0, 8)}`);
    await fs.mkdir(workspacePath, { recursive: true, mode: 0o700 });

    await copyRecursive(templateDir, workspacePath);

    // Initialize clean local Git baseline
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const exec = promisify(execFile);
      await exec('git', ['init'], { cwd: workspacePath });
      await exec('git', ['config', 'user.name', 'ProofBench Agent'], { cwd: workspacePath });
      await exec('git', ['config', 'user.email', 'proofbench@local.invalid'], { cwd: workspacePath });
      await exec('git', ['add', '.'], { cwd: workspacePath });
      await exec('git', ['commit', '-m', 'Initial benchmark baseline', '--quiet'], { cwd: workspacePath });
    } catch {
      // Continue if git is unavailable
    }

    return new TaskWorkspace(taskId, workspacePath, workspaceId);
  }

  async runCommand(
    command: string,
    args: string[] = [],
    timeoutMs = 30_000,
    maxOutputBytes = 1024 * 1024
  ): Promise<CommandExecutionResult> {
    const startTime = performance.now();

    // Environment scrubbing (credential isolation)
    const scrubbedEnv: Record<string, string> = {
      PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin',
      HOME: process.env.HOME ?? '/tmp',
      USER: process.env.USER ?? 'agent',
      SHELL: process.env.SHELL ?? '/bin/sh',
      LANG: process.env.LANG ?? 'en_US.UTF-8',
      TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
      TERM: 'dumb',
    };

    let timedOut = false;
    const cancelled = false;
    let outputLimitExceeded = false;
    let totalBytes = 0;

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    return new Promise<CommandExecutionResult>((resolve) => {
      let child: ReturnType<typeof spawn>;
      let timer: NodeJS.Timeout | null = null;
      let finished = false;

      const killProcessGroup = () => {
        if (!child || child.killed || child.pid === undefined) return;
        try {
          if (process.platform !== 'win32') {
            process.kill(-child.pid, 'SIGKILL');
          } else {
            child.kill('SIGKILL');
          }
        } catch {
          // Process might already be dead
        }
      };

      try {
        child = spawn(command, args, {
          cwd: this.workspacePath,
          env: scrubbedEnv,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        return resolve({
          exitCode: null,
          stdout: '',
          stderr: '',
          durationMs: performance.now() - startTime,
          timedOut: false,
          cancelled: false,
          outputLimitExceeded: false,
          error: (err as Error).message,
        });
      }

      timer = setTimeout(() => {
        timedOut = true;
        killProcessGroup();
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > maxOutputBytes) {
          outputLimitExceeded = true;
          killProcessGroup();
        } else {
          stdoutChunks.push(chunk);
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > maxOutputBytes) {
          outputLimitExceeded = true;
          killProcessGroup();
        } else {
          stderrChunks.push(chunk);
        }
      });

      child.on('close', (code) => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);

        resolve({
          exitCode: code,
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          durationMs: performance.now() - startTime,
          timedOut,
          cancelled,
          outputLimitExceeded,
        });
      });
    });
  }

  async runAcceptanceTests(): Promise<{ passed: boolean; output: string; exitCode: number }> {
    const res = await this.runCommand('cargo', ['test', '--quiet'], 30_000);
    const passed = res.exitCode === 0 && !res.timedOut;
    return {
      passed,
      output: (res.stderr.trim() || res.stdout.trim()).slice(0, 2000),
      exitCode: res.exitCode ?? 1,
    };
  }

  async destroy(): Promise<void> {
    try {
      await fs.rm(this.workspacePath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}

async function copyRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === 'target' || entry.name === '.git') continue;
    if (entry.isDirectory()) {
      await copyRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
