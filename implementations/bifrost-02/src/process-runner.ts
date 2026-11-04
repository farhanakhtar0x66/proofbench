import { spawn, type ChildProcess } from 'node:child_process';
import { performance } from 'node:perf_hooks';

export interface ProcessRunnerOptions {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  extraEnv?: Record<string, string>;
  envPolicy?: 'isolated' | 'clean' | 'custom';
  signal?: AbortSignal;
}

export interface ProcessExecutionResult {
  exitCode: number | null;
  signalCode: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  outputLimitExceeded: boolean;
  error?: string;
}

const ALLOWED_ENV_VARS = [
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'LANG',
  'LC_ALL',
  'TMPDIR',
  'TEMP',
  'TMP',
  'TERM',
  'SYSTEMROOT',
  'WINDIR',
];

export function buildScrubbedEnv(extraEnv?: Record<string, string>): Record<string, string> {
  const cleanEnv: Record<string, string> = {};
  for (const key of ALLOWED_ENV_VARS) {
    const val = process.env[key];
    if (val !== undefined) {
      cleanEnv[key] = val;
    }
  }
  // Guarantee a safe TERM for non-interactive CLIs
  cleanEnv.TERM = 'dumb';

  // Merge explicitly provided environment variables
  if (extraEnv) {
    for (const [k, v] of Object.entries(extraEnv)) {
      cleanEnv[k] = v;
    }
  }

  // Ensure known API keys are strictly absent unless explicitly provided in extraEnv
  const sensitiveKeys = [
    'TAVILY_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'CLAUDE_API_KEY',
    'AWS_SECRET_ACCESS_KEY',
    'GITHUB_TOKEN',
  ];
  for (const sensitive of sensitiveKeys) {
    if (!extraEnv || !(sensitive in extraEnv)) {
      delete cleanEnv[sensitive];
    }
  }

  return cleanEnv;
}

export async function runBoundedProcess(options: ProcessRunnerOptions): Promise<ProcessExecutionResult> {
  const {
    command,
    args,
    cwd,
    timeoutMs = 60_000,
    maxOutputBytes = 2 * 1024 * 1024,
    extraEnv,
    signal,
  } = options;

  const env = buildScrubbedEnv(extraEnv);
  const startTime = performance.now();

  let timedOut = false;
  let cancelled = false;
  let outputLimitExceeded = false;
  let totalBytes = 0;

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  return new Promise<ProcessExecutionResult>((resolve) => {
    let child: ChildProcess;
    let timer: NodeJS.Timeout | null = null;
    let killTimer: NodeJS.Timeout | null = null;
    let finished = false;

    const killProcessGroup = (sig: NodeJS.Signals) => {
      if (!child || child.killed || child.pid === undefined) return;
      try {
        if (process.platform !== 'win32') {
          process.kill(-child.pid, sig);
        } else {
          child.kill(sig);
        }
      } catch {
        // Process might have already exited
      }
    };

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
      }
    };

    const onComplete = (exitCode: number | null, signalCode: string | null, error?: string) => {
      if (finished) return;
      finished = true;
      cleanup();

      const durationMs = performance.now() - startTime;
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');

      resolve({
        exitCode,
        signalCode,
        stdout,
        stderr,
        durationMs,
        timedOut,
        cancelled,
        outputLimitExceeded,
        error,
      });
    };

    // Spawn detached process so it runs in its own process group
    try {
      child = spawn(command, args, {
        cwd,
        env,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      return onComplete(null, null, `Spawn failed: ${(err as Error).message}`);
    }

    if (child.pid === undefined) {
      return onComplete(null, null, 'Child process failed to return PID');
    }

    // Set timeout handler
    timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup('SIGTERM');
      killTimer = setTimeout(() => {
        killProcessGroup('SIGKILL');
      }, 1000);
    }, timeoutMs);

    // Set abort handler
    const abortHandler = () => {
      cancelled = true;
      killProcessGroup('SIGTERM');
      killTimer = setTimeout(() => {
        killProcessGroup('SIGKILL');
      }, 1000);
    };

    if (signal) {
      if (signal.aborted) {
        abortHandler();
      } else {
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    }

    // Handle stdout stream with byte bounding
    child.stdout?.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxOutputBytes) {
        outputLimitExceeded = true;
        killProcessGroup('SIGKILL');
      } else {
        stdoutChunks.push(chunk);
      }
    });

    // Handle stderr stream with byte bounding
    child.stderr?.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxOutputBytes) {
        outputLimitExceeded = true;
        killProcessGroup('SIGKILL');
      } else {
        stderrChunks.push(chunk);
      }
    });

    child.on('error', (err) => {
      onComplete(null, null, err.message);
    });

    child.on('close', (code, sig) => {
      onComplete(code, sig);
    });
  });
}
