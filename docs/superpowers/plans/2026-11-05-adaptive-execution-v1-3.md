# Implementation Plan — Adaptive Execution Engine v1.3
## Genuine Bidirectional Handoffs, Fair Benchmarking & Release Readiness

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete ProofBench Adaptive Execution Engine v1.3 by proving genuine bidirectional model routing (`NON_LLM ➔ SMALL_LLM ➔ STRONGER_LLM ➔ SMALL_LLM ➔ NON_LLM`) on a multi-stage Rust project, implementing fair controlled benchmarks that isolate routing from deterministic tooling, measuring true CPU time with `process.cpuUsage()`, verifying persistent state resumption across handoff boundaries, and establishing a stable trace contract for the UI dashboard.

**Architecture:** A unified TypeScript execution engine acting as the sole deterministic governing authority over local/remote models via the Maxim Bifrost gateway (`http://127.0.0.1:8089`). Models request tier transitions via structured proposals validated against observable evidence, while the host orchestrates AST context pruning, mechanical code transforms, M3a diagnostic autopsies, and durable state resumption.

**Tech Stack:** TypeScript, Node.js (`process.cpuUsage()`), Vitest, Rust (`cargo`, `rustc`, `tree-sitter-rust`), Maxim Bifrost Gateway, llama.cpp (`Qwen2.5-Coder-1.5B` & `Qwen3.5-9B`), Tavily Search API.

**Spec:** User Request 10 (ProofBench — Adaptive Execution Engine v1.3).

## Global Constraints
- **Zero NeuroMesh IP:** The proprietary core at `/Users/farhanakhtar/Projects/neuromesh-research` remains strictly private and untouched.
- **No Extra LLMs / No New Frameworks:** The host TypeScript state machine is the sole decision authority; do not add LLMs to optimize prompts.
- **Bifrost & Tavily Preservation:** Maintain active Bifrost gateway routing (`http://127.0.0.1:8089`) and Tavily documentation freshness checks.
- **Truthful Benchmark Accounting:** Count zero tokens only when no model request occurred; preserve unrecorded telemetry as `missing`; include failed trials in totals.
- **True CPU Time Measurement:** Use `process.cpuUsage()` deltas rather than wall-clock subtractions for reporting CPU duration.
- **PR #27 Gate:** Keep PR #27 **OPEN and unmerged**; do not auto-merge.

## Review Focus
1. **Model proposal injection attack:** A model emits a fake `<tier_transition target="STRONGER_LLM">` without actual compiler errors or diagnostics; verify controller rejects and stays in current tier.
2. **Loss of pending bounded instructions across controller crash:** Execution is interrupted while a `stronger_to_small` delegation is pending; verify resumed controller executes the bounded instruction rather than restarting the entire task.
3. **Non-zero token reporting on skipped calls:** A mechanical transform or AST pass runs without LLM inference; verify prompt and completion tokens are recorded as exactly `0` (known), never omitted or undefined.
4. **Benchmark tool skew:** Comparing adaptive engine with AST tools against baselines without AST tools conflates compiler gains with routing gains; verify the controlled benchmark provides identical AST tools to all baselines.
5. **Looping oscillation across tiers:** Models ping-pong between `SMALL_LLM` and `STRONGER_LLM` without reducing test failures; verify `OscillationDetector` halts execution.

---

## 1. Architectural File Mapping

| Path | Responsibility |
| :--- | :--- |
| `implementations/bifrost-01/src/controller/engine.ts` | Replace wall-clock duration with Node.js `process.cpuUsage()`, record cumulative CPU duration, ensure pending bounded instructions survive restart, and wire bidirectional transitions. |
| `implementations/bifrost-01/src/compiler/model-selector.ts` | Adjust multi-file rule so intermediate tasks with zero prior failures start in `bounded_escalation` (`SMALL_LLM`) rather than jumping prematurely to `STRONGER_LLM`. |
| `fixtures/coding-tasks/task-9-bidirectional-event-service/` | Independent multi-stage Rust project (`src/lib.rs`, `src/event.rs`, `src/dispatcher.rs`, `src/filter.rs`, `tests/test_service.rs`) exercising `NON_LLM ➔ SMALL_LLM ➔ STRONGER_LLM ➔ SMALL_LLM ➔ NON_LLM`. |
| `implementations/bifrost-01/src/suite/benchmark.ts` | Implement dual-mode benchmarking: System-Level (disclosing tools) and Controlled Routing (equalizing deterministic AST tools across all baselines). |
| `packages/contracts/src/trace-contract.ts` | Stable TypeScript data contract and JSON schema for Aryan's UI dashboard. |
| `tests/adaptive-engine.test.ts` | Unit tests for bidirectional execution flow and controlled routing benchmarks. |
| `tests/persistence.test.ts` | Integration test verifying controller restart during a pending `stronger_to_small` handoff. |
| `scripts/demonstrate-adaptive-v1-3.ts` | Live end-to-end evidence runner: executes all v1.3 requirements and exports structured telemetry to `.local/data/adaptive-engine-v1-3-evidence.json`. |
| `docs/REPRODUCTION_GUIDE.md` | Judge reproduction guide updated for v1.3. |

---

## 2. Phase-by-Phase Execution Plan

### Task 1: Audit Routing Gap & Implement Real CPU Time Measurement
- [ ] Measure CPU time in `engine.ts` using `process.cpuUsage()` before and after deterministic operations (AST parsing, mechanical transforms, prompt compilation) and across the full run.
- [ ] In `UsageRecord`, record `cpuDurationMs` alongside `duration` (`wallDurationMs`), setting `source: 'process.cpuUsage'`.
- [ ] In `model-selector.ts`, refine `RULE_MULTI_MODULE_HIGH_COMPLEXITY`: when `features.priorFailureCount === 0` and budget pressure is within bounds, select `bounded_escalation` (`SMALL_LLM`) so multi-module projects give the small model the initial pass under governance.
- [ ] Run `npm run check` to verify existing tests remain 100% passing.

