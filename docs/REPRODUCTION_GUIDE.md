# ProofBench — Judge & Evaluator Reproduction Guide (v1.2)

**Track Challenge:** Bifrost #01 — Coding Agent with Minimal Token Usage  
**Secondary Integration:** Tavily — Documentation Freshness & Source Verification  
**Repository:** `farhanakhtar0x66/proofbench`  
**Branch:** `feat/bifrost-01-proofbench`  
**PR:** [#27](https://github.com/farhanakhtar0x66/proofbench/pull/27) (Hold Open and Unmerged)

---

## 1. System Overview & Evaluation Highlights

ProofBench demonstrates an **Adaptive Execution Engine (v1.2)** designed to autonomously coordinate non-LLM operations, small-model inference, and stronger-model reasoning within a single continuous coding project, minimizing total model token consumption while preserving or improving task correctness on complex coding benchmarks.

Key capabilities demonstrated:
1. **Dynamic Multi-Tier Execution:** Autonomous transitions across `NON_LLM ↔ SMALL_LLM ↔ STRONGER_LLM`. Deterministic non-LLM routines handle repository analysis, syntax tree parsing, unused import pruning, variable prefixing, and verification at **0 LLM tokens**.
2. **Resilient Context Continuity:** Durable JSONL event sourcing, atomic checkpoints, and `CONTEXT.md` sync ensure seamless recovery across process interruption and controller restarts without amnesia, replay hazards, or unverified hallucinations.
3. **Autonomous Bidirectional Handoffs:** Verified live multi-tier execution where `STRONGER_LLM` delegates bounded subtasks to `SMALL_LLM` via universal handoff packets, and `SMALL_LLM` escalates architectural roadblocks back to `STRONGER_LLM` via verified diagnostic autopsy.
4. **Adversarial Governance & Security Invariants:** Enforces default-deny on shell and git actions, prevents path traversal, blocks non-local destinations under `confidential: true`, halts on budget exhaustion, and detects multi-tier oscillation loops.
5. **Honest Full-Trial Token Accounting:** Missing provider usage is explicitly preserved as `missing` (never fabricated as zero); avoided model invocations are recorded as `known: 0 tokens`; and multi-trial efficiency metrics compute total tokens across all trials divided by accepted completions (`totalTokensPerAcceptedCompletion`).

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

Runs ESLint (with `--max-warnings=0`), TypeScript compilation (`tsc --noEmit`), Vitest suite (**98 tests across 8 test files**), offline fixture regression tests (7/7 suites), and production builds for both the web frontend and API server:

```bash
npm run check
```

*Expected Result:*
- `98/98 tests passed` (100% pass across 8 test suites)
- `7/7 offline fixture regressions passed`
- `0 lint errors / warnings`
- `dist/web/` and `dist/api/` built cleanly

---

### Step 2: Run the Adaptive Execution Engine v1.2 Demonstration

Demonstrates the 5 core evidence pillars of the v1.2 milestone:
- **Pillar 1 (Phase 4):** Non-LLM-First Efficiency (resolves `task-6` unused imports and `task-8` unused variable prefixing at **0 LLM tokens** via mechanical AST transformations).
- **Pillar 2 (Phase 3):** Universal Context Continuity & Resumption (simulates sudden controller death mid-task, restores checkpoint state, verifies external git revision hashes, and completes successfully).
- **Pillar 3 (Phase 2):** Autonomous Multi-Tier Pipeline Execution on `task-7-adaptive-pipeline` via live Maxim Bifrost Gateway.
- **Pillar 4 (Phase 6):** Adversarial Governance Enforcement (blocks fake claims, unjustified escalation, unbounded delegation, and confidential leaks).
- **Pillar 5 (Phase 5):** Six-Configuration Comparative Benchmark across frozen tasks.

```bash
# Full demonstration with evidence artifact export
npm run demonstrate:adaptive:v1-2
```

*Generated Evidence Artifact:*  
The script automatically exports structured telemetry and trace evidence to:  
`.local/data/adaptive-engine-v1-2-evidence.json`

---

### Step 3: Run the Adversarial Governance Suite

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

### Step 4: Run the Deterministic Inference Optimization Benchmark

Evaluates all 8 frozen tasks across 6 architectural configurations:
1. **Direct Small Model:** (Qwen 1.5B, unbounded, no escalation).
2. **Direct Stronger Model:** (Qwen 3.5 9B, frontier only).
3. **Governed Baseline:** (Regex M1, M2 loop breaker, M3a autopsy escalation).
4. **Governed Context/Prompt Compiler:** (AST context compiler v2 + prompt compiler v2).
5. **Governed Compiler + Model Selector:** (Evidence-based model selection strategy).
6. **Adaptive Execution Engine v1.2:** (Non-LLM first + dynamic bidirectional tiers + universal handoffs).

```bash
npm run benchmark:optimization
```

*Key Results to Observe:*
- **Task 6 & Task 8 (Deterministic Fixes):** Baselines 1–5 fail (0% pass rate), while ProofBench achieves **100% pass rate at 0 LLM tokens**.
- **Multi-File Tasks (Tasks 3, 5, 7):** ProofBench reduces prompt token footprint by **60–85%** compared to Baseline 1 full repo dumps.
- **Flakiness Accounting:** ProofBench records `totalTokensPerAcceptedCompletion` taking failed retry tokens into account.

---

## 4. Architectural Verification Matrix

| Component / Subsystem | Test Suite | Verified Invariant |
| :--- | :--- | :--- |
| **Adaptive Execution Engine** | `tests/adaptive-engine.test.ts` | Scenarios A–F: 0-token fixes, small model routing, direct complex routing, M3a autopsy escalation, bounded small model delegation, and crash resumption. |
| **Adversarial Governance** | `tests/adversarial-governance.test.ts` | 10 adversarial attacks verified: fake verification rejection, anti-privilege escalation, confidential mode loopback enforcement, budget halts. |
| **Persistence & Continuity** | `tests/persistence.test.ts` | Atomic JSONL event append, schema validation, checkpoint restoration, external git revision drift detection, and diagnostic log preservation. |
| **Routing & Registry** | `tests/routing.test.ts` | Model tier defaults, verified loopback destinations (`127.0.0.1`), capability descriptors, and proposal validation. |
| **AST Context Compiler** | `tests/compiler.test.ts` | Tree-sitter symbol graph extraction, transitive call graph traversal, token budgeting, and mechanical transform formatting. |
| **Bifrost Client & Failover** | `tests/bifrost-01.test.ts` | Virtual key pre-flight allowance checks, default-deny workspace approvals, rate limit retries, and M2 oscillation loop halts. |

---

## 5. Artifact Inspection

All evidence produced during evaluation runs is saved to standard inspection locations:
- **Adaptive Engine v1.2 Live Run Evidence:** `.local/data/adaptive-engine-v1-2-evidence.json`
- **Benchmark Comparative Metrics:** `.local/benchmarks/optimization-benchmark.json`
- **Offline Evaluation Suite Report:** `.local/evaluation/report.json`
- **Resumed Task Evidence & Diffs:** `.proofbench/evidence/`
- **Context Continuity Documents:** `.proofbench/CONTEXT.md`
