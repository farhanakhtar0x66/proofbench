import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import {
  ContextCompiler,
  ContextCompilationResult,
  TokenizerService,
  PromptCompiler,
  IncrementalEditManager,
  DeterministicModelSelector,
  HostApprovalEngine,
  createDefaultPolicy,
  getCodingTasksDir,
} from '../implementations/bifrost-01/src/index';

describe('ProofBench — Deterministic Inference Optimization Compiler Suite', () => {
  const tasksDir = getCodingTasksDir();
  const task1Workspace = path.join(tasksDir, 'task-1-fix-failing-func/workspace');
  const task3Workspace = path.join(tasksDir, 'task-3-multi-file-regression/workspace');
  const task5Workspace = path.join(tasksDir, 'task-5-context-filtering/workspace');

  // ==========================================================================
  // Phase A: Context Compiler Tests
  // ==========================================================================
  describe('Phase A — Context Compiler & Tree-sitter AST', () => {
    let compiler: ContextCompiler;

    beforeEach(() => {
      compiler = new ContextCompiler({ maxTokenBudget: 2500 });
    });

    it('extracts top-level Rust functions, structs, traits, and impl blocks with exact line ranges', async () => {
      const sample = `
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct WorkerConfig {
    pub timeout: Duration,
}

pub trait Worker {
    fn execute(&self) -> bool;
}

impl Worker for WorkerConfig {
    fn execute(&self) -> bool {
        true
    }
}
      `.trim();

      const symbols = await compiler.parseRustSymbols(sample, 'src/worker.rs', 'sha256:test1234');
      expect(symbols.length).toBeGreaterThanOrEqual(4);

      const structSym = symbols.find((s) => s.name === 'WorkerConfig');
      expect(structSym).toBeDefined();
      expect(structSym?.kind).toBe('struct');
      expect(structSym?.visibility).toBe('pub');
      expect(structSym?.provenance.startLine).toBeGreaterThanOrEqual(3);
      expect(structSym?.dependencies).toContain('Duration');

      const traitSym = symbols.find((s) => s.name === 'Worker');
      expect(traitSym).toBeDefined();
      expect(traitSym?.kind).toBe('trait');

      const implSym = symbols.find((s) => s.kind === 'impl');
      expect(implSym).toBeDefined();
    });

    it('recursively traverses multi-file workspace and discovers all modules', async () => {
      const files = await compiler.findRustFiles(task3Workspace);
      expect(files).toContain('src/lib.rs');
      expect(files).toContain('src/parser.rs');
      expect(files).toContain('src/sink.rs');
      expect(files).toContain('src/event.rs');
      expect(files).toContain('tests/test_pipeline.rs');
    });

    it('counts tokens distinguishing exact BPE mode from character estimates', () => {
      const text = 'pub fn calculate_checksum(data: &[u8]) -> u32 { 42 }';
      const exact = TokenizerService.count(text, 'exact');
      expect(exact.mode).toBe('exact');
      expect(exact.count).toBeGreaterThan(5);
      expect(exact.count).toBeLessThan(30);

      const estimated = TokenizerService.count(text, 'estimated');
      expect(estimated.mode).toBe('estimated');
      expect(estimated.count).toBeGreaterThan(0);
    });

    it('prioritizes mandatory symbols and maintains structured context omission ledger', async () => {
      const res = await compiler.compileContext(
        task5Workspace,
        'panicked at src/core/accumulator.rs:22:9',
        'In src/core/accumulator.rs, implement OutlierFilteredAccumulator::process'
      );

      expect(res.status).toBe('ok');
      expect(res.tokenCountMode).toBe('exact');
      expect(res.selectedItems.length).toBeGreaterThan(0);

      // Verify targeted symbols were selected as mandatory
      const accumulatorItem = res.selectedItems.find((i) => i.symbol.name === 'OutlierFilteredAccumulator');
      expect(accumulatorItem).toBeDefined();
      expect(accumulatorItem?.isMandatory).toBe(true);

      // Verify decoy modules (metrics, crypto, config) were recorded in omission ledger
      expect(res.omissionLedger.length).toBeGreaterThan(0);
      const omittedMetrics = res.omissionLedger.find((o) => o.filePath.includes('metrics.rs'));
      expect(omittedMetrics).toBeDefined();
      expect(omittedMetrics?.reason).toBe('irrelevant');
    });

    it('detects missing mandatory dependencies if budget is strictly exhausted', async () => {
      // Create a tiny compiler with only 50 tokens and no expansion allowed
      const tinyCompiler = new ContextCompiler({
        maxTokenBudget: 50,
        allowBudgetExpansion: false,
      });

      const res = await tinyCompiler.compileContext(
        task1Workspace,
        'sliding_window_sums',
        'Fix sliding_window_sums in src/lib.rs'
      );

      expect(res.status).toBe('mandatory_context_missing');
      expect(res.missingMandatorySymbols).toContain('sliding_window_sums');
      expect(res.reason).toContain('Mandatory symbols could not fit');
    });
  });

  // ==========================================================================
  // Phase B: Prompt Compiler Tests
  // ==========================================================================
  describe('Phase B — Deterministic Prompt Compiler', () => {
    let contextRes: ContextCompilationResult;

    beforeEach(async () => {
      const compiler = new ContextCompiler({ maxTokenBudget: 3500 });
      contextRes = await compiler.compileContext(task1Workspace, '', 'sliding_window_sums');
    });

    it('compiles pure deterministic prompt with invariant prefix and XML trust boundaries', () => {
      const compiled = PromptCompiler.compile({
        task: {
          id: 'task-1-fix-failing-func',
          title: 'Fix sliding window',
          prompt: 'Fix off by one bounds bug in sliding_window_sums',
          acceptance: ['cargo test exits with code 0'],
        },
        contextResult: contextRes,
        diagnosticsHistory: [
          { attempt: 1, rawOutput: 'panicked at index out of bounds: the len is 3 but index is 3', exitCode: 101 },
        ],
        tavilyEvidence: {
          injectedContext: 'Reference documentation: sliding window requires len - window + 1',
        },
        maxInputBudget: 6000,
        maxOutputBudget: 2000,
      });

      expect(compiled.systemPrompt).toContain('You are an expert Rust systems coding agent.');
      expect(compiled.userPrompt).toContain('<trusted_task_specification>');
      expect(compiled.userPrompt).toContain('<acceptance_criteria>');
      expect(compiled.userPrompt).toContain('<trusted_diagnostic_verification>');
      expect(compiled.userPrompt).toContain('<workspace_context>');
      expect(compiled.userPrompt).toContain('<untrusted_external_evidence>');
      expect(compiled.userPrompt).toContain('<output_directive>');

      expect(compiled.trustBoundaries.hasTrustedTask).toBe(true);
      expect(compiled.trustBoundaries.hasTrustedAcceptance).toBe(true);
      expect(compiled.trustBoundaries.hasUntrustedWebEvidence).toBe(true);
      expect(compiled.inputTokens).toBeGreaterThan(0);
      expect(compiled.tokenCountMode).toBe('exact');
    });

    it('prunes obsolete superseded compiler diagnostics when newer errors occur', () => {
      const history = [
        { attempt: 1, rawOutput: 'error: expected one of `;`, found `let`\n --> src/lib.rs:12:5', exitCode: 101 },
        { attempt: 2, rawOutput: 'error[E0308]: mismatched types\n --> src/lib.rs:14:9: expected `usize`, found `u32`', exitCode: 101 },
      ];

      const pruned = PromptCompiler.pruneDiagnostics(history);
      expect(pruned.actionableOutput).toContain('error[E0308]: mismatched types');
      expect(pruned.actionableOutput).not.toContain('expected one of');
      expect(pruned.prunedCount).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Phase C: Incremental Edits & Revision Tracking
  // ==========================================================================
  describe('Phase C — Incremental Edits & Workspace Revisions', () => {
    it('validates and applies clean localized search-and-replace patches', () => {
      const source = `pub fn sum(a: i32, b: i32) -> i32 {\n    a + b\n}\n`;
      const res = IncrementalEditManager.validatePatch(source, 'a + b', 'a + b + 1');
      expect(res.valid).toBe(true);
      expect(res.resolvedContent).toContain('a + b + 1');
      expect(res.matchLineStart).toBe(2);
    });

    it('fails safely when search block is missing from target file', () => {
      const source = `pub fn sum(a: i32, b: i32) -> i32 {\n    a + b\n}\n`;
      const res = IncrementalEditManager.validatePatch(source, 'non_existent_function()', 'foo()');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Search block not found in file');
    });

    it('fails safely when search block is ambiguous (>1 occurrences)', () => {
      const source = `let x = 1;\nlet x = 1;\n`;
      const res = IncrementalEditManager.validatePatch(source, 'let x = 1;', 'let x = 2;');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Search block is ambiguous');
    });

    it('rejects patch when expected file revision hash conflicts with current content', () => {
      const source = `pub fn foo() {}\n`;
      const res = IncrementalEditManager.validatePatch(source, 'pub fn foo() {}', 'pub fn bar() {}', 'sha256:stalehash999');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Stale revision conflict');
    });

    it('parses model responses into structured search/replace blocks or full files', () => {
      const searchReplaceResponse = `
Here is the fix:
// File: src/lib.rs
<<<<<<< SEARCH
for i in 0..nums.len() {
=======
for i in 0..=nums.len() - window_size {
>>>>>>> REPLACE
      `.trim();

      const parsed = IncrementalEditManager.parseProposedModifications(searchReplaceResponse);
      expect(parsed.length).toBe(1);
      expect(parsed[0].type).toBe('localized_patch');
      expect(parsed[0].path).toBe('src/lib.rs');
      expect(parsed[0].searchBlock).toContain('for i in 0..nums.len()');
      expect(parsed[0].replaceBlock).toContain('for i in 0..=nums.len() - window_size');
    });

    it('enforces host approval engine before mutating files', async () => {
      const approvalEngine = new HostApprovalEngine(createDefaultPolicy(), async () => false); // deny all
      const manager = new IncrementalEditManager(task1Workspace, approvalEngine);

      const result = await manager.applyModifications([
        { path: 'src/lib.rs', type: 'full_file', content: '// modified' },
      ], 1);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Host approval denied');
    });
  });

  // ==========================================================================
  // Phase D: Deterministic Model Selection Tests
  // ==========================================================================
  describe('Phase D — Deterministic Model Selection Policy', () => {
    let selector: DeterministicModelSelector;
    let compiler: ContextCompiler;

    beforeEach(() => {
      selector = new DeterministicModelSelector({
        smallModel: 'qwen-1.5b',
        frontierModel: 'qwen-9b',
      });
      compiler = new ContextCompiler();
    });

    it('selects direct_frontier on Rust borrow-checker or lifetime diagnostic', async () => {
      const contextRes = await compiler.compileContext(task1Workspace);
      const diagnostics = [
        { attempt: 1, rawOutput: 'error[E0502]: cannot borrow `*self` as mutable because it is also borrowed as immutable', exitCode: 101 },
      ];

      const decision = selector.selectModel(contextRes, diagnostics, 'Fix borrow bug');
      expect(decision.strategy).toBe('direct_frontier');
      expect(decision.recommendedModel).toBe('qwen-9b');
      expect(decision.rulesTriggered).toContain('RULE_BORROW_LIFETIME_HAZARD');
    });

    it('selects bounded_escalation for intermediate single-file task without errors', async () => {
      const contextRes = await compiler.compileContext(task1Workspace);
      const decision = selector.selectModel(contextRes, [], 'Fix sliding window');

      expect(decision.strategy).toBe('bounded_escalation');
      expect(decision.recommendedModel).toBe('qwen-1.5b');
      expect(decision.recoveryModelTarget).toBe('qwen-9b');
      expect(decision.rulesTriggered).toContain('RULE_BOUNDED_ESCALATION_DEFAULT');
    });

    it('selects direct_frontier when prior failures exceed threshold', async () => {
      const contextRes = await compiler.compileContext(task1Workspace);
      const diagnostics = [
        { attempt: 1, rawOutput: 'error: failed attempt 1', exitCode: 101 },
        { attempt: 2, rawOutput: 'error: failed attempt 2', exitCode: 101 },
      ];

      const decision = selector.selectModel(contextRes, diagnostics, 'Fix task');
      expect(decision.strategy).toBe('direct_frontier');
      expect(decision.recommendedModel).toBe('qwen-9b');
      expect(decision.rulesTriggered).toContain('RULE_REPEATED_FAILURE_COMPLEXITY');
    });
  });
});
