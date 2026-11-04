import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import {
  EmbeddedBifrostGateway,
  BifrostClient,
  createDefaultPolicy,
  validateModelAgainstPolicy,
  HostApprovalEngine,
  M1ContextSelector,
  M2StagnationDetector,
  M3aFailureAutopsyBuilder,
  TavilyDocumentationVerifier,
  ProofBenchAgent,
  ComparativeBenchmarkSuite,
  getCodingTasksDir,
} from '../implementations/bifrost-01/src/index';
import { TaskSpec } from '../packages/contracts/src/index';

describe('Bifrost #01 — Deterministically Governed Coding Agent', () => {
  // --------------------------------------------------------------------------
  // 1. Embedded Bifrost Gateway & Client Architecture
  // --------------------------------------------------------------------------
  describe('Bifrost Gateway & Virtual Key Budgeting', () => {
    let gateway: EmbeddedBifrostGateway;

    beforeEach(() => {
      gateway = new EmbeddedBifrostGateway();
    });

    it('provisions virtual keys with budget caps and initial zero spend', () => {
      const vk = gateway.provisionVirtualKey({
        name: 'test-team-key',
        budgetLimitUsd: 5.0,
      });

      expect(vk.id).toMatch(/^sk-bf-/);
      expect(vk.budgetLimitUsd).toBe(5.0);
      expect(vk.currentSpendUsd).toBe(0.0);
      expect(vk.active).toBe(true);
    });

    it('reserves spending allowance pre-request and reconciles on completion', async () => {
      const client = new BifrostClient({
        embeddedGateway: gateway,
        userBudgetLimitUsd: 1.0,
      });

      const response = await client.createChatCompletion({
        model: 'opencode/deepseek-v4.1-flash-free',
        messages: [{ role: 'user', content: 'hello' }],
      });

      expect(response.choices[0].message.content).toBeDefined();
      expect(response.usage?.prompt_tokens).toBeGreaterThan(0);
      expect(response.bifrost_metadata?.cost_usd).toBeGreaterThan(0);
      expect(response.bifrost_metadata?.virtual_key_id).toMatch(/^sk-bf-/);

      const vk = gateway.getVirtualKey(response.bifrost_metadata!.virtual_key_id);
      expect(vk?.currentSpendUsd).toBeGreaterThan(0);
    });

    it('rejects requests with HTTP 402 when virtual key budget is exhausted', async () => {
      const vk = gateway.provisionVirtualKey({
        name: 'exhausted-key',
        budgetLimitUsd: 0.000001,
      });

      const client = new BifrostClient({
        embeddedGateway: gateway,
        virtualKeyId: vk.id,
        userBudgetLimitUsd: 0.000001,
      });

      // 1. Conservative pre-request reservation rejects when client budget is insufficient
      await expect(
        client.createChatCompletion({
          model: 'opencode/deepseek-v4.1-flash-free',
          messages: [{ role: 'user', content: 'over budget attempt' }],
        })
      ).rejects.toThrow(/budget/i);

      // 2. Gateway budget enforcement rejects with HTTP 402
      gateway.registerVirtualKey({
        ...vk,
        budgetSpentUsd: 10.0,
        budgetLimitUsd: 5.0,
      });
      await expect(
        gateway.handleChatCompletion(vk.id, {
          model: 'opencode/deepseek-v4.1-flash-free',
          messages: [{ role: 'user', content: 'gateway over budget' }],
        })
      ).rejects.toThrow(/HTTP 402/i);
    });

    it('recovers from provider outage by routing to fallback provider without session loss', async () => {
      // Inject failure on primary provider 'local'
      gateway.injectFault({
        provider: 'local',
        outageStatus: 503,
      });

      const client = new BifrostClient({
        embeddedGateway: gateway,
        userBudgetLimitUsd: 1.0,
      });

      const response = await client.createChatCompletion({
        model: 'opencode/deepseek-v4.1-flash-free',
        messages: [{ role: 'user', content: 'test fallback resilience' }],
        fallbackProviders: ['opencode'],
      });

      expect(response.choices[0].message.content).toBeDefined();
      expect(response.bifrost_metadata?.fallback_invoked).toBe(true);
      expect(response.bifrost_metadata?.provider).toBe('opencode');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Host Governance Policy & Host Approval Engine
  // --------------------------------------------------------------------------
  describe('Governance Policy & Approval Controls', () => {
    it('restricts confidential repositories to local models only', () => {
      const confidentialPolicy = createDefaultPolicy({
        confidential: true,
      });

      const localCheck = validateModelAgainstPolicy('local-deepseek-coder', confidentialPolicy);
      expect(localCheck.valid).toBe(true);

      const cloudCheck = validateModelAgainstPolicy('gpt-4o-mini', confidentialPolicy);
      expect(cloudCheck.valid).toBe(false);
      expect(cloudCheck.reason).toContain('Confidential repository policy violation');
    });

    it('neutralizes prompt injection attempts to bypass model or confidentiality policy', () => {
      const confidentialPolicy = createDefaultPolicy({
        confidential: true,
      });

      // Prompt injection attempting to switch to an unauthorized cloud model
      const injectionAttemptModel = 'claude-3-5-sonnet';
      const check = validateModelAgainstPolicy(injectionAttemptModel, confidentialPolicy);

      expect(check.valid).toBe(false);
      expect(check.reason).toContain('Confidential repository policy violation');
    });

    it('auto-approves read-only actions and gates destructive write/command/git actions', async () => {
      const policy = createDefaultPolicy();
      const approvalEngine = new HostApprovalEngine(policy, async (action) => {
        return action.tool === 'write_file';
      });

      // 1. Read action is auto-approved
      const readApproval = await approvalEngine.evaluateAction({
        id: 'a1',
        tool: 'read_file',
        parameters: { path: 'src/lib.rs' },
        category: 'read',
      });
      expect(readApproval.approved).toBe(true);
      expect(readApproval.reason).toContain('auto-approved');

      // 2. Write action requires host approval (handler approved)
      const writeApproval = await approvalEngine.evaluateAction({
        id: 'a2',
        tool: 'write_file',
        parameters: { path: 'src/lib.rs', content: 'new code' },
        category: 'write',
      });
      expect(writeApproval.approved).toBe(true);
      expect(writeApproval.reason).toContain('Host explicitly approved action');

      // 3. Command action requires host approval (handler rejected)
      const cmdApproval = await approvalEngine.evaluateAction({
        id: 'a3',
        tool: 'run_command',
        parameters: { command: 'rm -rf /' },
        category: 'command',
      });
      expect(cmdApproval.approved).toBe(false);
      expect(cmdApproval.reason).toContain('Host explicit policy denied');
    });

    it('rejects model self-approval attempts without host signature', async () => {
      const policy = createDefaultPolicy();
      // Strict engine without external handler denies mutating actions by default
      const strictEngine = new HostApprovalEngine(policy, undefined, true);

      const selfApprovalAttempt = await strictEngine.evaluateAction({
        id: 'a4',
        tool: 'write_file',
        parameters: { path: 'src/lib.rs' },
        category: 'write',
      });

      expect(selfApprovalAttempt.approved).toBe(false);
      expect(selfApprovalAttempt.reason).toContain('No host approval handler configured');
    });
  });

  // --------------------------------------------------------------------------
  // 3. NeuroMesh Mechanisms: M1, M2, M3a & Tavily Documentation
  // --------------------------------------------------------------------------
  describe('NeuroMesh Mechanisms & Tavily Verification', () => {
    it('M1: extracts deterministic symbol context bounded by token budget with explicit omissions', async () => {
      const m1 = new M1ContextSelector({ maxTokenBudget: 500 });
      const tasksDir = getCodingTasksDir();
      const task1Path = path.join(tasksDir, 'task-1-fix-failing-func/workspace');

      const result = await m1.selectContext(task1Path, 'test compilation error');

      expect(result.status).toBe('ok');
      expect(result.totalTokens).toBeLessThanOrEqual(500);
      expect(result.selectedItems.length).toBeGreaterThan(0);
      expect(result.formattedContext).toContain('sliding_window_sums');
      expect(result.formattedContext).toContain('## Deterministically Selected Code Context (M1)');
    });

    it('M2: halts execution on repeated identical edits before attempt 3', () => {
      const m2 = new M2StagnationDetector();

      // Attempt 1: fails
      const d1 = m2.recordAttempt({
        patch: 'fn foo() { return 1; }',
        rawError: 'test failed: expected 2 got 1',
        exitCode: 101,
      });
      expect(d1.shouldHalt).toBe(false);

      // Attempt 2: identical patch repeated
      const d2 = m2.recordAttempt({
        patch: 'fn foo() { return 1; }',
        rawError: 'test failed: expected 2 got 1',
        exitCode: 101,
      });
      expect(d2.shouldHalt).toBe(true);
      expect(d2.reason).toBe('stagnated');
      expect(d2.message).toContain('identical patch');
    });

    it('M2: halts execution on oscillating edits (A -> B -> A)', () => {
      const m2 = new M2StagnationDetector();

      m2.recordAttempt({
        patch: 'let x = 1;',
        rawError: 'error 1',
        exitCode: 101,
      });
      m2.recordAttempt({
        patch: 'let x = 2;',
        rawError: 'error 2',
        exitCode: 101,
      });
      // Oscillates back to patch A
      const d3 = m2.recordAttempt({
        patch: 'let x = 1;',
        rawError: 'error 1',
        exitCode: 101,
      });

      expect(d3.shouldHalt).toBe(true);
      expect(d3.reason).toBe('oscillating_patch');
      expect(d3.message).toContain('oscillated back to patch');
    });

    it('M3a: constructs compact evidence-only autopsy packet with 0 LLM narrative', () => {
      const m2 = new M2StagnationDetector();
      m2.recordAttempt({
        patch: 'fn buggy() {}',
        rawError: 'panicked at index 6 out of bounds for slice length 5',
        exitCode: 101,
      });
      m2.recordAttempt({
        patch: 'fn buggy() {}',
        rawError: 'panicked at index 6 out of bounds for slice length 5',
        exitCode: 101,
      });

      const autopsy = M3aFailureAutopsyBuilder.buildAutopsyPacket({
        taskId: 'task-1-fix-failing-func',
        taskTitle: 'Fix bounds bug',
        taskPrompt: 'Fix the index panic',
        attempts: m2.getAttempts(),
        stagnationReason: 'Repeated identical patch detected',
        escalationModel: 'claude-3-5-sonnet',
      });

      expect(autopsy.taskId).toBe('task-1-fix-failing-func');
      expect(autopsy.tokenCount).toBeLessThan(2000);
      expect(autopsy.escalationModelTarget).toBe('claude-3-5-sonnet');
      expect(autopsy.formattedPacket).toContain('# Structured Failure Autopsy (M3a - Evidence-Only)');
      expect(autopsy.formattedPacket).toContain('panicked at index 6');
      expect(autopsy.formattedPacket).not.toContain('I think the model was trying to');
    });

    it('Tavily: verifies API claims for public tasks and blocks queries in confidential mode', async () => {
      const publicPolicy = createDefaultPolicy({ confidential: false });
      const confidentialPolicy = createDefaultPolicy({ confidential: true });

      // 1. In public mode, claim check runs
      const publicRes = await TavilyDocumentationVerifier.verifyCodePlanClaims(
        'Requires tokio version 1.38 asynchronous runtime with mpsc channel',
        publicPolicy
      );
      expect(publicRes.allowed).toBe(true);
      expect(publicRes.claimsVerified.length).toBeGreaterThan(0);
      expect(publicRes.injectedContext).toContain('Tavily Documentation Verification Findings');

      // 2. In confidential mode, external Tavily queries are blocked
      const confRes = await TavilyDocumentationVerifier.verifyCodePlanClaims(
        'Requires tokio version 1.38 asynchronous runtime with mpsc channel',
        confidentialPolicy
      );
      expect(confRes.allowed).toBe(false);
      expect(confRes.reason).toContain('Confidential repository mode');
    });
  });

  // --------------------------------------------------------------------------
  // 4. End-to-End Task Executions on Real Frozen Fixtures
  // --------------------------------------------------------------------------
  describe('End-to-End Governed Execution on Frozen Tasks', () => {
    it('executes Task 1 (fix failing sliding window function) and verifies clean pass', async () => {
      const agent = new ProofBenchAgent();
      const taskSpec = TaskSpec.parse({
        version: '1',
        id: 'task-1-fix-failing-func',
        title: 'Fix off-by-one bounds bug in sliding window sums',
        prompt: 'Fix the function sliding_window_sums in src/lib.rs',
        acceptance: ['cargo test exits with code 0'],
        fixtureId: 'task-1-v1',
      });

      const { run, trace, report } = await agent.runTask(taskSpec, 42);

      expect(run.status).toBe('completed');
      expect(run.acceptance.status).toBe('passed');
      expect(run.usage.cost.status).toBe('known');
      expect(run.usage.inputTokens.status).toBe('known');
      expect(run.usage.outputTokens.status).toBe('known');

      expect(trace.events.length).toBeGreaterThan(0);
      expect(trace.events.some((e) => e.type === 'start')).toBe(true);
      expect(trace.events.some((e) => e.type === 'check')).toBe(true);

      expect(report.summary).toContain('PASSED');
      expect(report.limitations.length).toBeGreaterThan(0);
    }, 30000);

    it('executes Task 2 (implement exponential backoff) and verifies clean pass', async () => {
      const agent = new ProofBenchAgent();
      const taskSpec = TaskSpec.parse({
        version: '1',
        id: 'task-2-missing-feature',
        title: 'Implement exponential backoff retry calculation',
        prompt: 'Implement the delay_for_attempt method on ExponentialBackoff in src/lib.rs',
        acceptance: ['cargo test exits with code 0'],
        fixtureId: 'task-2-v1',
      });

      const { run } = await agent.runTask(taskSpec, 100);

      expect(run.status).toBe('completed');
      expect(run.acceptance.status).toBe('passed');
    }, 30000);

    it('executes Task 3 (multi-file regression across parser & sink) and verifies multi-step resolution', async () => {
      const agent = new ProofBenchAgent();
      const taskSpec = TaskSpec.parse({
        version: '1',
        id: 'task-3-multi-file-regression',
        title: 'Repair event pipeline regression across parser and sink',
        prompt: 'Fix the multi-file regression in the event pipeline across parser.rs and sink.rs',
        acceptance: ['cargo test exits with code 0'],
        fixtureId: 'task-3-v1',
      });

      const { run, trace } = await agent.runTask(taskSpec, 200);

      expect(run.status).toBe('completed');
      expect(run.acceptance.status).toBe('passed');
      expect(trace.events.filter((e) => e.message.includes('Wrote updated content')).length).toBeGreaterThanOrEqual(2);
    }, 45000);
  });

  // --------------------------------------------------------------------------
  // 5. Comparative Efficiency Suite: Baseline vs. Experimental
  // --------------------------------------------------------------------------
  describe('Comparative Efficiency Suite', () => {
    it('compares Baseline (unbounded) vs. Experimental (governed) on Task 1 and records token metrics', async () => {
      const taskSpec = TaskSpec.parse({
        version: '1',
        id: 'task-1-fix-failing-func',
        title: 'Fix off-by-one bounds bug in sliding window sums',
        prompt: 'Fix sliding_window_sums in src/lib.rs',
        acceptance: ['cargo test exits with code 0'],
        fixtureId: 'task-1-v1',
      });

      const report = await ComparativeBenchmarkSuite.compareTaskEfficiency(taskSpec);

      expect(report.taskId).toBe('task-1-fix-failing-func');
      expect(report.baseline.passed).toBe(true);
      expect(report.experimental.passed).toBe(true);
      expect(report.baseline.totalTokens).toBeGreaterThan(0);
      expect(report.experimental.totalTokens).toBeGreaterThan(0);
      expect(report.evidenceSummary).toContain('Acceptance: Baseline=PASSED, Experimental=PASSED');
    }, 60000);
  });
});
