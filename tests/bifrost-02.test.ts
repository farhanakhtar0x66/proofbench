import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {
  listTaskSpecs,
  loadTaskSpec,
  createIsolatedWorkspace,
  cleanupWorkspace,
  runBenchmarkOnTask,
  runBenchmarkSession,
  MockCodingAgentAdapter,
  OpenCodeCliAdapter,
  CodexCliAdapter,
} from '../implementations/bifrost-02/src/index';
import { runBoundedProcess, buildScrubbedEnv } from '../implementations/bifrost-02/src/process-runner';
import { createApp } from '../apps/api/src/app';
import { tmpdir } from 'node:os';

describe('Bifrost #02 Benchmark Engine', () => {
  it('loads all 3 frozen coding tasks with valid contracts', async () => {
    const tasks = await listTaskSpecs();
    expect(tasks.length).toBeGreaterThanOrEqual(3);

    const taskIds = tasks.map((t) => t.id);
    expect(taskIds).toContain('task-1-fix-failing-func');
    expect(taskIds).toContain('task-2-missing-feature');
    expect(taskIds).toContain('task-3-multi-file-regression');

    for (const t of tasks) {
      expect(t.version).toBe('1');
      expect(t.prompt.length).toBeGreaterThan(10);
      expect(t.acceptance.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('creates an isolated workspace outside the repository checkout', async () => {
    const ws = await createIsolatedWorkspace('task-1-fix-failing-func', 'test-agent');
    try {
      expect(ws.clean).toBe(true);
      expect(ws.path).toContain('proofbench-ws-task-1');
      // Must not be within the ProofBench repository
      expect(ws.path).not.toContain(process.cwd());

      // Verify Cargo.toml was copied
      const cargoToml = await fs.readFile(path.join(ws.path, 'Cargo.toml'), 'utf8');
      expect(cargoToml).toContain('task_sliding_window');

      // Verify git was initialized in the temporary workspace
      const gitStat = await fs.stat(path.join(ws.path, '.git'));
      expect(gitStat.isDirectory()).toBe(true);
    } finally {
      await cleanupWorkspace(ws.path);
    }
  });

  it('scrubs sensitive credentials from process environment', () => {
    const origEnv = process.env;
    try {
      process.env.TAVILY_API_KEY = 'secret-tavily';
      process.env.OPENAI_API_KEY = 'secret-openai';
      process.env.CUSTOM_SAFE_PATH = '/safe/bin';

      const cleanEnv = buildScrubbedEnv({ EXTRA_TEST_VAR: 'allowed' });
      expect(cleanEnv).not.toHaveProperty('TAVILY_API_KEY');
      expect(cleanEnv).not.toHaveProperty('OPENAI_API_KEY');
      expect(cleanEnv.EXTRA_TEST_VAR).toBe('allowed');
      expect(cleanEnv.TERM).toBe('dumb');
      expect(cleanEnv).toHaveProperty('PATH');
    } finally {
      process.env = origEnv;
    }
  });

  it('enforces execution timeout and terminates runaway processes', async () => {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'proofbench-timeout-'));
    try {
      const result = await runBoundedProcess({
        command: 'python3',
        args: ['-c', 'import time; time.sleep(10)'],
        cwd: tempDir,
        timeoutMs: 300,
      });

      expect(result.timedOut).toBe(true);
      expect(result.durationMs).toBeLessThan(3000);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('enforces process cancellation via AbortSignal', async () => {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'proofbench-cancel-'));
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 150);

      const result = await runBoundedProcess({
        command: 'python3',
        args: ['-c', 'import time; time.sleep(10)'],
        cwd: tempDir,
        timeoutMs: 5000,
        signal: controller.signal,
      });

      expect(result.cancelled).toBe(true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('enforces bounded output to prevent log exhaustion', async () => {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'proofbench-output-'));
    try {
      const result = await runBoundedProcess({
        command: 'python3',
        args: ['-c', 'print("X" * 100000)'],
        cwd: tempDir,
        maxOutputBytes: 1024,
      });

      expect(result.outputLimitExceeded).toBe(true);
      expect(result.stdout.length).toBeLessThanOrEqual(2048);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('runs a successful benchmark execution with independent verification', async () => {
    const task = await loadTaskSpec('task-1-fix-failing-func');
    const adapter = new MockCodingAgentAdapter({
      behavior: 'solve',
      tokenBehavior: 'known',
      inputTokens: 1200,
      outputTokens: 300,
    });

    const result = await runBenchmarkOnTask({
      task,
      adapter,
      seed: 42,
    });

    expect(result.run.status).toBe('completed');
    expect(result.run.acceptance.status).toBe('passed');
    expect(result.run.reproducibility.seed).toBe(42);
    expect(result.run.usage.inputTokens.status).toBe('known');
    if (result.run.usage.inputTokens.status === 'known') {
      expect(result.run.usage.inputTokens.value).toBe(1200);
    }
    expect(result.report.summary).toContain('PASSED');
    expect(result.trace.events.some((e) => e.type === 'check')).toBe(true);
  });

  it('preserves failure evidence when agent fails acceptance tests', async () => {
    const task = await loadTaskSpec('task-1-fix-failing-func');
    // Agent introduces broken code
    const adapter = new MockCodingAgentAdapter({ behavior: 'fail' });

    const result = await runBenchmarkOnTask({
      task,
      adapter,
    });

    expect(result.run.status).toBe('failed');
    expect(result.run.acceptance.status).toBe('failed');
    expect(result.run.acceptance.checks[0].passed).toBe(false);
    expect(result.report.summary).toContain('FAILED');
  });

  it('preserves timeout evidence truthfully', async () => {
    const task = await loadTaskSpec('task-2-missing-feature');
    const adapter = new MockCodingAgentAdapter({ behavior: 'timeout' });

    const result = await runBenchmarkOnTask({
      task,
      adapter,
    });

    expect(result.run.status).toBe('failed');
    expect(result.outcome.status).toBe('timed_out');
    expect(result.run.acceptance.status).toBe('failed');
  });

  it('truthfully reports missing token telemetry without fabricating zero', async () => {
    const task = await loadTaskSpec('task-2-missing-feature');
    const adapter = new MockCodingAgentAdapter({
      behavior: 'solve',
      tokenBehavior: 'missing',
    });

    const result = await runBenchmarkOnTask({
      task,
      adapter,
    });

    expect(result.run.usage.inputTokens.status).toBe('missing');
    expect(result.run.usage.inputTokens).not.toHaveProperty('value');
    expect(result.run.usage.outputTokens.status).toBe('missing');
  });

  it('runs multi-agent benchmark session and evaluates token comparability', async () => {
    const task = await loadTaskSpec('task-3-multi-file-regression');
    const solverAgent = new MockCodingAgentAdapter({
      id: 'agent-solver',
      name: 'Mock Solver Agent',
      behavior: 'solve',
      tokenBehavior: 'known',
      inputTokens: 2500,
      outputTokens: 500,
    });

    const failingAgent = new MockCodingAgentAdapter({
      id: 'agent-fail',
      name: 'Mock Broken Agent',
      behavior: 'fail',
      tokenBehavior: 'missing',
    });

    const sessionResult = await runBenchmarkSession({
      task,
      adapters: [solverAgent, failingAgent],
    });

    expect(sessionResult.session.status).toBe('completed');
    expect(sessionResult.session.outcomes.length).toBe(2);

    const solverOutcome = sessionResult.session.outcomes.find((o) => o.agentId === 'agent-solver');
    const failOutcome = sessionResult.session.outcomes.find((o) => o.agentId === 'agent-fail');

    expect(solverOutcome?.acceptance.status).toBe('passed');
    expect(failOutcome?.acceptance.status).toBe('failed');

    // Because one agent had missing tokens, comparability must reject ranking
    expect(sessionResult.comparisonReport.comparability.comparableTokens).toBe(false);
    expect(sessionResult.comparisonReport.comparability.tokenScopeNote).toContain('missing or incomparable');
  });

  it('integrates with Fastify API in BIFROST_IMPLEMENTATION=02 mode', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'proofbench-api-02-'));
    try {
      const app = await createApp({ dataDir: dir, implementation: '02' });

      // Check capabilities
      const capsRes = await app.inject('/api/capabilities');
      expect(capsRes.statusCode).toBe(200);
      const caps = capsRes.json();
      expect(caps.implementation).toBe('02');
      expect(caps.capabilities.execute).toBe(true);
      expect(caps.capabilities.benchmarks).toBe(true);

      // Check benchmarks endpoint returns coding task suite
      const benchRes = await app.inject('/api/benchmarks');
      expect(benchRes.statusCode).toBe(200);
      const benchData = benchRes.json();
      expect(benchData.tasks.length).toBeGreaterThanOrEqual(3);

      // Execute a task run via POST /api/runs
      const runRes = await app.inject({
        method: 'POST',
        url: '/api/runs',
        payload: {
          version: '1',
          task: benchData.tasks[0],
          agentId: 'bifrost-02',
          seed: 10,
        },
      });

      expect(runRes.statusCode).toBe(201);
      const runRecord = runRes.json();
      expect(runRecord.version).toBe('1');
      expect(runRecord.reproducibility.seed).toBe(10);

      // Verify trace and report were persisted
      const traceRes = await app.inject(`/api/runs/${runRecord.id}/trace`);
      expect(traceRes.statusCode).toBe(200);
      expect(traceRes.json().events.length).toBeGreaterThan(0);

      const reportRes = await app.inject(`/api/reports/${runRecord.reportId}`);
      expect(reportRes.statusCode).toBe(200);

      await app.close();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('inspects installed CLI adapter descriptors and interfaces without fabrication', () => {
    const opencode = new OpenCodeCliAdapter();
    expect(opencode.descriptor.id).toBe('opencode-cli');
    expect(opencode.descriptor.runtime).toBe('typescript');
    expect(opencode.descriptor.model).toBe('opencode/deepseek-v4.1-flash-free');

    const codex = new CodexCliAdapter();
    expect(codex.descriptor.id).toBe('codex-cli');
    expect(codex.descriptor.runtime).toBe('typescript');
    expect(codex.descriptor.revision).toBe('codex-cli-0.165.0');
  });
});
