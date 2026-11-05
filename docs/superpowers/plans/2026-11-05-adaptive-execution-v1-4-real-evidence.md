# Implementation Plan — Adaptive Execution Engine v1.4
## Real Multi-Model Execution & Evidence Integrity

**Goal:** Correct all discrepancies between claimed live results and actual implementation; build a strict live demonstration mode requiring the real stock Maxim Bifrost gateway and authenticated local Qwen models; remove hardcoded attribution calculations; equalize controlled benchmark arms; test real checkpoint restart without mock handlers; and report honest empirical evidence.

**Repository:** `farhanakhtar0x66/proofbench`  
**Branch:** `feat/bifrost-01-proofbench`  
**Starting Commit:** `2d0ffa6`  
**PR:** [#27](https://github.com/farhanakhtar0x66/proofbench/pull/27) (Hold Open and Unmerged)

---

## 1. File & Component Mapping

| Component | Path | Responsibility in v1.4 |
| :--- | :--- | :--- |
| **Existing Demonstration** | `scripts/demonstrate-adaptive-v1-3.ts` | Relabel all mock-gateway runs and benchmarks as **Simulated / Mock Deterministic Regression Tests**. Explicitly document that model responses and transitions were pre-scripted simulations. |
| **Controlled Benchmarking** | `implementations/bifrost-01/src/suite/benchmark.ts` | 1. Remove hardcoded attribution assumptions (`350` and `850`). Replace with measured paired ablations or mark as `incomparable`/`unknown`.<br>2. Equalize execution engines: Run all controlled policies on the same underlying engine runtime so only the routing strategy differs.<br>3. Report honest multi-trial statistics without dividing total tokens only by passed trials when baselines fail. |
| **Live Demonstration Runner** | `scripts/demonstrate-adaptive-v1-4-live.ts` | Strict live verification script: Prohibits `EmbeddedBifrostGateway`, synthetic tokens, and prewritten patches. Connects to `http://127.0.0.1:8089` using `BIFROST_VIRTUAL_KEY`, verifies Qwen 1.5B and Qwen 9B availability, records real provider telemetry, and runs live coding tasks. |
| **Live Checkpoint Interruption** | `scripts/demonstrate-adaptive-v1-4-live.ts` / `tests/persistence.test.ts` | Test controller process interruption between real live model calls (or real turns) and resume without mock handlers. |
| **Trace Contracts** | `packages/contracts/src/trace-contract.ts` | Update attribution schema: mark unmeasured attribution metrics as optional or nullable (`unknown`). |
| **Reproduction Guide** | `docs/REPRODUCTION_GUIDE.md` | Clearly separate simulated deterministic regressions from live Bifrost-backed execution. Accurately document live model requirements and commands. |
| **PR #27 Body & Title** | GitHub PR #27 | Update description with scientific honesty: clearly distinguish simulated state-machine regressions from genuine live model evaluations. Keep OPEN. |

---

## 2. Phase-by-Phase Plan

### Phase 1: Immediate Evidence Correction & Relabeling
- [ ] In `scripts/demonstrate-adaptive-v1-3.ts`:
  - Rename console headers and report sections to `SIMULATED_REGRESSION_TEST`.
  - Add explicit disclaimer: "SIMULATION NOTICE: This section exercises the controller state machine and handoff parser using an EmbeddedBifrostGateway with pre-scripted model outputs. It proves state machine transitions and persistence invariants, NOT real model generation."
  - Export evidence report marked with `mode: "simulated_state_machine_regression"`.
- [ ] In PR #27:
  - Update title and description immediately to clarify that v1.3 demonstrated controller state machine invariants under simulation, and v1.4 provides genuine live inference verification.

### Phase 2: Remove Hardcoded Resource Attribution in `benchmark.ts`
- [ ] In `benchmark.ts`:
  - Remove fixed numbers `350` (for mechanical transforms) and `850` (for AST context compilation).
  - Implement real measured attribution via paired execution or declare as `null` / `missing` when not directly isolated.
  - In `attribution`:
    ```ts
    // Only report what is measured from actual telemetry
    deterministicToolingTokensSaved: avoidedModelRequests > 0 ? measuredBaselineTokens - measuredAdaptiveTokens : null,
    ```
  - For metrics that cannot be cleanly isolated without a full paired run, report `null` and document the limitation.
- [ ] In `packages/contracts/src/trace-contract.ts`:
  - Make attribution token fields nullable (`z.number().int().nonnegative().nullable()`).

### Phase 3: Equalize Capabilities in Controlled Benchmark
- [ ] Audit `benchmarkControlledRouting()`:
  - Both baseline and adaptive arms must execute via the SAME execution engine architecture, varying ONLY the model selection/routing policy (`direct_small`, `direct_frontier`, `escalation_only`, `bidirectional_adaptive`).
  - Ensure all arms have equivalent access to:
    - Deterministic mechanical transformations
    - Tree-sitter context compilation
    - Prompt compilation
    - Source discovery & workspace tools
    - Host approval engine & security invariants
  - Report full attempt metrics:
    - Passed trials / total trials
    - Total tokens across ALL attempts (including failed trials)
    - Tokens per accepted completion ONLY when passedTrials > 0; clearly denote `N/A (0% pass rate)` when failed
    - Wall-clock duration and true process CPU duration

### Phase 4: Build Strict Live Demonstration (`scripts/demonstrate-adaptive-v1-4-live.ts`)
- [ ] Live Gatekeeper:
  - Check `http://127.0.0.1:8089/health` -> Must be `status: 'ok'`.
  - Check `http://127.0.0.1:8089/v1/models` -> Must contain:
    - Small Model: `Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M`
    - Stronger Model: `gguf/Qwen3.5-9B-GGUF:Q4_K_M`
  - Fail immediately with detailed diagnostic message if gateway or models are missing.
- [ ] Prohibit all simulation artifacts:
  - No `EmbeddedBifrostGateway`.
  - No hardcoded response strings or prewritten code blocks.
  - No synthetic token counts (`usage` must come strictly from `gatewayResponse.usage`).
  - No pre-scripted transition tags.
- [ ] Run genuine live task execution:
  - Execute on real tasks (`task-1-fix-failing-func`, `task-6-deterministic-fix`, `task-9-bidirectional-event-service`).
  - Allow the models and host engine to make decisions naturally.
  - If a model outputs code that compiles and passes tests: accept and record.
  - If a model fails: record failure and diagnostics honestly.
  - If escalation occurs via M3a autopsy: record genuine transition.
  - If stronger model delegates or completes directly: record actual behavior without forcing.
- [ ] Live Interruption & Resumption:
  - Stop engine after a real live model call.
  - Start fresh engine instance on the same workspace.
  - Verify checkpoint, source revision, and `CONTEXT.MD` survive.
  - Complete remaining turns with real live model inference.
- [ ] Export live evidence artifact:
  - Save to `.local/data/adaptive-engine-v1-4-live-evidence.json`.

### Phase 5: Quality Gate & Reproduction Documentation
- [ ] Run `npm run check` (ESLint 0 warnings, TypeScript 0 errors, Vitest 100% pass, offline evaluator 7/7, production build clean).
- [ ] Update `docs/REPRODUCTION_GUIDE.md` with:
  - Clear distinction between simulated regression tests (`npm run demonstrate:adaptive:v1-3`) and strict live demonstration (`npm run demonstrate:adaptive:v1-4:live`).
  - Exact reproduction instructions.
- [ ] Update PR #27 title and description with truthful empirical findings.
- [ ] Confirm PR #27 remains **OPEN and UNMERGED**.
