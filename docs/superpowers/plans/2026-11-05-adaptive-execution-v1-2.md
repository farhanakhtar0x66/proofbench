# Implementation Plan — Adaptive Execution Engine v1.2
## Final Integration, Autonomous Handoffs & Competitive Benchmarking

**Date:** 2026-11-05  
**Repository:** `farhanakhtar0x66/proofbench`  
**Branch:** `feat/bifrost-01-proofbench`  
**PR:** [#27](https://github.com/farhanakhtar0x66/proofbench/pull/27) (Hold Open and Unmerged)  
**Target Commit Base:** `3bac0d7`

---

## 1. Architectural File Mapping

The following components will be created or modified:

| Path | Responsibility |
| :--- | :--- |
| `implementations/bifrost-01/src/controller/engine.ts` | Host controller: fix tier retention in `STRONGER_LLM`, wire `UniversalHandoffPacket` generation for delegations & escalations, pass `boundedInstructions` to compiler, update `CONTEXT.MD` facts. |
| `implementations/bifrost-01/src/compiler/prompt-compiler.ts` | Prompt compiler: add `boundedInstructions?: string` to `PromptCompilerInput` and render `<delegated_bounded_task>` section in prompt. |
| `implementations/bifrost-01/src/compiler/mechanical-transform.ts` | Mechanical transformer: extend to support unused variables prefixing (`_var`) and missing derive attributes (`#[derive(Debug)]`). |
| `fixtures/coding-tasks/task-7-adaptive-pipeline/` | Natural multi-module Rust task requiring `NON_LLM ➔ SMALL_LLM ➔ STRONGER_LLM ➔ SMALL_LLM ➔ VERIFIED`. |
| `fixtures/coding-tasks/task-8-deterministic-unused-var/` | Second independent deterministic mechanical fixture failing with `#![deny(unused_variables)]`. |
| `scripts/demonstrate-adaptive-v1-2.ts` | Live end-to-end evidence runner: executes all 8 phases and saves trace evidence to `.local/data/adaptive-engine-v1-2-evidence.json`. |
| `tests/adversarial-governance.test.ts` | Adversarial suite verifying fake verification rejections, unregistered models, confidential leaks, stale context, budget exhaustion, and permission elevation rejections. |
| `docs/REPRODUCTION_GUIDE.md` | Judge reproduction guide updated for v1.2. |

---

## 2. Phase-by-Phase Execution Plan

### Task 1: Phase 1 — Comprehensive Inspection & Architectural Defect Resolution
- [ ] Inspect and document v1.1 status in `phase-1-v1-2-audit.md`.
- [ ] Fix `engine.ts` tier retention bug: prevent accidental fallback to `SMALL_LLM` on turn > 1 when `currentTier === 'STRONGER_LLM'`.
- [ ] Fix `engine.ts` transition handling:
  - When `STRONGER_LLM` proposes delegation to `SMALL_LLM` with `boundedInstructions`, construct a `UniversalHandoffPacket` (`stronger_to_small`), save to `.proofbench/evidence/`, and transition cleanly.
  - When `SMALL_LLM` proposes escalation to `STRONGER_LLM` with failure diagnostics, construct a `UniversalHandoffPacket` (`small_to_stronger`), save to `.proofbench/evidence/`, and transition.
- [ ] Update `PromptCompiler`:
  - Add `boundedInstructions?: string` to `PromptCompilerInput`.
  - When `boundedInstructions` are present, render `<delegated_bounded_task>` prominently in `userPrompt`.
- [ ] Run `npm run check` to verify existing tests remain 100% passing.

### Task 2: Phase 4 — Non-LLM-First Efficiency & Second Mechanical Fixture
- [ ] Add `fixtures/coding-tasks/task-8-deterministic-unused-var/`:
  - Rust crate with `#![deny(unused_variables)]` that fails `cargo test` with exit code 101 due to un-prefixed unused parameter.
- [ ] Extend `MechanicalTransformer`:
  - Detect `error: unused variable: \`([^\`]+)\`` from `rustc` output and apply automatic leading underscore prefix `_$1`.
- [ ] Add unit test in `tests/adaptive-engine.test.ts` proving `task-8-deterministic-unused-var` passes at **0 LLM tokens**.

### Task 3: Phase 2 — Genuine Autonomous Bidirectional Execution Project
- [ ] Create `fixtures/coding-tasks/task-7-adaptive-pipeline/`:
  - Multi-module Rust project (`src/lib.rs`, `src/buffer.rs`, `src/pipeline.rs`, `src/sink.rs`).
  - Contains:
    1. Unused import in `src/lib.rs` (fixable by `NON_LLM`).
    2. Routine buffer calculation in `src/buffer.rs` (fixable by `SMALL_LLM`).
    3. Complex lifetime / trait coordination in `src/pipeline.rs` (stagnates `SMALL_LLM`, requires `STRONGER_LLM`).
    4. Bounded formatting/sink routine in `src/sink.rs` (delegated back to `SMALL_LLM`).
- [ ] Verify test suite fails out-of-the-box (`cargo test` exit code 101).

### Task 4: Phase 3 — Live CONTEXT.MD Synchronization & Controller Interruption
- [ ] Add controller restart verification test in `tests/persistence.test.ts`:
  - Run Task on instance 1 until checkpoint; kill instance 1.
  - Assert `CONTEXT.MD` has exact verified progress, known failures, and source revision.
  - Start instance 2 from durable checkpoint; assert turn count, diagnostics, tier, and cumulative tokens are restored.
  - Complete execution on instance 2 and verify acceptance tests pass.

### Task 5: Phase 6 — Comprehensive Adversarial Governance Verification
- [ ] Create `tests/adversarial-governance.test.ts`:
  - Test 1: Model claiming acceptance without clean `cargo test` fails closed.
  - Test 2: Unjustified escalation without diagnostic failure rejected.
  - Test 3: Unjustified downgrade without bounded subtask rejected.
  - Test 4: Unregistered model ID rejected by registry.
  - Test 5: Confidential mode rejects remote/cloud endpoints.
  - Test 6: Mid-task budget exhaustion triggers halt.
  - Test 7: Rapid ping-pong triggers `OscillationDetector` halt.
  - Test 8: Stale `CONTEXT.MD` revision drift triggers mismatch event.
  - Test 9: Path traversal and command execution rejected by approval engine.
  - Test 10: Missing token observations preserved as `missing`.

### Task 6: Phase 5 & 7 — Live Six-Configuration Benchmark & Execution Evidence
- [ ] Implement `scripts/demonstrate-adaptive-v1-2.ts`:
  - Executes live Bifrost demonstration of:
    - Phase 4: Deterministic 0-token fixes (Tasks 6 & 8).
    - Phase 3: Live `CONTEXT.MD` sync and process interruption.
    - Phase 2: Autonomous bidirectional sequence (`NON_LLM ➔ SMALL_LLM ➔ STRONGER_LLM ➔ SMALL_LLM ➔ VERIFIED`).
  - Runs six-configuration comparative benchmark across frozen tasks with truthful full-trial accounting.
  - Writes structured telemetry artifact to `.local/data/adaptive-engine-v1-2-evidence.json`.
- [ ] Add script to `package.json` (`npm run demonstrate:adaptive:v1-2`).

### Task 7: Phase 8 — Release Verification, Guide Update & PR #27 Sync
- [ ] Run full quality gate: `npm run check`.
- [ ] Update `docs/REPRODUCTION_GUIDE.md` with instructions for v1.2.
- [ ] Commit all changes to `feat/bifrost-01-proofbench` and push to remote origin.
- [ ] Update PR #27 title and description with empirical evidence. Confirm PR #27 remains **OPEN**.
