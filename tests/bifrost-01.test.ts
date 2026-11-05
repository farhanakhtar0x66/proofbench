import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import {
  EmbeddedBifrostGateway,
  BifrostClient,
  createDefaultPolicy,
  validateModelAgainstPolicy,
  isLocalDestination,
  TRUSTED_LOCAL_PROVIDERS,
  KNOWN_CLOUD_PROVIDERS,
  HostApprovalEngine,
  createWorkspaceApprovalHandler,
  createScopedPriorApprovalHandler,
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
        fallbackProviders: ['opencode'],
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
        fallbackProviders: ['opencode'],
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

    it('survives provider outage during agent task execution and emits user fallback notification', async () => {
      gateway.injectFault({
        provider: 'local',
        outageStatus: 503,
      });

      const tasksDir = getCodingTasksDir();
      const taskPath = path.join(tasksDir, 'task-1-fix-failing-func', 'task.json');
      const taskRaw = await fs.readFile(taskPath, 'utf8');
      const task = TaskSpec.parse(JSON.parse(taskRaw));

      const client = new BifrostClient({
        embeddedGateway: gateway,
        userBudgetLimitUsd: 1.0,
        fallbackProviders: ['opencode'],
      });

      const agent = new ProofBenchAgent({
        bifrostClient: client,
        approvalHandler: createScopedPriorApprovalHandler({
          allowedFiles: ['src/lib.rs'],
          maxWritesPerFile: 5,
          maxTotalModifications: 5,
        }),
      });

      const { run, trace } = await agent.runTask(task, Date.now());
      expect(run.status).toBe('completed');
      expect(run.acceptance.status).toBe('passed');

      const fallbackEvents = trace.events.filter(
        (e) => e.type === 'output' && e.message.includes('Bifrost fallback routing triggered')
      );
      expect(fallbackEvents.length).toBeGreaterThan(0);
      expect(fallbackEvents[0].message).toContain('opencode');
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
      expect(selfApprovalAttempt.reason).toContain('without explicit host approval handler');
    });

    it('default-denies shell commands and git mutations even with workspace write approval', async () => {
      const handler = createWorkspaceApprovalHandler();
      const policy = createDefaultPolicy();
      const approvalEngine = new HostApprovalEngine(policy, handler);

      const cmdApproval = await approvalEngine.evaluateAction({
        id: 'act-cmd-1',
        tool: 'run_command',
        parameters: { command: 'cargo build' },
        category: 'command',
      });
      expect(cmdApproval.approved).toBe(false);
      expect(cmdApproval.reason).toContain('Host explicit policy denied');

      const gitApproval = await approvalEngine.evaluateAction({
        id: 'act-git-1',
        tool: 'git_checkout',
        parameters: { branch: 'main' },
        category: 'git',
      });
      expect(gitApproval.approved).toBe(false);
      expect(gitApproval.reason).toContain('Host explicit policy denied');
    });

    it('default-denies writes with path traversal attempts', async () => {
      const handler = createWorkspaceApprovalHandler();
      const policy = createDefaultPolicy();
      const approvalEngine = new HostApprovalEngine(policy, handler);

      const traversalAttempt = await approvalEngine.evaluateAction({
        id: 'act-trav-1',
        tool: 'write_file',
        parameters: { path: '../../etc/passwd', content: 'hacked' },
        category: 'write',
      });
      expect(traversalAttempt.approved).toBe(false);
      expect(traversalAttempt.reason).toContain('Host explicit policy denied');
    });

    it('confidential mode rejects remote destinations even if model is named local', () => {
      const confidentialPolicy = createDefaultPolicy({ confidential: true });

      const remoteDestinationCheck = validateModelAgainstPolicy('local-deepseek-coder', confidentialPolicy, {
        destinationUrl: 'https://api.openai.com/v1',
      });
      expect(remoteDestinationCheck.valid).toBe(false);
      expect(remoteDestinationCheck.reason).toContain('remote or external endpoint');

      expect(isLocalDestination('http://127.0.0.1:8089')).toBe(true);
      expect(isLocalDestination('http://localhost:9931')).toBe(true);
      expect(isLocalDestination('https://api.openai.com')).toBe(false);
    });

    it('confidential mode rejects cloud providers even on local destination', () => {
      expect(TRUSTED_LOCAL_PROVIDERS).toContain('local');
      expect(KNOWN_CLOUD_PROVIDERS).toContain('openai');

      const confidentialPolicy = createDefaultPolicy({ confidential: true });

      const cloudProviderCheck = validateModelAgainstPolicy('local-deepseek-coder', confidentialPolicy, {
        destinationUrl: 'http://127.0.0.1:8089',
        provider: 'openai',
      });
      expect(cloudProviderCheck.valid).toBe(false);
      expect(cloudProviderCheck.reason).toContain('not a trusted local provider');

      const trustedCheck = validateModelAgainstPolicy('local-deepseek-coder', confidentialPolicy, {
        destinationUrl: 'http://127.0.0.1:8089',
        provider: 'local',
      });
      expect(trustedCheck.valid).toBe(true);
    });

    it('BifrostClient with confidential=true blocks remote gateway destinations', async () => {
      const remoteConfidentialClient = new BifrostClient({
        gatewayUrl: 'https://api.bifrost.io',
        confidential: true,
      });

      await expect(
        remoteConfidentialClient.createChatCompletion({
          model: 'local-deepseek-coder',
          messages: [{ role: 'user', content: 'confidential code' }],
        })
      ).rejects.toThrow(/Confidential repository policy violation/i);
    });

    it('scoped prior approval permits whitelisted files and denies unlisted files, enforcing edit quotas', async () => {
      const handler = createScopedPriorApprovalHandler({
        allowedFiles: ['src/lib.rs'],
        maxWritesPerFile: 2,
        maxTotalModifications: 3,
        allowCommands: false,
        allowGit: false,
      });
      const policy = createDefaultPolicy();
      const approvalEngine = new HostApprovalEngine(policy, handler);

      // 1. First edit to whitelisted file: approved
      const edit1 = await approvalEngine.evaluateAction({
        id: 'act-w1',
        tool: 'write_file',
        parameters: { path: 'src/lib.rs', content: 'fn f1() {}' },
        category: 'write',
      });
      expect(edit1.approved).toBe(true);

      // 2. Second edit to whitelisted file: approved
      const edit2 = await approvalEngine.evaluateAction({
        id: 'act-w2',
        tool: 'write_file',
        parameters: { path: 'src/lib.rs', content: 'fn f2() {}' },
        category: 'write',
      });
      expect(edit2.approved).toBe(true);

      // 3. Third edit to same file exceeds per-file quota: denied
      const edit3 = await approvalEngine.evaluateAction({
        id: 'act-w3',
        tool: 'write_file',
        parameters: { path: 'src/lib.rs', content: 'fn f3() {}' },
        category: 'write',
      });
      expect(edit3.approved).toBe(false);

      // 4. Edit to unlisted file: denied
      const unlisted = await approvalEngine.evaluateAction({
        id: 'act-unlisted',
        tool: 'write_file',
        parameters: { path: 'src/other.rs', content: 'fn bad() {}' },
        category: 'write',
      });
      expect(unlisted.approved).toBe(false);

      // 5. Commands and Git mutations are default-denied
      const cmd = await approvalEngine.evaluateAction({
        id: 'act-cmd',
        tool: 'run_command',
        parameters: { command: 'cargo test' },
        category: 'command',
      });
      expect(cmd.approved).toBe(false);
    });

    it('confidential mode rejects wildcard destinations and unauthorized fallback providers', async () => {
      const confidentialPolicy = createDefaultPolicy({ confidential: true });

      // Wildcard destinations (0.0.0.0, *.localhost) must be rejected
      expect(isLocalDestination('http://0.0.0.0:8089')).toBe(false);
      expect(isLocalDestination('http://evil.localhost:8089')).toBe(false);

      const wildcardCheck = validateModelAgainstPolicy('local-deepseek-coder', confidentialPolicy, {
        destinationUrl: 'http://0.0.0.0:8089',
      });
      expect(wildcardCheck.valid).toBe(false);
      expect(wildcardCheck.reason).toContain('remote or external endpoint');

      // Unauthorized external fallback providers must be rejected
      const fallbackCheck = validateModelAgainstPolicy('local-deepseek-coder', confidentialPolicy, {
        destinationUrl: 'http://127.0.0.1:8089',
        provider: 'local',
        fallbackProviders: ['opencode', 'openai-cloud'],
      });
      expect(fallbackCheck.valid).toBe(false);
      expect(fallbackCheck.reason).toContain('unauthorized external fallback provider');

      // BifrostClient in confidential mode enforces local-only fallbacks
      expect(() => {
        new BifrostClient({
          gatewayUrl: 'http://127.0.0.1:8089',
          confidential: true,
          fallbackProviders: ['opencode'],
        });
      }).toThrow(/unauthorized external fallback provider/i);
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

    it('M2: allows attempt 2 when errors or diagnostics change, halting on attempt 3 when no progress', () => {
      const m2 = new M2StagnationDetector();

      // Attempt 1: compiler error A (cannot find type)
      const d1 = m2.recordAttempt({
        patch: 'pub struct Bar;',
        rawError: 'error[E0425]: cannot find type Foo in this scope',
        exitCode: 101,
        passedCount: 0,
        failedCount: 1,
      });
      expect(d1.shouldHalt).toBe(false);

      // Attempt 2: progress made (type found, now type mismatch error B)
      const d2 = m2.recordAttempt({
        patch: 'pub struct Foo; impl Foo { fn new() -> i32 { 1 } }',
        rawError: 'error[E0308]: mismatched types: expected u64, found i32',
        exitCode: 101,
        passedCount: 0,
        failedCount: 1,
      });
      // Should NOT prematurely halt on attempt 2 while errors are actively changing
      expect(d2.shouldHalt).toBe(false);

      // Attempt 3: still failing with 0 test progress across 3 attempts
      const d3 = m2.recordAttempt({
        patch: 'pub struct Foo; impl Foo { fn new() -> u32 { 1 } }',
        rawError: 'error[E0308]: mismatched types: expected u64, found u32',
        exitCode: 101,
        passedCount: 0,
        failedCount: 1,
      });
      expect(d3.shouldHalt).toBe(true);
      expect(d3.reason).toBe('no_progress');
      expect(d3.message).toContain('Three consecutive repair attempts failed with no evidenced test progress');
    });

    it('M3a: enforces maxTokenBudget, compacts oversized diagnostic blocks, and flags budget compaction', () => {
      const m2 = new M2StagnationDetector();
      // Generate a large diagnostic output (60 lines)
      const verboseDiag = Array.from({ length: 60 }, (_, i) => `error[E000${i}]: verbose compiler error details at line ${i}`).join('\n');
      m2.recordAttempt({
        patch: 'let x = 1;',
        rawError: verboseDiag,
        exitCode: 101,
      });

      // 1. Packet with modest budget triggers compaction
      const autopsy = M3aFailureAutopsyBuilder.buildAutopsyPacket({
        taskId: 'task-test',
        taskTitle: 'Test Autopsy',
        taskPrompt: 'Solve task',
        attempts: m2.getAttempts(),
        maxTokenBudget: 400,
      });

      expect(autopsy.budgetCompacted).toBe(true);
      expect(autopsy.formattedPacket).toContain('compacted');
      expect(autopsy.formattedPacket).toMatch(/compacted \d+ (?:lines|characters) of diagnostic output for M3a budget/);
      expect(autopsy.heuristicNote).toContain('~3.8 characters per token');

      // 2. Excessively small budget explicitly flags oversized with markdown alert
      const tinyAutopsy = M3aFailureAutopsyBuilder.buildAutopsyPacket({
        taskId: 'task-test',
        taskTitle: 'Test Autopsy',
        taskPrompt: 'Solve task',
        attempts: m2.getAttempts(),
        maxTokenBudget: 20, // artificially tiny
      });

      expect(tinyAutopsy.oversized).toBe(true);
      expect(tinyAutopsy.formattedPacket).toContain('> [!WARNING]');
      expect(tinyAutopsy.formattedPacket).toContain('Budget Notice');
    });

    it('M3a: safely reduces multi-attempt autopsy to fit budget and marks oversized when unresolvably small', () => {
      const m2 = new M2StagnationDetector();
      for (let i = 1; i <= 3; i++) {
        m2.recordAttempt({
          patch: `pub fn attempt_${i}() { let x = ${i}; }`,
          rawError: `error[E0308]: mismatched types in attempt ${i}\n`.repeat(15),
          exitCode: 101,
        });
      }

      // Budget that forces attempt reduction (drops older attempts to keep latest)
      const reducedAutopsy = M3aFailureAutopsyBuilder.buildAutopsyPacket({
        taskId: 'task-test',
        taskTitle: 'Test Autopsy',
        taskPrompt: 'Solve task',
        attempts: m2.getAttempts(),
        maxTokenBudget: 350,
      });

      expect(reducedAutopsy.canDispatch).toBe(true);
      expect(reducedAutopsy.oversized).toBe(false);
      expect(reducedAutopsy.reducedAttempts).toBe(true);
      expect(reducedAutopsy.attempts).toHaveLength(1);
      expect(reducedAutopsy.attempts[0].attemptNumber).toBe(3);

      // Extreme budget that cannot fit even 1 reduced attempt
      const impossibleAutopsy = M3aFailureAutopsyBuilder.buildAutopsyPacket({
        taskId: 'task-test',
        taskTitle: 'Test Autopsy',
        taskPrompt: 'Solve task',
        attempts: m2.getAttempts(),
        maxTokenBudget: 15,
      });

      expect(impossibleAutopsy.oversized).toBe(true);
      expect(impossibleAutopsy.canDispatch).toBe(false);
      expect(impossibleAutopsy.formattedPacket).toContain('> [!WARNING]');
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
    it('halts and default-denies execution when agent has no host approval handler', async () => {
      const unapprovedAgent = new ProofBenchAgent(); // Default: no approval handler
      const taskSpec = TaskSpec.parse({
        version: '1',
        id: 'task-1-fix-failing-func',
        title: 'Fix off-by-one bounds bug in sliding window sums',
        prompt: 'Fix the function sliding_window_sums in src/lib.rs',
        acceptance: ['cargo test exits with code 0'],
        fixtureId: 'task-1-v1',
      });

      const { run, trace } = await unapprovedAgent.runTask(taskSpec, 42);

      expect(run.status).toBe('failed');
      expect(
        trace.events.some(
          (e) => e.type === 'error' && e.message.includes('Action rejected by host approval engine: Default-deny')
        )
      ).toBe(true);
    });

    it('executes Task 1 (fix failing sliding window function) and verifies clean pass', async () => {
      const agent = new ProofBenchAgent({ approvalHandler: createWorkspaceApprovalHandler() });
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
      expect(run.usage.cost.status).toBe('estimated');
      if (run.usage.cost.status === 'estimated') {
        expect(run.usage.cost.method).toBe('pricing_model_v1');
      }
      expect(run.usage.inputTokens.status).toBe('known');
      expect(run.usage.outputTokens.status).toBe('known');
      expect(run.reproducibility.simulated).toBe(true);

      expect(trace.events.length).toBeGreaterThan(0);
      expect(trace.events.some((e) => e.type === 'start')).toBe(true);
      expect(trace.events.some((e) => e.type === 'check')).toBe(true);

      expect(report.summary).toContain('PASSED');
      expect(report.limitations.length).toBeGreaterThan(0);
    }, 30000);

    it('executes Task 2 (implement exponential backoff) and verifies clean pass', async () => {
      const agent = new ProofBenchAgent({ approvalHandler: createWorkspaceApprovalHandler() });
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
      const agent = new ProofBenchAgent({ approvalHandler: createWorkspaceApprovalHandler() });
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

    it('executes a verified failure-to-recovery trajectory where primary model fails and recovery model resolves task via M3a autopsy packet', async () => {
      const embeddedGateway = new EmbeddedBifrostGateway();
      let primaryAttempts = 0;
      let recoveryAttempts = 0;

      embeddedGateway.setCustomHandler(async (req, _provider, model) => {
        const allText = req.messages.map((m) => m.content).join('\n');

        if (model === 'escalation-frontier-model' || allText.includes('Structured Failure Autopsy')) {
          recoveryAttempts++;
          // Verify that recovery model received the structured evidence autopsy
          expect(allText).toContain('Structured Failure Autopsy (M3a - Evidence-Only)');
          expect(allText).toContain('Verified Failure Ledger');
          expect(allText).toContain('sliding_window_sums');

          // Return the verified correct fix
          const validCode = `// File: src/lib.rs
pub fn sliding_window_sums(slice: &[i64], window_size: usize) -> Vec<i64> {
    if window_size == 0 || window_size > slice.len() {
        return Vec::new();
    }
    let mut result = Vec::with_capacity(slice.len() - window_size + 1);
    let mut current_sum: i64 = slice[..window_size].iter().sum();
    result.push(current_sum);
    for i in window_size..slice.len() {
        current_sum += slice[i] - slice[i - window_size];
        result.push(current_sum);
    }
    result
}
`;
          return {
            content: `Recovery model fixing bounds bug based on autopsy:\n\n\`\`\`rust\n${validCode}\`\`\``,
            usage: { prompt_tokens: 350, completion_tokens: 90 },
          };
        }

        // Primary model: propose a failing patch on attempt 1, and duplicate failing patch on attempt 2 to trigger M2 loop breaker
        primaryAttempts++;
        const brokenCode = `// File: src/lib.rs
pub fn sliding_window_sums(slice: &[i64], window_size: usize) -> Vec<i64> {
    vec![42]
}
`;
        return {
          content: `Primary model attempting repair:\n\n\`\`\`rust\n${brokenCode}\`\`\``,
          usage: { prompt_tokens: 200, completion_tokens: 40 },
        };
      });

      const agent = new ProofBenchAgent({
        approvalHandler: createWorkspaceApprovalHandler(),
        embeddedGateway,
        primaryModel: 'local-deepseek-coder',
        recoveryModel: 'escalation-frontier-model',
      });

      const taskSpec = TaskSpec.parse({
        version: '1',
        id: 'task-1-fix-failing-func',
        title: 'Fix off-by-one bounds bug in sliding window sums',
        prompt: 'Fix the function sliding_window_sums in src/lib.rs',
        acceptance: ['cargo test exits with code 0'],
        fixtureId: 'task-1-v1',
      });

      const { run, trace } = await agent.runTask(taskSpec, 42);

      // Verify that the task completed successfully after recovery
      expect(run.status).toBe('completed');
      expect(run.acceptance.status).toBe('passed');
      expect(primaryAttempts).toBe(2);
      expect(recoveryAttempts).toBe(1);

      // Verify model attribution in trace events
      const turnEvents = trace.events.filter((e) => e.type === 'output' && e.message.includes('Dispatching'));
      expect(turnEvents).toHaveLength(3);
      expect(turnEvents[0].data?.model).toBe('local-deepseek-coder');
      expect(turnEvents[0].data?.isRecovery).toBe(false);
      expect(turnEvents[1].data?.model).toBe('local-deepseek-coder');
      expect(turnEvents[1].data?.isRecovery).toBe(false);
      expect(turnEvents[2].data?.model).toBe('escalation-frontier-model');
      expect(turnEvents[2].data?.isRecovery).toBe(true);

      // Verify M2 halt and M3a escalation events
      expect(trace.events.some((e) => e.type === 'error' && e.message.includes('M2 Loop Breaker'))).toBe(true);
      expect(trace.events.some((e) => e.type === 'output' && e.message.includes('M3a structured autopsy generated'))).toBe(true);
      expect(trace.events.some((e) => e.type === 'output' && e.message.includes('Authorized model escalation to escalation-frontier-model'))).toBe(true);

      // Verify final successful check is attributed to recovery model
      const finalPassedCheck = trace.events.find((e) => e.type === 'check' && e.message.includes('passed cleanly'));
      expect(finalPassedCheck).toBeDefined();
      expect(finalPassedCheck?.data?.model).toBe('escalation-frontier-model');
    }, 45000);

    it('executes Task 4 (version freshness & deprecation avoidance) and verifies #![deny(deprecated)] clean pass', async () => {
      const tasksDir = getCodingTasksDir();
      const taskPath = path.join(tasksDir, 'task-4-version-freshness', 'task.json');
      const taskRaw = await fs.readFile(taskPath, 'utf8');
      const task = TaskSpec.parse(JSON.parse(taskRaw));

      const approvalHandler = createScopedPriorApprovalHandler({
        allowedFiles: ['src/lib.rs'],
        maxWritesPerFile: 5,
        maxTotalModifications: 5,
      });

      const embeddedGateway = new EmbeddedBifrostGateway();
      const client = new BifrostClient({
        mode: 'simulation',
        embeddedGateway,
        userBudgetLimitUsd: 1.0,
      });

      const agent = new ProofBenchAgent({
        bifrostClient: client,
        approvalHandler,
        enableM1ContextBounding: true,
        enableM2StagnationBreaker: true,
        enableM3aAutopsyEscalation: true,
        enableTavilyDocumentation: true,
      });

      const { run, trace } = await agent.runTask(task, Date.now());
      expect(run.status).toBe('completed');
      expect(run.acceptance.status).toBe('passed');

      const tavilyEvents = trace.events.filter(
        (e) => e.type === 'output' && e.message.includes('Tavily documentation verified')
      );
      expect(tavilyEvents.length).toBeGreaterThan(0);
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

    it('preserves null for missing tokens and excludes failed tasks from efficiency savings', async () => {
      const failingTask = TaskSpec.parse({
        version: '1',
        id: 'task-nonexistent',
        title: 'Nonexistent task that fails',
        prompt: 'Impossible prompt',
        acceptance: ['cargo test exits with code 0'],
        fixtureId: 'task-nonexistent',
      });

      const report = await ComparativeBenchmarkSuite.compareTaskEfficiency(failingTask);
      expect(report.comparable).toBe(false);
      expect(report.tokenSavingsPercent).toBeNull();
      expect(report.costSavingsPercent).toBeNull();
      expect(report.reason).toContain('Incomparable efficiency');
    });

    it('benchmarks three strategies (direct-small, direct-frontier, governed-escalated) with honest accounting', async () => {
      const tasksDir = getCodingTasksDir();
      const taskPath = path.join(tasksDir, 'task-1-fix-failing-func', 'task.json');
      const taskRaw = await fs.readFile(taskPath, 'utf8');
      const task = TaskSpec.parse(JSON.parse(taskRaw));

      const comparison = await ComparativeBenchmarkSuite.benchmarkThreeStrategies(task, {
        mode: 'simulation',
        trials: 1,
      });

      expect(comparison.taskId).toBe('task-1-fix-failing-func');
      expect(comparison.summary.direct_small.totalTrials).toBe(1);
      expect(comparison.summary.direct_large.totalTrials).toBe(1);
      expect(comparison.summary.governed_escalation.totalTrials).toBe(1);
      expect(comparison.summary.direct_small.successRatePercent).toBeGreaterThanOrEqual(0);
      expect(comparison.evidenceSummary).toContain(task.title);
    }, 60000);
  });

  // --------------------------------------------------------------------------
  // 6. Model Output Parsing & Live Gateway Security
  // --------------------------------------------------------------------------
  describe('Model Output Parsing & Fail-Closed Gateways', () => {
    it('parses tool calls and formatted code blocks without reading solution files', () => {
      const agent = new ProofBenchAgent();

      // Case 1: write_file tool call
      const toolCallResponse = {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'write_file',
                    arguments: JSON.stringify({ path: 'src/lib.rs', content: 'pub fn test() {}' }),
                  },
                },
              ],
            },
          },
        ],
      };
      const mods1 = agent.parseModelActions(toolCallResponse as Parameters<typeof agent.parseModelActions>[0]);
      expect(mods1).toHaveLength(1);
      expect(mods1[0].path).toBe('src/lib.rs');
      expect(mods1[0].content).toBe('pub fn test() {}');

      // Case 2: Markdown code block with file comment
      const markdownResponse = {
        choices: [
          {
            message: {
              content: 'Fix:\n\n```rust\n// File: src/parser.rs\npub fn parse() {}\n```',
            },
          },
        ],
      };
      const mods2 = agent.parseModelActions(markdownResponse as Parameters<typeof agent.parseModelActions>[0]);
      expect(mods2).toHaveLength(1);
      expect(mods2[0].path).toBe('src/parser.rs');
      expect(mods2[0].content).toContain('pub fn parse() {}');
    });

    it('live Bifrost mode fails closed without silent fallback to simulation on connection error', async () => {
      const deadClient = new BifrostClient({
        mode: 'live',
        virtualKey: 'sk-bf-test-key',
        gatewayUrl: 'http://127.0.0.1:59999', // Port with no running service
      });

      await expect(
        deadClient.createChatCompletion({
          model: 'local-deepseek-coder',
          messages: [{ role: 'user', content: 'test connection' }],
        })
      ).rejects.toThrow();
    });

    it('live Bifrost mode requires virtual key on construction', () => {
      const origKey = process.env.BIFROST_VIRTUAL_KEY;
      delete process.env.BIFROST_VIRTUAL_KEY;
      try {
        expect(() => new BifrostClient({ mode: 'live' })).toThrow(/Missing Bifrost virtual key in live mode/i);
      } finally {
        if (origKey) process.env.BIFROST_VIRTUAL_KEY = origKey;
      }
    });
  });
});
