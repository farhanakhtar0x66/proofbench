# ProofBench — Deterministically Governed Coding Agent

> **Global AI Hackathon — Bifrost #01 + Tavily Stale-Answer Detector**  
> Repository: `farhanakhtar0x66/proofbench`  
> Target: **Bifrost #01 (Minimal Token Usage Coding Agent)** + **Tavily Freshness Verification**

ProofBench is a deterministically governed coding agent that combines:
1. **Maxim AI Bifrost** as the enterprise model gateway (hierarchical virtual-key budgets, fail-closed confidential routing, and resilient multi-provider failover).
2. **Governed Execution Loop** (clean-room TypeScript implementation of deterministic symbol context bounding, repeated-failure stagnation detection, and evidence-only diagnostic autopsy escalation).
3. **Tavily Freshness Verification** (pre-execution claim extraction, documentation freshness checking, temporal source attribution, and confidential query blocking).

---

## Quick Start & Verification for Judges

Every benchmark, failover scenario, and freshness test can be run reproducibly with single npm commands.

### Prerequisites

- **Node.js 22.12+**
- **Rust / Cargo** (`cargo` on PATH for running independent acceptance test suites)

```bash
npm ci
cp .env.example .env
npm run check             # Full verification: ESLint, TypeScript, Vitest (36 tests), Fixture regressions, Build
```

### Reproducible Demonstration Commands

| Command | Target / Component Verified | Output Artifact |
| --- | --- | --- |
| `npm run test:real-failover` | **Real Bifrost Gateway Failover**: Real stock Maxim Bifrost gateway daemon (`v2.4.0`), injected HTTP 503 & 429 upstream outages, automatic gateway failover, trace provenance, end-to-end task completion | `.local/data/real-bifrost-failover-evidence.json` |
| `npm run test:failover` | **Simulated Fault-Injection Tests**: Contract & policy regression tests using in-process simulator for offline CI verification | `.local/data/bifrost-failover-evidence.json` |
| `npm run test:freshness` | **Tavily Freshness Comparative Verification**: Task 4 `#![deny(deprecated)]` without prompt solution leakage; Trial A (without Tavily: fails compiler check) vs. Trial B (with Tavily: passes on turn 1) | `.local/data/tavily-freshness-evidence.json` |
| `npm run benchmark:strategies` | **3-Strategy Efficiency Benchmark**: Compares Direct Small (1.5B), Direct Frontier (9B), and Governed Escalation across frozen tasks with repeated trials (`--live` or `--simulation`) | `.local/data/strategy-benchmark-evidence.json` |
| `npm run benchmark:optimization` | **Deterministic Optimization Suite**: Evaluates 5 configurations & component ablations across 5 tasks including held-out bloated codebase (Task 5) | `.local/data/optimization-benchmark-evidence.json` |
| `npm run demonstrate:bifrost` | **Full Agent Demonstration**: Runs all frozen tasks on live Bifrost gateway (if online) and verified deterministic simulation suite | `.local/data/demonstration-evidence.json` |
| `npm run test:contracts` | **Cross-Package Schema Verification**: Validates Zod v1 contracts across agent traces, run records, and verification reports | CLI assertion output |

---

## Architectural Distinctions

