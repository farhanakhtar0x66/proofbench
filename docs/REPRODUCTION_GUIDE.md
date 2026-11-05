# ProofBench — Judge & Evaluator Reproduction Guide (v1.5)

**Track Challenge:** Bifrost #01 — Coding Agent with Minimal Token Usage  
**Secondary Integration:** Tavily — Documentation Freshness & Source Verification  
**Repository:** `farhanakhtar0x66/proofbench`  
**Branch:** `feat/bifrost-01-proofbench`  
**PR:** [#27](https://github.com/farhanakhtar0x66/proofbench/pull/27) (**HOLD OPEN AND UNMERGED — DO NOT MERGE AUTOMATICALLY**)

---

## 1. System Overview & Evaluation Highlights

ProofBench implements an **Adaptive Execution Engine (v1.5)** designed to minimize total model token consumption on complex coding benchmarks while preserving or improving task correctness by dynamically transitioning between:

`NON_LLM ⇄ SMALL_LLM ⇄ STRONGER_LLM`

### Scientific Integrity & Distinct Evaluation Modes

In accordance with empirical evidence standards, v1.5 explicitly separates **simulated state-machine regression tests** from **strict live model evaluations**:

1. **Deterministic State Machine Simulation Suite (`npm run demonstrate:adaptive:v1-3`):**  
   Uses an `EmbeddedBifrostGateway` with deterministic mock response handlers to evaluate host controller state-machine invariants, Tree-sitter AST context compilation, mechanical transformation rules, durable checkpoint serialization, adversarial attack defenses, and universal handoff protocol parsing.

2. **Strict Live Multi-Model Inference Suite (`npm run demonstrate:adaptive:v1-5:live`):**  
   Requires a live running Maxim Bifrost gateway daemon (`http://127.0.0.1:8089`) with authenticated `BIFROST_VIRTUAL_KEY`, local Qwen 1.5B (`Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M`), and local Qwen 9B (`gguf/Qwen3.5-9B-GGUF:Q4_K_M`). Prohibits all mock gateways, synthetic token counts, and prewritten code patches. All responses, tokens, latencies, and patches are produced live by the models and local servers.

---

## 2. Key Capabilities Demonstrated in v1.5

1. **Non-LLM 0-Token Resolution:** Guaranteed compiler-guided mechanical fixes applied in the non-LLM tier (e.g. `task-6-deterministic-fix`), resolving compiler diagnostics at exactly **0 LLM tokens** (85 ms controller CPU, 1,326 ms cargo test subprocess wall duration).
2. **Live Small Model Inference & Non-LLM Verification:** Routine coding tasks (`task-1-fix-failing-func`) executed live through the stock Bifrost gateway by local Qwen 1.5B, completing in 1 turn with 1,433 prompt tokens and 234 completion tokens, verified by independent `cargo test`.
3. **Live Multi-Module Trajectory & Acceptance (Task 9):** Complex multi-module task (`task-9-bidirectional-event-service`) executed with live models. Scientific diagnosis identified context truncation, diff marker confusion, and structural preamble preservation. With compiler and controller hardening, the engine autonomously coordinates non-LLM mechanical fixes, small-model delegation, and M3a escalation to local Qwen 9B to resolve all 4 integration tests across 5 turns live (13,198 total tokens), terminating in verified acceptance.
4. **Execution-Security Isolation & Test Tamper Defenses:**
   - **Environment Scrubbing:** `TaskWorkspace.buildScrubbedEnvironment()` enforces a strict allowlist (`PATH`, `HOME`, `USER`, `SHELL`, `LANG`, `TMPDIR`, `TERM`, `CARGO_HOME`, `RUSTUP_HOME`, `RUST_BACKTRACE`) and scrubs all sensitive API keys, secrets, credentials, and gateway tokens before executing test subprocesses.
   - **Harness Tamper Detection:** Test directories are cryptographically snapshotted with SHA-256 before model execution; unauthorized modifications to frozen test harnesses or fixtures trigger immediate execution abort with exit code 126.
5. **True OS Child-Process Restarts (`child_process.fork`):**
   - **Planned Suspension:** Child process cleanly exits after Turn 1. A second child process resumes from the durable disk checkpoint (`.proofbench/checkpoints/` + `CONTEXT.MD`) and passes without replaying Turn 1.
   - **Abrupt Crash (`SIGKILL`):** Child process is abruptly killed with `SIGKILL` mid-execution simulating host failure. Resumption process detects surviving checkpoints, validates matching source git revisions, and completes verified execution.
6. **Signed Token Attribution & Accurate Telemetry:**
   - Empirical deltas are strictly signed (no `Math.max(0, ...)` suppression).
   - Subprocess CPU metrics report `subprocessCpuMs: null` when isolated per-process CPU timing is unsupported by OS subprocess primitives, using `testSubprocessWallMs` for wall time instead.
   - Non-exercised metrics (such as bidirectional handoff savings on single-turn tasks) report `bidirectionalHandoffTokensSaved: null` to preserve scientific integrity.
7. **Model Identity & Trace Provenance:** Emits structured `modelInference` events with requested vs actual model IDs, provider routing info, latency, prompt/completion tokens, and source revision hashes validated against `trace-contract.ts`.
8. **Generic Deterministic File Resolution & Multi-Module Verification (Task 10):**
   - Replaced all fixture-specific symbol strings with a deterministic 5-level resolution engine:
     1. Verified explicit file headers (`// File: src/...`) with absolute-path & traversal rejection
     2. Consecutive multi-patch inheritance (verified against search block containment)
     3. Unique matches against actual workspace source across `.rs` files
     4. Tree-sitter symbol declarations/implementations matching workspace symbol index
     5. Strict rejection of ambiguous or unestablished destinations (refusing to guess `src/lib.rs`).
   - Transactional multi-file patch atomicity: pre-validates all edits and staged content before writing to disk; safe rollback restores files on any commit failure; post-commit SHA-256 verification.
   - Tested on multi-module Task 10 (`task-10-sensor-fusion-aggregator`) with unfamiliar files (`sensor.rs`, `aggregator.rs`, `fusion.rs`) and symbols (`SensorReading`, `TelemetryAggregator`, `KalmanFusionEngine`), resolving without hardcoded mappings both in simulation (`tests/held-out-task10.test.ts`) and live through stock Bifrost gateway with local Qwen models (`scripts/verify-live-task10.ts`).
   - *Evidence Classification Note:* Task 10 was co-developed alongside the generic resolver to prove the complete elimination of fixture heuristics; it is a multi-module structural test rather than an independently blinded third-party benchmark.

---

## 3. Environment Prerequisites

- **Node.js:** `>= 22.12.0` (Native `process.loadEnvFile`, ES modules)
- **Rust Toolchain:** `cargo` and `rustc` installed and on `$PATH` (for offline acceptance compilation and test verification)
- **Package Manager:** `npm`
- **Maxim Bifrost Gateway Daemon:** Required for live mode (`bifrost-http-0 -port 8089`)

### Environment Configuration (`.env`)

Create or update `.env` in the repository root:

```bash
# Maxim Bifrost Gateway Daemon (Local or Remote)
BIFROST_GATEWAY_URL=http://127.0.0.1:8089

# Active Maxim Bifrost Virtual Key
BIFROST_VIRTUAL_KEY=sk-bf-your-virtual-key

# Models
BIFROST_DEFAULT_MODEL=Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M
BIFROST_RECOVERY_MODEL=gguf/Qwen3.5-9B-GGUF:Q4_K_M

# Optional: Tavily API Key for live documentation freshness searches
TAVILY_API_KEY=tvly-your-tavily-key
```

---

## 4. Quickstart & Verification Commands

### Step 1: Run the Complete Quality & Test Gate

Runs ESLint (`--max-warnings=0`), TypeScript compilation (`tsc --noEmit`), Vitest suite (**113 tests across 11 test files**), offline fixture regression tests (7/7 suites), and production builds for both the web frontend and API server:

```bash
npm run check
```

*Expected Result:*
- `113/113 tests passed` (100% pass rate across 11 test suites including `tests/incremental-resolution.test.ts` and `tests/held-out-task10.test.ts`)
- `7/7 offline fixture regressions passed`
- `0 lint errors / warnings`
- `dist/web/` and `dist/api/` built cleanly

---

### Step 2: Run the Strict Live Multi-Model Demonstration (v1.5)

Executes genuine live multi-model inference through the Maxim Bifrost gateway with real local Qwen models:

```bash
npm run demonstrate:adaptive:v1-5:live
```

*Key Live Invariants Verified:*
- **Preflight:** Verifies gateway `/health` and model availability (`Qwen 1.5B` and `Qwen 9B`).
- **Pillar 1:** Solves `task-6` at **0 LLM tokens** (85 ms controller CPU, 1,326 ms test subprocess wall duration).
- **Pillar 2:** Solves `task-1` live via Qwen 1.5B (1,433 input tokens, 234 output tokens, 1 turn).
- **Pillar 3:** Executes multi-module `task-9` through Bifrost with real provider usage (13,198 total tokens across 5 turns, dynamic escalation to 9B, resolving all 4 integration tests with verified acceptance).
- **Pillar 4:** True OS child-process restarts via `child_process.fork` under both planned suspension and abrupt `SIGKILL`.
- **Pillar 5:** Runs multi-task equalized controlled benchmark across all 4 routing policies through live Bifrost with signed attribution and validates telemetry against Zod contract schema.

*Generated Live Artifact:*  
`.local/data/adaptive-engine-v1-5-live-evidence.json`

---

### Step 3: Run the True OS Process Restart Test Directly

Directly executes the true OS-level child process restart test:

```bash
npx vitest run tests/process-restart.test.ts
```

*Invariants Tested:*
- Planned suspension with state preservation across spawned Node.js child processes.
- Abrupt `SIGKILL` termination with disk checkpoint recovery and zero Turn 1 replay.

---

### Step 4: Run the Adversarial Governance Suite

Directly executes the 12-attack security and governance invariant test suite:

```bash
npx vitest run tests/adversarial-governance.test.ts
```

*Attacks Verified:*
1. Rejection of fake model-generated verification claims.
2. Rejection of unjustified escalation requests without compiler diagnostics.
3. Rejection of unjustified downgrade requests lacking bounded instructions.
4. Rejection of model proposals requesting unregistered or unauthorized model IDs.
5. Prevention of confidential code routing to external cloud providers.
6. Halting of execution upon cumulative budget cap exhaustion.
7. Oscillation detector blocking unproductive back-and-forth ping-pong between tiers.
8. Detection of external out-of-band source revision drift during resumption.
9. Default-deny on path traversal (`../`) and arbitrary shell commands.
10. Preservation of missing token telemetry without zero-fabrication.
11. Scrubbing of API keys, tokens, credentials, and secrets from test subprocess environments.
12. Detection of unauthorized modifications to frozen test harnesses and test fixtures (abort with exit code 126).

---

### Step 5: Run the Live Multi-Module Task 10 Demonstration

Directly executes genuine live multi-model inference against the multi-module sensor fusion task (`task-10-sensor-fusion-aggregator`) via local Bifrost gateway:

```bash
npm run demonstrate:task10:live
```

*Invariants Tested:*
- Generalization of deterministic file resolution without fixture-specific symbol strings.
- Autonomous bidirectional tier transitions across live local Qwen 1.5B and Qwen 9B.
- Full resolution and passing acceptance across all 3 integration tests in 4 execution turns.
- *Evidence Note:* Demonstrates live Bifrost execution against the co-developed multi-module fixture. For simulated unit validation, see `npm test tests/held-out-task10.test.ts`.

---

## 5. Architectural Verification Matrix

| Component / Subsystem | Test Suite | Verified Invariant |
| :--- | :--- | :--- |
| **Adaptive Execution Engine** | `tests/adaptive-engine.test.ts` | Scenarios A–G: 0-token fixes, small model routing, direct complex routing, M3a autopsy escalation, bounded small model delegation, crash resumption, and genuine bidirectional routing on `task-9`. |
| **Multi-Module Task Validation** | `tests/held-out-task10.test.ts` | Multi-module project with unfamiliar symbols and files (`task-10-sensor-fusion-aggregator`), resolving via generic AST symbol & source matching without hardcoded fixtures (simulation validation). |
| **Deterministic File Resolution** | `tests/incremental-resolution.test.ts` | 5-level deterministic resolution, absolute path / traversal rejection, transactional commit & rollback, and Tree-sitter AST function merge without brace counting. |
| **OS Process Restarts** | `tests/process-restart.test.ts` | True child-process isolation via `child_process.fork`, planned suspension, abrupt `SIGKILL` recovery, and disk checkpoint continuation without turn replay. |
| **Adversarial Governance** | `tests/adversarial-governance.test.ts` | 12 adversarial attacks verified: fake verification rejection, anti-privilege escalation, confidential mode loopback enforcement, budget halts, test environment credential scrubbing, and frozen harness tamper detection. |
| **Persistence & Continuity** | `tests/persistence.test.ts` | Atomic JSONL event append, schema validation, checkpoint restoration across inter-tier handoffs, external git revision drift detection, and diagnostic log preservation. |
| **Routing & Registry** | `tests/routing.test.ts` | Model tier defaults, verified loopback destinations (`127.0.0.1`), capability descriptors, and proposal validation. |
| **AST Context Compiler** | `tests/compiler.test.ts` | Tree-sitter symbol graph extraction, transitive call graph traversal, token budgeting, mechanical transform formatting, and compiler-suggested import fixes. |
| **UI Trace Contracts** | `tests/contracts.test.ts` | Zod schema validation for trace events, model inference provenance, handoff exports, signed attribution breakdown, and controlled benchmark exports. |
| **Bifrost Client & Failover** | `tests/bifrost-01.test.ts` | Virtual key pre-flight allowance checks, default-deny workspace approvals, rate limit retries, and M2 oscillation loop halts. |

---

## 6. Artifact Inspection

All evidence produced during evaluation runs is saved to standard inspection locations:
- **Adaptive Engine v1.5 Live Evidence:** `.local/data/adaptive-engine-v1-5-live-evidence.json`
- **Adaptive Engine v1.3 Simulation Evidence:** `.local/data/adaptive-engine-v1-3-evidence.json`
- **Benchmark Comparative Metrics:** `.local/benchmarks/optimization-benchmark.json`
- **Offline Evaluation Suite Report:** `.local/evaluation/report.json`
- **Resumed Task Evidence & Diffs:** `.proofbench/evidence/`
- **Context Continuity Documents:** `.proofbench/CONTEXT.md`
