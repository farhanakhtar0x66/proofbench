import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TaskSpec } from '../../../packages/contracts/src/index';
import { task as mockSumTask } from '../../../packages/contracts/src/examples';

export const CANONICAL_CODING_TASK_IDS = [
  'task-1-fix-failing-func',
  'task-2-missing-feature',
  'task-3-multi-file-regression',
  'task-4-version-freshness',
  'task-5-context-filtering',
  'task-6-deterministic-fix',
  'task-7-adaptive-pipeline',
  'task-8-deterministic-unused-var',
  'task-9-bidirectional-event-service',
  'task-10-sensor-fusion-aggregator',
] as const;

export type CanonicalCodingTaskId = (typeof CANONICAL_CODING_TASK_IDS)[number];

const currentDir = dirname(fileURLToPath(import.meta.url));

function findFixturesDir(): string {
  const candidates = [
    resolve(process.cwd(), 'fixtures/coding-tasks'),
    resolve(process.cwd(), 'proofbench/fixtures/coding-tasks'),
    resolve(currentDir, '../../../fixtures/coding-tasks'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

/**
 * Loads and validates the canonical TaskSpec from disk or contracts.
 * Returns null if the task is not a known canonical task or fails schema validation.
 */
export async function loadCanonicalTask(taskId: string): Promise<TaskSpec | null> {
  if (taskId === 'sum-fixture' || taskId === 'task-sum' || taskId === 'sum-v1') {
    return mockSumTask;
  }

  if (!CANONICAL_CODING_TASK_IDS.includes(taskId as CanonicalCodingTaskId)) {
    return null;
  }

  const fixturesDir = findFixturesDir();
  const taskPath = resolve(fixturesDir, taskId, 'task.json');
  try {
    const raw = await readFile(taskPath, 'utf8');
    return TaskSpec.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Lists supported benchmark tasks for the selected adapter implementation.
 */
export async function listCanonicalTasks(implementation: string): Promise<TaskSpec[]> {
  if (implementation === 'mock') {
    return [mockSumTask];
  }
  if (implementation === '01') {
    const tasks: TaskSpec[] = [];
    for (const id of CANONICAL_CODING_TASK_IDS) {
      const t = await loadCanonicalTask(id);
      if (t) tasks.push(t);
    }
    return tasks;
  }
  return [];
}