A key architectural contribution of ProofBench is the clean technical separation between transport-layer provider resilience and cognitive-layer model escalation:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ProofBench Architecture                         │
└────────────────────────────────────────────────────────────────────────┘

  Task Prompt & Workspace
            │
            ▼
  ┌───────────────────┐     Confidential?
  │ Tavily Verifier   │ ──► [YES] ──► Block external query (protect IP)
  └───────────────────┘     [NO]  ──► Query docs, verify deprecations/freshness
            │
            ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Agent Execution Controller                                           │
  │  - M1: Symbol Context Bounding (max 1,200 tokens)                    │
  │  - Approval Engine: Explicit Host Prior Grants / Strict Path Checks  │
  └──────────────────────────────────────────────────────────────────────┘
            │
            ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Maxim AI Bifrost Gateway                                             │
  │  - Virtual Key Budget Tracking ($0.05 pre-reservation)               │
  │  - Confidential Loopback Enforcer (127.0.0.1 only, no cloud routing) │
  └──────────────────────────────────────────────────────────────────────┘
            │
            ├─► [Network/Provider Outage: 503 / 429]
            │     └──► Transport Failover: Route exact turn to backup provider
            │          (e.g., local -> opencode). Model remains unchanged.
            │          Trace event: "Bifrost fallback routing triggered".
            ▼
  Primary Model Generates Edit (e.g., Qwen 1.5B)
            │
            ▼
  Apply Patch & Run Independent `cargo test` in Isolated Workspace
            │
            ├─► [Tests Pass] ──► Task Completed Cleanly
            │
            └─► [Tests Fail Repeatedly / M2 Loop Breaker Triggers]
                  └──► Cognitive Escalation (M3a Autopsy):
                       1. Halt primary model loop (prevent infinite token burn).
                       2. Synthesize Evidence-Only Autopsy (compiler errors + failed diffs).
                       3. Enforce 2,000 token autopsy budget (progressive reduction).
                       4. Dispatch autopsy to Frontier Recovery Model (Qwen 9B).
                       5. Recovery model repairs code; final tests verify clean pass.
```

### 1. Provider Outage Failover (Infrastructure Transport Layer)
- **Trigger**: Network disruption, HTTP 503 Service Unavailable, or HTTP 429 Rate Limit from primary provider daemon.
- **Mechanism**: Bifrost transparently re-routes the request turn to an authorized backup provider (`opencode`).
- **Telemetry**: Header `x-bifrost-routing-info-is-fallback: true`, provider attributed in trace event, user notified of provider switch.
- **Integrity**: Virtual-key spending and confidential routing constraints remain strictly enforced.

### 2. M3a Failure Autopsy Escalation (Cognitive Agent Layer)
- **Trigger**: Model generates logically invalid code, compiler rejects patch, or M2 Loop Breaker detects edit stagnation/oscillation.
- **Mechanism**: Agent controller halts, synthesizes structured evidence-only autopsy (compiler diagnostics + failed patches), compacts to budget, and dispatches to high-capacity frontier recovery model.
- **Telemetry**: Trace records M2 halt, autopsy generation, and tags each turn with the executing model name (`model: currentModel`, `isRecovery: true`).

---

## 3-Strategy Comparative Benchmarking

To prove that governed escalation is token-efficient compared to frontier-only execution without sacrificing capability, ProofBench provides an automated multi-strategy benchmark suite:

| Strategy | Architecture | Primary Model | Recovery / Escalation | Intended Use Case |
| --- | --- | --- | --- | --- |
| **Strategy 1: Direct Small** | Single-model baseline | Qwen 2.5 Coder 1.5B | None (fails if 1.5B fails) | Lowest token cost; high failure rate on multi-file / complex logic |
| **Strategy 2: Direct Frontier** | Frontier-only baseline | Qwen 3.5 9B | None (always uses frontier model) | High success rate; maximum token & compute consumption |
| **Strategy 3: Governed Escalation** | ProofBench Governed Agent | Qwen 2.5 Coder 1.5B | Qwen 3.5 9B (escalates only via M3a autopsy on failure) | Near-frontier success rate with small-model token baseline |

### Summary of Live Benchmark Results Across Frozen Tasks

- **Task 1 (Fix off-by-one sliding window bug)**:
  - Direct 1.5B: **100% success** (714 avg tokens, 2.8s duration).
  - Direct 9B: **100% success** (1,086 avg tokens, 19.0s duration).
  - Governed Escalation: **100% success** without needing escalation (719 avg tokens, 3.2s duration).
  - **Efficiency Gain**: Governed agent achieved **33.8% token savings** and ran **83.0% faster** than the frontier model.
- **Task 2 (Implement exponential backoff retry calculation)**:
  - Direct 1.5B (no escalation): **0% success (0/2)** — small model failed acceptance checks.
  - Direct 9B (frontier only): **100% success (2/2)** (3,700 avg tokens, 57.5s duration).
  - Governed Escalation: **100% success (2/2)** (8,085 avg tokens, 83.3s duration, 2 model switches).
  - **Resilience**: Governed tiering converted a **0% failure into 100% success** via M2 failure detection and M3a structured diagnostic handoff to Qwen 9B.
- **Task 3 (Multi-file regression across parser & sink)**:
  - Direct 1.5B: 100% success (2,899 avg tokens, 6.4s duration).
  - Direct 9B: 100% success (2,179 avg tokens, 25.9s duration).
  - Governed Escalation: Governed agent uses recursive context discovery across all workspace `.rs` files.
- **Task 4 (Version freshness & deprecation avoidance under `#![deny(deprecated)]`)**:
  - Prompt contains **no solution leakage** (`std::hint::spin_loop` removed; only outdated claim provided).
  - **Trial A (Without Tavily)**: FAILED. Small model attempted private/stale functions and failed `cargo test` under `#![deny(deprecated)]`.
  - **Trial B (With Tavily)**: COMPLETED cleanly on Attempt 1. Tavily extracted the claim, marked `spin_loop_hint` as `CONTRADICTED (STALE)`, provided the modern documentation excerpt, and the model used `std::hint::spin_loop`.