### Task 2: Create Multi-Stage Rust Project (`task-9-bidirectional-event-service`)
- [ ] Create `fixtures/coding-tasks/task-9-bidirectional-event-service/`:
  - `task.json`: Compliant `TaskSpec` with acceptance criteria.
  - `Cargo.toml`: Standard Rust package with fast stdlib dependencies.
  - `src/lib.rs`: Exposes `event`, `filter`, `dispatcher` modules; contains minor unused import for `NON_LLM` pass.
  - `src/event.rs`: Event struct with payload deserialization bug (fixable by `SMALL_LLM`).
  - `src/dispatcher.rs`: Event dispatcher with channel/buffer and complex lifetime/borrow semantics that fails naive small model edits with `E0502`/`E0499`, triggering M3a escalation to `STRONGER_LLM`.
  - `src/filter.rs`: Event filtering policy (`EventFilter`) with bounded `evaluate_predicate` left as `todo!()` for `STRONGER_LLM` delegation back to `SMALL_LLM`.
  - `tests/test_service.rs`: 4 comprehensive integration tests.
- [ ] Verify `cargo test` in `task-9-bidirectional-event-service` fails out-of-the-box (exit code 101).

### Task 3: Implement Genuine Bidirectional Live Trajectory & Verification
- [ ] Add Scenario in `tests/adaptive-engine.test.ts` exercising `NON_LLM ➔ SMALL_LLM ➔ STRONGER_LLM ➔ SMALL_LLM ➔ NON_LLM`.
  - Step 1: `NON_LLM` cleans dead import (0 tokens).
  - Step 2: `SMALL_LLM` fixes `src/event.rs`; hits borrow error on `src/dispatcher.rs`.
  - Step 3: M3a autopsy triggers escalation to `STRONGER_LLM`.
  - Step 4: `STRONGER_LLM` fixes `src/dispatcher.rs` and emits delegation proposal for `src/filter.rs` with `boundedInstructions`.
  - Step 5: Controller validates proposal, hands `boundedInstructions` to `SMALL_LLM`.
  - Step 6: `SMALL_LLM` implements `src/filter.rs`.
  - Step 7: `NON_LLM` verifies `cargo test` passes 100%.

### Task 4: Test Persistent Continuation During Handoff
- [ ] In `tests/persistence.test.ts`, add test for inter-tier handoff interruption:
  - Run engine up to the point where `STRONGER_LLM` emits the delegation proposal.
  - Halt/kill controller instance 1.
  - Assert checkpoint contains `pendingBoundedInstructions`, `pendingHandoff` packet, accepted edits to `src/dispatcher.rs`, and cumulative token counters.
  - Initialize controller instance 2 from saved checkpoint.
  - Verify instance 2 dispatches to `SMALL_LLM` with `boundedInstructions` without re-running or reverting previous work.
  - Verify complete task acceptance on instance 2.

### Task 5: Implement Fair Controlled Routing Benchmark
- [ ] In `implementations/bifrost-01/src/suite/benchmark.ts`:
  - Implement two explicit benchmark evaluation modes:
    1. **System-Level Benchmark**: Baseline Agents (unbounded) vs Adaptive Execution Engine.
    2. **Controlled Routing Benchmark**: Equalize deterministic tooling (all baselines receive the same AST context compiler and mechanical transformer); vary only the routing strategy (`direct_small`, `direct_frontier`, `escalation_only`, `bidirectional_adaptive`).
  - Report exact attribution breakdown:
    - Deterministic tooling contribution (tokens/latency saved by non-LLM passes).
    - Context compilation contribution (tokens saved by Tree-sitter pruning).
    - Model selection contribution (cost/token difference of starting tier).
    - Bidirectional handoff contribution (tokens saved by delegating bounded tail to small model).
  - Report true CPU time via `process.cpuUsage()` and wall-clock latency via `performance.now()`.

### Task 6: Establish UI Data Contract for Aryan's Dashboard
- [ ] Create `packages/contracts/src/trace-contract.ts`:
  - Define interfaces for execution trace events, tier transitions, handoff packets, diagnostic records, benchmark summaries, and runtime state.
  - Export JSON schema or TypeScript types consumable by Aryan's UI frontend.
  - Export contracts from `packages/contracts/src/index.ts`.

### Task 7: Comprehensive Live Evidence Runner & Release Documentation
- [ ] Implement `scripts/demonstrate-adaptive-v1-3.ts`:
  - Executes live Bifrost demonstration of:
    - Phase 1: Real CPU time measurement via `process.cpuUsage()`.
    - Phase 2 & 3: Genuine bidirectional trajectory on `task-9-bidirectional-event-service`.
    - Phase 4: Inter-tier persistence and process resumption.
    - Phase 5: System-level and controlled routing benchmarks.
    - Phase 6: Stable UI trace contract validation.
  - Writes telemetry artifact to `.local/data/adaptive-engine-v1-3-evidence.json`.
- [ ] Add script to `package.json` (`npm run demonstrate:adaptive:v1-3`).
- [ ] Run full quality gate: `npm run check`.
- [ ] Update `docs/REPRODUCTION_GUIDE.md` with instructions for v1.3.
- [ ] Commit all changes to `feat/bifrost-01-proofbench` and push to remote origin.
- [ ] Update PR #27 title and description with empirical evidence. Confirm PR #27 remains **OPEN**.
