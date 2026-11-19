import { spawn } from 'node:child_process';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface SandboxResult {
  passed: number;
  failed: number;
  ok: boolean;
  timedOut: boolean;
  output: string;
  durationMs: number;
}

/**
 * Runs a node:test file under Node's permission model: it may read only its
 * own folder, and has no network, child processes, workers or file writes.
 */
export async function runSandboxedTests(requestedDir: string, files: Record<string, string>, testFile: string, timeoutMs = 15_000): Promise<SandboxResult> {
  await mkdir(requestedDir, { recursive: true });
  // Grant the real path: on macOS /tmp and /var are symlinks, and the module
  // loader stats every path segment, which the sandbox would (rightly) deny.
  const dir = await realpath(requestedDir);
  for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content, 'utf8');
  const started = Date.now();
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['--permission', `--allow-fs-read=${dir}`, '--test-reporter=tap', join(dir, testFile)], {
      cwd: dir,
      env: { PATH: process.env.PATH ?? '', NODE_OPTIONS: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const append = (chunk: Buffer) => {
      if (output.length < 200_000) output += chunk.toString('utf8');
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('close', code => {
      clearTimeout(timer);
      const passed = Number(/# pass (\d+)/.exec(output)?.[1] ?? 0);
      const failedMatch = /# fail (\d+)/.exec(output);
      // No TAP summary means the file did not even load (syntax error, crash): count it as one failure.
      const failed = failedMatch ? Number(failedMatch[1]) : timedOut || code !== 0 ? 1 : 0;
      resolve({
        passed,
        failed: timedOut ? Math.max(failed, 1) : failed,
        ok: !timedOut && code === 0 && failed === 0 && passed > 0,
        timedOut,
        output: timedOut ? `${output}\n# timed out after ${timeoutMs} ms` : output,
        durationMs: Date.now() - started,
      });
    });
  });
}

/** Keeps the parts of a TAP log a developer would paste back to an agent. */
export function summarizeTestOutput(output: string, maxLines = 40): string {
  const lines = output.split('\n');
  const keep: string[] = [];
  let inFailure = false;
  for (const line of lines) {
    if (/^\s*not ok/.test(line)) inFailure = true;
    else if (/^\s*ok \d+/.test(line)) inFailure = false;
    if (inFailure || /^# (tests|pass|fail)/.test(line) || /Error|error:/.test(line)) {
      const stackFrame = /\((?:node:|\/)[^)]*:\d+:\d+\)\s*$/.test(line) || /^\s+async \w/.test(line);
      if (!stackFrame && line.trim() && !/^\s*(at |stack:|\.\.\.|---|duration_ms|type:|location:|failureType:|code:|# Subtest)/.test(line)) keep.push(line);
    }
  }
  const trimmed = (keep.length ? keep : lines).slice(0, maxLines);
  return trimmed.join('\n');
}