---

## Deterministic Inference Optimization Layer

To reduce total model token consumption while preserving or improving task correctness, ProofBench incorporates an independently implemented, **zero-LLM deterministic optimization layer**:

```
┌────────────────────────────────────────────────────────────────────────┐
│             Deterministic Inference Optimization Pipeline              │
└────────────────────────────────────────────────────────────────────────┘

  Workspace Source Files
             │
             ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Phase A: Context Compiler                                            │
  │  - Web-Tree-Sitter Rust AST Parser (resilient lexical fallback)      │
  │  - Discovers symbols across src/, tests/, and submodules             │
  │  - Relevance scoring: matches prompt keywords, types, & diagnostics  │
  │  - Exact BPE token counting (gpt-tokenizer)                          │
  │  - Structured Omission Ledger (reason, token cost, mandatory status) │
  │  - Safe budget expansion up to maxExpandedBudget                     │
  └──────────────────────────────────────────────────────────────────────┘
             │
             ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Phase B: Deterministic Prompt Compiler                               │
  │  - Zero LLM rewriting: 100% deterministic TypeScript template        │
  │  - Semantic XML Trust Boundaries:                                    │
  │      <trusted_task_specification>                                    │
  │      <trusted_diagnostic_verification>                               │
  │      <workspace_context>                                             │
  │      <untrusted_external_evidence>                                   │
  │      <output_directive>                                              │
  │  - Diagnostics Deduplication: prunes superseded compiler errors      │
  └──────────────────────────────────────────────────────────────────────┘
             │
             ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Phase D: Evidence-Based Model Selection Policy                       │
  │  - Evaluates observable engineering features (files, borrow checker  │
  │    diagnostics, complexity, tokens, failure history)                 │
  │  - Interpretable rules (zero task-id hardcoding / answer keys)       │
  │  - Strategies: direct_small, bounded_escalation, direct_frontier     │
  └──────────────────────────────────────────────────────────────────────┘
             │
             ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Phase C: Incremental Edits & Workspace Revisions                     │
  │  - File & Composite Workspace SHA-256 revision hashing               │
  │  - Supports full-file mode & search-and-replace patches              │
  │  - Validates exact matches and rejects stale revision conflicts      │
  │  - Default-deny Host Approval Engine enforcement                     │
  └──────────────────────────────────────────────────────────────────────┘
```

---

## Adaptive Execution Engine v1 (Non-LLM-First & Dynamic Model Tiers)

Extending the optimization layer into an active runtime controller, **Adaptive Execution Engine v1** unifies deterministic tools and model tiers under a single host-governed state machine:

$$\text{NON\_LLM} \longleftrightarrow \text{SMALL\_LLM} \longleftrightarrow \text{STRONGER\_LLM}$$

### Core Design Principles

