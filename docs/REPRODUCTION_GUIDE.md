# ProofBench — Judge & Evaluator Reproduction Guide (v1.4)

**Track Challenge:** Bifrost #01 — Coding Agent with Minimal Token Usage  
**Secondary Integration:** Tavily — Documentation Freshness & Source Verification  
**Repository:** `farhanakhtar0x66/proofbench`  
**Branch:** `feat/bifrost-01-proofbench`  
**PR:** [#27](https://github.com/farhanakhtar0x66/proofbench/pull/27) (**HOLD OPEN AND UNMERGED — DO NOT MERGE AUTOMATICALLY**)

---

## 1. System Overview & Evaluation Highlights

ProofBench implements an **Adaptive Execution Engine (v1.4)** designed to minimize total model token consumption on complex coding benchmarks while preserving or improving task correctness by dynamically transitioning between:

`NON_LLM ⇄ SMALL_LLM ⇄ STRONGER_LLM`

### Scientific Integrity & Two Distinct Evaluation Modes

In accordance with empirical evidence standards, v1.4 explicitly separates **simulated state-machine regression tests** from **strict live model evaluations**:

1. **Deterministic State Machine Simulation Suite (`npm run demonstrate:adaptive:v1-3`):**  
   Uses an `EmbeddedBifrostGateway` with deterministic mock response handlers to evaluate host controller state-machine invariants, Tree-sitter AST context compilation, mechanical transformation rules, durable checkpoint serialization, adversarial attack defenses, and universal handoff protocol parsing.

2. **Strict Live Multi-Model Inference Suite (`npm run demonstrate:adaptive:v1-4:live`):**  
   Requires a live running Maxim Bifrost gateway daemon (`http://127.0.0.1:8089`) with authenticated `BIFROST_VIRTUAL_KEY`, local Qwen 1.5B (`Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M`), and local Qwen 9B (`gguf/Qwen3.5-9B-GGUF:Q4_K_M`). Prohibits all mock gateways, synthetic token counts, and prewritten code patches. All responses, tokens, latencies, and patches are produced live by the models and local servers.

---

## 2. Key Capabilities Demonstrated in v1.4

1. **Non-LLM 0-Token Resolution:** Guaranteed compiler-guided mechanical fixes applied in the non-LLM tier (e.g. `task-6-deterministic-fix`), resolving compiler diagnostics at exactly **0 LLM tokens** (74 ms kernel+user CPU time measured via `process.cpuUsage()`).
2. **Live Small Model Inference & Non-LLM Verification:** Routine coding tasks (`task-1-fix-failing-func`) executed live through the stock Bifrost gateway by local Qwen 1.5B, completing in 1 turn with 1,407 prompt tokens and 193 completion tokens, verified by independent `cargo test`.
3. **Live Natural Multi-Module Trajectory:** Complex tasks (`task-9-bidirectional-event-service`) executed with live models. When initial localized patches produce stagnating diagnostics, the engine autonomously triggers M3a autopsy escalation to the 9B model, logging real provider token consumption (3,812 input tokens, 282 output tokens).
4. **Live Checkpoint Interruption & Resumption:** Controller process killed at Turn 1; state, accepted patches, and `CONTEXT.MD` survive on disk. A completely fresh controller instance resumes from disk checkpoint using live Bifrost inference and finishes execution without amnesia or repeated work.
5. **Fair Equalized Controlled Routing Benchmark:** All 4 benchmark arms (`controlled_direct_small`, `controlled_direct_frontier`, `controlled_escalation_only`, `controlled_bidirectional_adaptive`) execute on the identical `AdaptiveExecutionEngine` runtime with shared Tree-sitter AST context compilers, mechanical transformers, and prompt compilers, isolating the pure effect of routing policy. Hardcoded attribution constants have been completely removed in favor of measured empirical deltas and explicit `null` unisolated flags.
6. **UI Trace Data Contract Validation:** Stable TypeScript contracts and Zod schemas (`TierTransitionEventSchema`, `HandoffPacketExportSchema`, `AttributionBreakdownSchema`, `ControlledBenchmarkExportSchema`) validated against all exported telemetry.

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

Runs ESLint (`--max-warnings=0`), TypeScript compilation (`tsc --noEmit`), Vitest suite (**101 tests across 8 test files**), offline fixture regression tests (7/7 suites), and production builds for both the web frontend and API server:

```bash
npm run check
```

*Expected Result:*
- `101/101 tests passed` (100% pass rate across 8 test suites)
- `7/7 offline fixture regressions passed`
- `0 lint errors / warnings`
- `dist/web/` and `dist/api/` built cleanly

---

### Step 2: Run the Strict Live Multi-Model Demonstration (v1.4)

Executes genuine live multi-model inference through the Maxim Bifrost gateway with real local Qwen models:

```bash
npm run demonstrate:adaptive:v1-4:live
```

*Key Live Invariants Verified:*
- **Preflight:** Verifies gateway `/health` and model availability (`Qwen 1.5B` and `Qwen 9B`).
- **Pillar 1:** Solves `task-6` at **0 LLM tokens** (74 ms CPU).
- **Pillar 2:** Solves `task-1` live via Qwen 1.5B (1,407 input tokens, 193 output tokens, 1 turn).
- **Pillar 3:** Executes multi-module `task-9` through Bifrost with real provider usage (3,812 input tokens, 282 output tokens, M3a autopsy escalation recorded).
- **Pillar 4:** Halts live process at Turn 1, verifies disk checkpoint and `CONTEXT.MD`, and resumes via fresh instance.
- **Pillar 5:** Runs equalized controlled benchmark across all 4 routing policies through live Bifrost and validates telemetry against Zod contract schema.

*Generated Live Artifact:*  
`.local/data/adaptive-engine-v1-4-live-evidence.json`

---

### Step 3: Run the Deterministic State Machine Simulation Suite (v1.3)

Evaluates state-machine invariants, AST pruning, and persistence under controlled mock gateway responses:

```bash
npm run demonstrate:adaptive:v1-3
```

*Generated Simulation Artifact:*  
`.local/data/adaptive-engine-v1-3-evidence.json`

---

### Step 4: Run the Adversarial Governance Suite

Directly executes the 10-attack security and governance invariant test suite:

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

---

## 5. Architectural Verification Matrix

| Component / Subsystem | Test Suite | Verified Invariant |
| :--- | :--- | :--- |
| **Adaptive Execution Engine** | `tests/adaptive-engine.test.ts` | Scenarios A–G: 0-token fixes, small model routing, direct complex routing, M3a autopsy escalation, bounded small model delegation, crash resumption, and genuine bidirectional routing on `task-9`. |
| **Adversarial Governance** | `tests/adversarial-governance.test.ts` | 10 adversarial attacks verified: fake verification rejection, anti-privilege escalation, confidential mode loopback enforcement, budget halts. |
| **Persistence & Continuity** | `tests/persistence.test.ts` | Atomic JSONL event append, schema validation, checkpoint restoration across inter-tier handoffs, external git revision drift detection, and diagnostic log preservation. |
| **Routing & Registry** | `tests/routing.test.ts` | Model tier defaults, verified loopback destinations (`127.0.0.1`), capability descriptors, and proposal validation. |
| **AST Context Compiler** | `tests/compiler.test.ts` | Tree-sitter symbol graph extraction, transitive call graph traversal, token budgeting, and mechanical transform formatting. |
| **UI Trace Contracts** | `tests/contracts.test.ts` | Zod schema validation for trace events, handoff exports, attribution breakdown, and controlled benchmark exports. |
| **Bifrost Client & Failover** | `tests/bifrost-01.test.ts` | Virtual key pre-flight allowance checks, default-deny workspace approvals, rate limit retries, and M2 oscillation loop halts. |

---

## 6. Artifact Inspection

All evidence produced during evaluation runs is saved to standard inspection locations:
- **Adaptive Engine v1.4 Live Evidence:** `.local/data/adaptive-engine-v1-4-live-evidence.json`
- **Adaptive Engine v1.3 Simulation Evidence:** `.local/data/adaptive-engine-v1-3-evidence.json`
- **Benchmark Comparative Metrics:** `.local/benchmarks/optimization-benchmark.json`
- **Offline Evaluation Suite Report:** `.local/evaluation/report.json`
- **Resumed Task Evidence & Diffs:** `.proofbench/evidence/`
- **Context Continuity Documents:** `.proofbench/CONTEXT.md`
