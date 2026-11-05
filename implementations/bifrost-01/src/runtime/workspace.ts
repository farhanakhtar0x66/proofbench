import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
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

export interface AcceptanceTestResult {
  passed: boolean;
  output: string;
  exitCode: number;
  passedCount: number;
  failedCount: number;
  durationMs: number;
  timedOut: boolean;
  outputLimitExceeded: boolean;
  tamperDetected?: boolean;
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

  /**
   * Builds an isolated, scrubbed environment with zero inherited credentials or API keys.
   */
  public static buildScrubbedEnvironment(): Record<string, string> {
    const allowedEnvKeys = new Set([
      'PATH',
      'HOME',
      'USER',
      'SHELL',
      'LANG',
      'TMPDIR',
      'TEMP',
      'TMP',
      'TERM',
      'CARGO_HOME',
      'RUSTUP_HOME',
      'RUST_BACKTRACE',
    ]);

    const scrubbedEnv: Record<string, string> = {
      PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin',
      HOME: process.env.HOME ?? '/tmp',
      USER: process.env.USER ?? 'agent',
      SHELL: process.env.SHELL ?? '/bin/sh',
      LANG: process.env.LANG ?? 'en_US.UTF-8',
      TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
      TERM: 'dumb',
      RUST_BACKTRACE: '1',
    };

    if (process.env.CARGO_HOME) scrubbedEnv.CARGO_HOME = process.env.CARGO_HOME;
    if (process.env.RUSTUP_HOME) scrubbedEnv.RUSTUP_HOME = process.env.RUSTUP_HOME;

    // Defense-in-depth: assert no credential, token, key, or secret leaks through
    const forbiddenPatterns = [
      /KEY/i,
      /TOKEN/i,
      /SECRET/i,
      /AUTH/i,
      /PASS/i,
      /CREDENTIAL/i,
      /BIFROST/i,
      /TAVILY/i,
      /OPENAI/i,
      /ANTHROPIC/i,
      /AWS/i,
      /GITHUB/i,
      /GH_/i,
      /PRIVATE/i,
      /API/i,
      /BEARER/i,
    ];

    for (const key of Object.keys(scrubbedEnv)) {
      if (!allowedEnvKeys.has(key) || forbiddenPatterns.some((pattern) => pattern.test(key))) {
        delete scrubbedEnv[key];
      }
    }

    return scrubbedEnv;
  }

  async runCommand(
    command: string,
    args: string[] = [],
    timeoutMs = 30_000,
    maxOutputBytes = 1024 * 1024
  ): Promise<CommandExecutionResult> {
    const startTime = performance.now();

    // Verify workspace directory boundary
    const resolvedPath = path.resolve(this.workspacePath);
    if (!resolvedPath || resolvedPath === '/' || resolvedPath === os.homedir()) {
      return {
        exitCode: 126,
        stdout: '',
        stderr: `Security rejection: Workspace path '${this.workspacePath}' is not an isolated workspace directory.`,
        durationMs: performance.now() - startTime,
        timedOut: false,
        cancelled: false,
        outputLimitExceeded: false,
        error: 'Security rejection: invalid workspace root',
      };
    }

    // Environment scrubbing (credential isolation)
    const scrubbedEnv = TaskWorkspace.buildScrubbedEnvironment();

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

      child.on('error', (err) => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        resolve({
          exitCode: 1,
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: (err as Error).message,
          durationMs: performance.now() - startTime,
          timedOut,
          cancelled,
          outputLimitExceeded,
          error: (err as Error).message,
        });
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

  async runAcceptanceTests(timeoutMs = 30_000): Promise<AcceptanceTestResult> {
    // 1. Snapshot test files to detect any unauthorized mutation during testing
    const testDir = path.join(this.workspacePath, 'tests');
    const testSnapshots = new Map<string, string>();
    try {
      const files = await fs.readdir(testDir);
      for (const f of files) {
        if (f.endsWith('.rs')) {
          const content = await fs.readFile(path.join(testDir, f), 'utf8');
          testSnapshots.set(f, crypto.createHash('sha256').update(content).digest('hex'));
        }
      }
    } catch {
      // No tests directory or not readable
    }

    // 2. Execute cargo test with explicit binary and argument array under isolated scrubbed environment
    const res = await this.runCommand('cargo', ['test'], timeoutMs);
    const combinedOutput = `${res.stdout}\n${res.stderr}`;

    // 3. Post-execution tamper check
    let tamperDetected = false;
    for (const [f, expectedHash] of testSnapshots.entries()) {
      try {
        const currentContent = await fs.readFile(path.join(testDir, f), 'utf8');
        const currentHash = crypto.createHash('sha256').update(currentContent).digest('hex');
        if (currentHash !== expectedHash) {
          tamperDetected = true;
          break;
        }
      } catch {
        tamperDetected = true;
        break;
      }
    }

    if (tamperDetected) {
      return {
        passed: false,
        output: `${combinedOutput}\nSecurity Alert: Unauthorized modification of frozen test harness detected during execution. Acceptance rejected.`,
        exitCode: 126,
        passedCount: 0,
        failedCount: 1,
        durationMs: Math.round(res.durationMs),
        timedOut: false,
        outputLimitExceeded: false,
        tamperDetected: true,
      };
    }

    const passedMatches = (combinedOutput.match(/test [^\s]+ \.\.\. ok/g) || []).length;
    const failedMatches = (combinedOutput.match(/test [^\s]+ \.\.\. FAILED/g) || []).length;
    const passed = res.exitCode === 0 && !res.timedOut && !res.outputLimitExceeded && failedMatches === 0;

    return {
      passed,
      output: combinedOutput,
      exitCode: res.exitCode ?? (res.timedOut ? 124 : 101),
      passedCount: passedMatches,
      failedCount: passed ? 0 : Math.max(1, failedMatches),
      durationMs: Math.round(res.durationMs),
      timedOut: res.timedOut,
      outputLimitExceeded: res.outputLimitExceeded,
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

    // Fail-closed security rejection for symlinks (both file and directory)
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Security rejection: Symbolic link detected at '${srcPath}'. ProofBench strictly prohibits symlinks in workspace templates.`
      );
    }

    // Additional defense-in-depth: check lstat to ensure hard/junction links aren't masking symlinks
    const lstat = await fs.lstat(srcPath);
    if (lstat.isSymbolicLink()) {
      throw new Error(
        `Security rejection: Symbolic link detected at '${srcPath}'. ProofBench strictly prohibits symlinks in workspace templates.`
      );
    }

    if (entry.isDirectory()) {
      await copyRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