1. **Zero LLM Orchestrator**: The host deterministic TypeScript controller is the sole transition authority. No meta-LLMs or autonomous sub-agents make state decisions.
2. **Non-LLM as the Default Tier**: The engine begins in `NON_LLM`. If repository analysis or compiler-guided mechanical fixes can resolve the issue, 0 LLM tokens are consumed.
3. **Universal Project Memory via `CONTEXT.MD`**: Stored at the workspace root in human-readable Markdown across 11 standardized sections:
   - `Project Identity`, `Original Requirements`, `Project Architecture`, `Active Task`, `Accepted Decisions`, `Verified Progress`, `Known Failures`, `Next Action`, `Evidence References`, and `Checkpoint`.
   - `CONTEXT.MD` is a project-state snapshot, not an authority over host policies. Host policy engines, budgets, and confidentiality gates are strictly authoritative.
4. **Durable State Storage (`.proofbench/`)**:
   - `state.json`: current phase, tier, source revision, turn count, token accounting.
   - `events.jsonl`: append-only structured audit ledger.
   - `checkpoints/`: atomic snapshots enabling seamless process restart recovery.
   - `patches/` and `evidence/`: archived diffs and raw compiler verification artifacts.
   - Interrupted-write protection via atomic temporary file renaming and orphan `.tmp` cleanup.
5. **Bidirectional Tier Routing Protocol**:
   - `NON_LLM ➔ SMALL_LLM`: routine single-file coding tasks.
   - `NON_LLM ➔ STRONGER_LLM`: direct routing on multi-file dependency or borrow/lifetime hazards.
   - `SMALL_LLM ➔ STRONGER_LLM`: escalation via compact M3a failure autopsy packet on stagnation.
   - `STRONGER_LLM ➔ SMALL_LLM`: delegation of localized implementation with bounded guidance.
   - `ANY ➔ NON_LLM`: mandatory independent compiler verification after every patch.
6. **Oscillation Detection**: Blocks unproductive ping-pong between tiers on stagnant failure signatures and triggers `HALT` to prevent budget waste.

```
┌────────────────────────────────────────────────────────────────────────┐
│            Adaptive Execution Engine v1 — 12-Phase Lifecycle           │
└────────────────────────────────────────────────────────────────────────┘

  [ADMISSION] ──► [LOAD_CONTEXT] ──► [ANALYZE] ──► [PREPARE]
                                                      │
  ┌───────────────────────────────────────────────────┘
  ▼
  [SELECT_TIER] ──► [INFER_OR_EXECUTE] ──► [VALIDATE] ──► [APPROVAL]
                                                             │
  ┌──────────────────────────────────────────────────────────┘
  ▼
  [VERIFY] ──► [CHECKPOINT] ──► [DECIDE] ──► [COMPLETE / HALT]
```

### Verified Acceptance Scenarios (A through F)

All 6 acceptance test scenarios are proven in reproducible unit and integration tests (`tests/adaptive-engine.test.ts`):

| Scenario | Path / Transition Sequence | Mechanism Proven | Verified Outcome |
| --- | --- | --- | --- |
| **Scenario A** | `NON_LLM ➔ VERIFIED` | Zero-LLM resolution: compiler-guided mechanical fix / baseline verification | **0 LLM Tokens**, 100% test pass, `CONTEXT.MD` generated |
| **Scenario B** | `NON_LLM ➔ SMALL_LLM ➔ NON_LLM` | Routine single-file task routing and completion | Economical token baseline, verified pass |
| **Scenario C** | `NON_LLM ➔ STRONGER_LLM ➔ NON_LLM` | Multi-module high complexity directly routed to frontier tier | Bypasses small-model failure on multi-file task |
| **Scenario D** | `SMALL_LLM ➔ STRONGER_LLM ➔ NON_LLM` | M2 loop breaker triggers M3a structured diagnostic autopsy escalation | Failure converted to 100% verified pass |
| **Scenario E** | `STRONGER_LLM ➔ SMALL_LLM ➔ NON_LLM` | Architectural reasoning delegates to small model with bounded instructions | Model transition proposal parsed & validated by host |
| **Scenario F** | `MULTI-TIER WITH RESTART` | Engine process killed between turns; resumes from `.proofbench/` checkpoint | Resumption verified without relying on git commits |

```bash
npx vitest run tests/adaptive-engine.test.ts
```

