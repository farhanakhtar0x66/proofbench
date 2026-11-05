# ProofBench — Judge & Evaluator Reproduction Guide (v1.3)

**Track Challenge:** Bifrost #01 — Coding Agent with Minimal Token Usage  
**Secondary Integration:** Tavily — Documentation Freshness & Source Verification  
**Repository:** `farhanakhtar0x66/proofbench`  
**Branch:** `feat/bifrost-01-proofbench`  
**PR:** [#27](https://github.com/farhanakhtar0x66/proofbench/pull/27) (**HOLD OPEN AND UNMERGED — DO NOT MERGE AUTOMATICALLY**)

---

## 1. System Overview & Evaluation Highlights

ProofBench demonstrates an **Adaptive Execution Engine (v1.3)** designed to autonomously coordinate non-LLM operations, small-model inference, and stronger-model reasoning within a single continuous coding project, minimizing total model token consumption while preserving or improving task correctness on complex coding benchmarks.

Key capabilities demonstrated in v1.3:
1. **Genuine Bidirectional Model Handoffs:** Autonomous dynamic trajectory across all execution tiers:
   `NON_LLM ➔ SMALL_LLM ➔ STRONGER_LLM ➔ SMALL_LLM ➔ NON_LLM`  
   Demonstrated on `task-9-bidirectional-event-service`, where the non-LLM tier prunes dead code at 0 tokens, the small model resolves CSV parsing, compiler borrow conflicts trigger diagnostic autopsy escalation to the stronger model, the stronger model resolves lifetime borrows and delegates the localized predicate filter back to the small model with bounded instructions, and the non-LLM runner verifies acceptance (all 4 integration tests pass).
2. **True Deterministic CPU Time Measurement:** Node.js kernel + user CPU duration measured via `process.cpuUsage()` deltas rather than wall-clock subtractions. Proves that deterministic AST context pruning, prompt compilation, and mechanical fixes consume only ~30–75 ms of true CPU time, while idle asynchronous network I/O consumes zero CPU cycles.
3. **Resilient Context Continuity Across Handoff Boundaries:** When the controller process is killed at Turn 3 during a pending `stronger_to_small` delegation, the durable JSONL checkpoint preserves `pendingBoundedInstructions`, accepted source revisions, and cumulative token counters. A fresh controller instance resumes immediately at Turn 4 with zero amnesia or replay hazards.
4. **Fair Controlled Routing Benchmarks:** Equalizes deterministic tooling (Tree-sitter AST Context Compiler, Mechanical Transformer, and Prompt Compiler) across all 4 benchmark arms (`controlled_direct_small`, `controlled_direct_frontier`, `controlled_escalation_only`, `controlled_bidirectional_adaptive`), isolating the exact token and latency savings contributed by routing policy from compiler tooling.
5. **UI Trace Data Contract for Aryan's Dashboard:** Stable TypeScript types and Zod schemas (`TierTransitionEventSchema`, `HandoffPacketExportSchema`, `AttributionBreakdownSchema`, `ControlledBenchmarkExportSchema`) exported from `@proofbench/contracts` for seamless frontend dashboard visualization.
6. **Stock Maxim Bifrost Gateway Integration:** Native client integration with the running Maxim Bifrost Gateway daemon (`http://127.0.0.1:8089`) with virtual key budget enforcement and routing telemetry.

---

## 2. Environment Prerequisites

- **Node.js:** `>= 22.12.0` (Native `process.loadEnvFile`, ES modules)
- **Rust Toolchain:** `cargo` and `rustc` installed and on `$PATH` (for offline acceptance compilation and test verification)
- **Package Manager:** `npm`

### Environment Configuration (`.env`)

Create or update `.env` in the repository root:

```bash
# Maxim Bifrost Gateway Daemon (Local or Remote)
BIFROST_GATEWAY_URL=http://127.0.0.1:8089

# Active Maxim Bifrost Virtual Key
BIFROST_VIRTUAL_KEY=sk-bf-your-virtual-key

# Optional: Tavily API Key for live documentation freshness searches
TAVILY_API_KEY=tvly-your-tavily-key
```

> **Note on Live vs. Simulated Modes:**  
> All tests and benchmarks can be executed out of the box in **Deterministic Simulation Mode** without needing a running Bifrost gateway or external LLMs. When `BIFROST_GATEWAY_URL` is accessible and `BIFROST_VIRTUAL_KEY` is provided, live gateway routing and real model inference are utilized.

---

## 3. Quickstart & Verification Commands

### Step 1: Run the Complete Quality & Test Gate

Runs ESLint (with `--max-warnings=0`), TypeScript compilation (`tsc --noEmit`), Vitest suite (**101 tests across 8 test files**), offline fixture regression tests (7/7 suites), and production builds for both the web frontend and API server:

```bash
npm run check
```

*Expected Result:*
- `101/101 tests passed` (100% pass across 8 test suites)
- `7/7 offline fixture regressions passed`
- `0 lint errors / warnings`
- `dist/web/` and `dist/api/` built cleanly

---

### Step 2: Run the Adaptive Execution Engine v1.3 Demonstration

Demonstrates the 6 core evidence pillars of the v1.3 milestone:
- **Pillar 1:** True Deterministic CPU Time Measurement (measures `process.cpuUsage()` deltas vs wall duration on `task-6` and `task-8` at **0 LLM tokens**).
- **Pillar 2:** Universal Context Continuity & Resumption (simulates controller process death at Turn 3 during a pending `STRONGER_LLM ➔ SMALL_LLM` delegation, restarts in fresh instance, and completes task).
- **Pillar 3:** Genuine Autonomous Bidirectional Multi-Tier Trajectory (`NON_LLM ➔ SMALL_LLM ➔ STRONGER_LLM ➔ SMALL_LLM ➔ NON_LLM` on `task-9-bidirectional-event-service`).
- **Pillar 4:** Fair Controlled Routing Benchmark (equalizes AST tools across all arms, isolating routing policy).
- **Pillar 5:** Adversarial Governance Enforcement (blocks fake claims, unjustified escalation, unbounded delegation, and confidential leaks).
- **Pillar 6:** UI Trace Contract & Schema Validation for Aryan's dashboard.
- **Live Gateway Verification:** Executes live probe against stock Bifrost Gateway daemon (`http://127.0.0.1:8089`).

```bash
# Full v1.3 demonstration with evidence artifact export
npm run demonstrate:adaptive:v1-3
```

*Generated Evidence Artifact:*  
The script automatically exports structured telemetry and trace evidence to:  
`.local/data/adaptive-engine-v1-3-evidence.json`

---

### Step 3: Run the Fair Controlled Routing Benchmark

Runs the controlled routing benchmark isolating routing policy from deterministic AST compiler tooling:

```bash
npm run benchmark:optimization -- --controlled --trials=1
```

*Key Results to Observe:*
- **Tooling Disclosed:** All arms receive identical Tree-sitter AST Context Compilers, Mechanical Transformers, and Prompt Compilers.
- **Controlled Direct Small:** 0% pass (fails on complex borrow lifetimes).
- **Controlled Direct Frontier:** High frontier token consumption on routine fixes.
- **Controlled Escalation Only:** Escalates to frontier, but cannot delegate localized tails downward.
- **Controlled Bidirectional Adaptive:** Achieves 100% pass rate with lowest token consumption per accepted completion via bounded tail delegation.

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

## 4. Architectural Verification Matrix

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

## 5. Artifact Inspection

All evidence produced during evaluation runs is saved to standard inspection locations:
- **Adaptive Engine v1.3 Live Evidence:** `.local/data/adaptive-engine-v1-3-evidence.json`
- **Adaptive Engine v1.2 Run Evidence:** `.local/data/adaptive-engine-v1-2-evidence.json`
- **Benchmark Comparative Metrics:** `.local/benchmarks/optimization-benchmark.json`
- **Offline Evaluation Suite Report:** `.local/evaluation/report.json`
- **Resumed Task Evidence & Diffs:** `.proofbench/evidence/`
- **Context Continuity Documents:** `.proofbench/CONTEXT.md`
