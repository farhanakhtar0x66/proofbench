import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fork, ChildProcess } from 'node:child_process';
import { TaskWorkspace } from '../implementations/bifrost-01/src/runtime/workspace';
import { DurableStore } from '../implementations/bifrost-01/src/persistence/durable-store';

const WORKER_SCRIPT = path.resolve(__dirname, '../implementations/bifrost-01/src/runtime/controller-worker.ts');

function runChildWorker(args: string[]): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null; result?: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    let capturedResult: Record<string, unknown> | undefined;

    const child = fork(WORKER_SCRIPT, args, {
      execArgv: ['--import', 'tsx'],
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    child.on('message', (msg: Record<string, unknown>) => {
      if (msg.type === 'result') {
        capturedResult = msg.data as Record<string, unknown>;
      }
    });

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      if (text.includes('[WORKER_RESULT]')) {
        try {
          const jsonStr = text.slice(text.indexOf('[WORKER_RESULT]') + 15).trim();
          capturedResult = JSON.parse(jsonStr);
        } catch (_err) {
          void _err;
        }
      }
    });

    child.on('error', reject);

    child.on('exit', (exitCode, signal) => {
      resolve({ exitCode, signal, result: capturedResult });
    });
  });
}

describe('ProofBench — Milestone 1.5: True OS Child-Process Restart & Crash Resilience', () => {
  it('recovers from planned suspension (SIGTERM/maxTurns clean exit) across separate OS child processes', async () => {
    const ws = await TaskWorkspace.create('task-1-fix-failing-func');
    const workspacePath = ws.workspacePath;

    // Process A: Runs exactly 1 turn and exits cleanly (planned suspension)
    const procA = await runChildWorker([
      `--workspace=${workspacePath}`,
      '--task=task-1-fix-failing-func',
      '--maxTurns=1',
      '--mock=true',
      '--failTurn1=true',
    ]);

    expect(procA.exitCode).toBe(0);
    expect(procA.result).toBeDefined();
    expect(procA.result?.turns).toBe(1);
    expect(procA.result?.acceptance).toBe('failed'); // Not done in 1 turn

    // Verify durable state on disk
    const store = new DurableStore(workspacePath);
    await store.initialize();
    const latestCp = await store.getLatestCheckpoint();
    expect(latestCp).not.toBeNull();
    expect(latestCp?.stateSnapshot.turnCount).toBe(1);

    const contextMd = await fs.readFile(path.join(workspacePath, 'CONTEXT.MD'), 'utf8');
    expect(contextMd).toContain('# Project Context');

    // Process B: Independent OS child process resumes from the disk checkpoint
    const procB = await runChildWorker([
      `--workspace=${workspacePath}`,
      '--task=task-1-fix-failing-func',
      '--maxTurns=3',
      '--mock=true',
    ]);

    expect(procB.exitCode).toBe(0);
    expect(procB.result).toBeDefined();
    expect(procB.result?.resumed).toBe(true);
    expect(procB.result?.turns).toBe(2); // Turn 1 was NOT replayed!
    expect(procB.result?.acceptance).toBe('passed');
    expect(procB.result?.status).toBe('completed');
  }, 30000);

  it('recovers from abrupt process kill (SIGKILL) across separate OS child processes', async () => {
    const ws = await TaskWorkspace.create('task-1-fix-failing-func');
    const workspacePath = ws.workspacePath;

    // Spawn Process C and forcefully SIGKILL it
    const childC: ChildProcess = fork(WORKER_SCRIPT, [
      `--workspace=${workspacePath}`,
      '--task=task-1-fix-failing-func',
      '--maxTurns=3',
      '--mock=true',
    ], {
      execArgv: ['--import', 'tsx'],
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    // Wait until child writes its admission/turn checkpoint, then SIGKILL
    const store = new DurableStore(workspacePath);
    await store.initialize();

    let checkpointFound = false;
    for (let i = 0; i < 50; i++) {
      const cp = await store.getLatestCheckpoint();
      if (cp) {
        checkpointFound = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(checkpointFound).toBe(true);

    // Abrupt termination: SIGKILL
    const killPromise = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      childC.on('exit', (exitCode, signal) => resolve({ exitCode, signal }));
    });
    childC.kill('SIGKILL');
    const procCExit = await killPromise;

    expect(procCExit.signal).toBe('SIGKILL');

    // Process D: Independent OS child process resumes from the committed checkpoint on disk
    const procD = await runChildWorker([
      `--workspace=${workspacePath}`,
      '--task=task-1-fix-failing-func',
      '--maxTurns=3',
      '--mock=true',
    ]);

    expect(procD.exitCode).toBe(0);
    expect(procD.result).toBeDefined();
    expect(procD.result?.resumed).toBe(true);
    expect(procD.result?.acceptance).toBe('passed');
    expect(procD.result?.status).toBe('completed');
  }, 30000);
});