### 6-Configuration Optimization Benchmark Matrix

ProofBench benchmarks each task across six distinct configurations to isolate component contributions:
1. **Direct Small**: Raw prompt, unbounded context, small model only.
2. **Direct Frontier**: Raw prompt, unbounded context, frontier model only.
3. **Governed Baseline**: Regex M1 context selector, M2 stagnation detector, M3a autopsy escalation.
4. **Governed Compiled**: Tree-sitter Context Compiler + Deterministic Prompt Compiler + Incremental Edits.
5. **Governed Compiled + Model Selector**: Complete pipeline with dynamic evidence-based model routing.
6. **Adaptive Execution Engine v1**: Unified non-LLM-first runtime with dynamic tier routing (`NON_LLM ↔ SMALL_LLM ↔ STRONGER_LLM`), persistent universal memory (`CONTEXT.MD`), and `.proofbench/` durable store.

```bash
npm run benchmark:optimization -- --simulation --trials=1
```

### Component Ablation Findings & Honest Disclosures
- **100% Correctness**: All 5 tasks passed across all configurations without regressions.
- **Task 5 (Context Filtering in Bloated Codebase)**: In a codebase with decoy utilities (`src/utils/metrics.rs`, `src/utils/crypto.rs`, `src/config.rs`), the Context Compiler successfully filtered out 18 irrelevant symbols into the structured omission ledger.
- **Trade-off Analysis**: Structured XML trust boundaries and omission summaries introduce a baseline framing overhead (~300–400 tokens) on tiny 1-line single-file tasks. However, on complex multi-file or bloated codebases, AST-based symbol isolation prevents prompt blowout and protects the model context from hallucination.

---

## Security & Governance Guardrails

1. **Explicit Prior Host Grants**: All workspace mutations require explicit task-scoped approval from the host (`allowedFiles`, quotas). Model-generated self-approvals or attempts to write outside the workspace are rejected with security errors.
2. **Confidential Loopback Route Enforcement**: When `confidential = true`, BifrostClient and gateway verify that destinations point strictly to verified local loopback interfaces (`127.0.0.1`, `localhost`). Remote cloud endpoints, wildcards (`*`), and untrusted external providers are rejected before any network traffic is emitted.
3. **External Retrieval IP Protection**: In confidential mode, external Tavily queries are blocked (`allowed: false`) to prevent internal source code, symbol names, or intent leakage.
4. **Credential Rotation & Masking**: All virtual keys and API tokens are loaded via server-side environment variables (`.env`) and masked (`sk-bf-72b0...`) across all logs, reports, and Git commits.

---

## Honest Disclosures & Known Limitations

- **M3a Token Budget Estimation**: Diagnostic packet token budgeting currently uses character-ratio heuristic estimates (`Math.round(text.length / 4)`). While safe compaction levels (Level 1–5) prevent prompt blowout, production deployment should bind a native tokenizer for exact BPE token limits.
- **Missing Telemetry Accounting**: ProofBench never invents zero (`0`) for missing provider token usage. Missing telemetry is explicitly preserved as `null` / `missing`, and efficiency percentages are only calculated on trials where both arms succeeded and reported verified numbers.
- **Workspace Isolation Scope**: Workspaces are created in isolated temporary directories (`/tmp/proofbench-workspace-*`). For multi-tenant production hosting of untrusted third-party code, full kernel-level container/cgroup sandboxing is recommended.
- **Intellectual Property Protection**: All mechanisms in ProofBench are clean-room independent TypeScript implementations. The proprietary NeuroMesh research repository and its 69-test Rust core remain strictly private and offline.

---

## Team Contributions

- **Farhan Akhtar**: Bifrost #01 Governed Agent implementation, embedded gateway, M1/M2/M3a mechanisms, 3-strategy benchmarking suite, failover verification, live Qwen integration.
- **Aryan**: Product direction, UI dashboard, and responsive frontend interaction states (`apps/web`).
- **Mohit**: Tavily verification integration, claim extraction design, and freshness validation contracts (`packages/tavily`).
- **Khushi**: Evaluation criteria, acceptance test validation, independent reproduction, and holdout test scenarios.
