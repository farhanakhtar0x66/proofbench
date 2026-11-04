# ProofBench — Judge & Evaluator Reproduction Guide

**Track Challenge:** Bifrost #01 — Coding Agent with Minimal Token Usage  
**Secondary Integration:** Tavily — Documentation Freshness & Source Verification  
**Repository:** `farhanakhtar0x66/proofbench`  
**Branch:** `feat/bifrost-01-proofbench`  
**PR:** [#27](https://github.com/farhanakhtar0x66/proofbench/pull/27)

---

## 1. System Overview & Evaluation Highlights

ProofBench demonstrates an **Adaptive Execution Engine (v1.1)** designed to minimize total model token consumption while preserving or improving task correctness on complex coding benchmarks.

Key capabilities demonstrated:
1. **Dynamic Multi-Tier Execution:** Fluid transitions across `NON_LLM ↔ SMALL_LLM ↔ STRONGER_LLM`. Deterministic non-LLM routines handle repository analysis, syntax tree parsing, unused import pruning, formatting, and verification at **0 LLM tokens**.
2. **Resilient Context Continuity:** Durable JSONL event sourcing, atomic checkpoints, and `CONTEXT.md` sync ensure seamless recovery across process interruption and controller restarts without amnesia or hallucinated state.
3. **Verified Bifrost Gateway Governance:** Real-time routing via Maxim Bifrost Gateway with virtual key budgets, automatic provider failover, strict local loopback confidentiality boundaries, and task-scoped host approval enforcement.
4. **Honest Full-Trial Token Accounting:** Missing provider usage is explicitly preserved as `missing` (never fabricated as zero); avoided model invocations are recorded as `known: 0 tokens`; and multi-trial efficiency metrics compute total tokens across all trials divided by accepted completions (`totalTokensPerAcceptedCompletion`).

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

Runs ESLint (with `--max-warnings=0`), TypeScript compilation, Vitest suite (87 tests across 7 test files), offline fixture regression tests (7/7 suites), and production builds for both the web frontend and API server.

```bash
npm run check
```

*Expected Result:*
- `87/87 tests passed` (100% pass)
- `7/7 offline fixture regressions passed`
- `0 lint errors / warnings`
- `dist/web/` and `dist/api/` built cleanly

---

### Step 2: Run the Adaptive Execution Engine v1.1 Demonstration

Demonstrates the three core pillars of the v1.1 milestone:
- **Part 1:** Independent Deterministic Execution (resolves `#![deny(unused_imports)]` compilation errors at **0 LLM tokens** using mechanical AST transformations).
- **Part 2:** Universal Context Continuity & Resumption (simulates sudden controller crash mid-task, restores checkpoint state, verifies external git revision hashes, and completes successfully).
- **Part 3:** Live Gateway Routing & Bidirectional Model Handoffs (verifies Qwen 1.5B single-file resolution, Qwen 3.5 9B multi-file allocation, and transition proposal validation).

```bash
# Auto mode (uses Live Bifrost Gateway if online, otherwise simulation)
npm run demonstrate:adaptive

# Force Live mode against local Bifrost daemon
npm run demonstrate:adaptive -- --live
```

*Generated Evidence Artifact:*  
The script automatically exports structured telemetry and trace evidence to:  
`.local/data/adaptive-engine-v1-1-evidence.json`

---

### Step 3: Run the Deterministic Inference Optimization Benchmark

Evaluates all 6 frozen tasks across 6 architectural configurations:
1. **Baseline 1:** Full unpruned codebase in prompt.
2. **Baseline 2:** Naive unified diff without symbol ranking.
3. **Baseline 3:** Naive sliding window truncation.
4. **Baseline 4:** Small Model direct (Qwen 1.5B, no governance).
5. **Baseline 5:** Stronger Model direct (Qwen 3.5 9B).
6. **ProofBench Adaptive Engine:** Context Compiler v2 + Prompt Compiler v2 + Non-LLM execution + M2/M3a Autopsy.

```bash
npm run benchmark:optimization
```

*Key Results to Observe:*
- **Task 6 (Deterministic Fix):** Baselines 1–5 fail (0% pass rate), while ProofBench achieves **100% pass rate at 0 LLM tokens** (1,407 ms deterministic CPU execution).
- **Multi-File Tasks (Tasks 3 & 5):** ProofBench reduces prompt token footprint by **60–85%** compared to Baseline 1 full repo dumps.
- **Flakiness Accounting:** ProofBench records `totalTokensPerAcceptedCompletion` taking failed retry tokens into account.

---

### Step 4: Verify Failover & Security Controls

#### A. Bifrost Provider Outage & Failover
Tests how ProofBench and the Maxim Bifrost Gateway respond when primary upstreams return HTTP 503 / 429:

```bash
# Real stock Bifrost gateway fallback test (requires Bifrost daemon)
npm run test:real-failover

# Simulated fault-injection test (isolated offline verification)
npm run test:failover
```

#### B. Tavily Documentation Freshness Verification
Verifies the integration of Tavily live search to detect deprecated crate APIs (e.g., deprecated features in Task 4):

```bash
npm run test:freshness
```

---

## 4. Architectural Verification Summary

| Component | Test File | Key Coverage |
| :--- | :--- | :--- |
| **Deterministic Engine** | `tests/adaptive-engine.test.ts` | Scenarios A–F: 0-token fixes, small model routing, direct complex routing, M3a autopsy escalation, bounded small model delegation, and crash resumption. |
| **Persistence & Continuity** | `tests/persistence.test.ts` | Atomic JSONL event append, schema validation, checkpoint restoration, external git revision drift detection, and diagnostic log preservation. |
| **Routing & Governance** | `tests/routing.test.ts` | Anti-privilege escalation, confidential-mode local loopback destination checks (`127.0.0.1`), budget limits, and diagnostic evidence validation. |
| **AST Context Compiler** | `tests/compiler.test.ts` | Tree-sitter symbol graph extraction, transitive call graph traversal, token budgeting, and mechanical transform formatting. |
| **Bifrost Client & Failover**| `tests/bifrost-01.test.ts` | Virtual key pre-flight allowance checks, default-deny workspace approvals, rate limit retries, and M2 oscillation loop halts. |

---

## 5. Artifact Inspection

All evidence produced during evaluation runs is saved to standard inspection locations:
- **Adaptive Engine v1.1 Live Run Evidence:** `.local/data/adaptive-engine-v1-1-evidence.json`
- **Benchmark Comparative Metrics:** `.local/benchmarks/optimization-benchmark.json`
- **Offline Evaluation Suite Report:** `.local/evaluation/report.json`
- **Resumed Task Evidence & Diffs:** `.proofbench/evidence/`
- **Context Continuity Documents:** `.proofbench/CONTEXT.md`
