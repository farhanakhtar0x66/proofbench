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
| `npm run test:failover` | **Genuine Bifrost Failover**: Injected 503/429 outages, fallback routing to secondary provider, session survival, user notifications, confidential block, budget block | `.local/data/bifrost-failover-evidence.json` |
| `npm run test:freshness` | **Tavily Freshness Scenario**: Task 4 `#![deny(deprecated)]`, extraction of deprecated `spin_loop_hint`, retrieval of `std::hint::spin_loop`, confidential IP block | `.local/data/tavily-freshness-evidence.json` |
| `npm run benchmark:strategies` | **3-Strategy Efficiency Benchmark**: Compares Direct Small (1.5B), Direct Frontier (9B), and Governed Escalation across frozen tasks with repeated trials | `.local/data/strategy-benchmark-evidence.json` |
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

### Summary of Live & Simulated Benchmark Results

- **Task 1 (Fix failing sliding window function)**:
  - Direct 1.5B: **100% success** (simple single-file bounds fix).
  - Governed 1.5B: **100% success** without escalating (consumed ~300 tokens vs. ~300 for frontier).
- **Task 2 (Missing feature / exponential backoff)**:
  - Direct 1.5B: Fails or introduces infinite loops.
  - Governed Escalation: Catches failure on attempt 2 via M2, generates M3a autopsy, escalates to 9B, and **succeeds on attempt 3**.
  - Token Efficiency: Saves ~45% tokens compared to running all attempts on the frontier model.
- **Task 3 (Multi-file regression across parser & sink)**:
  - Direct 1.5B: Fails on multi-file context tracking without bounded discovery.
  - Governed Escalation: Multi-step resolution with scoped approval across all affected files.
- **Task 4 (Version freshness & deprecation avoidance)**:
  - Standard baseline: Uses deprecated `std::sync::atomic::spin_loop_hint`, triggering compiler error under `#![deny(deprecated)]`.
  - Governed + Tavily: Detects deprecation, injects verified documentation for `std::hint::spin_loop`, and passes acceptance tests on attempt 1.

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
