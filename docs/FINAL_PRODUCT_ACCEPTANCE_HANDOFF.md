# ProofBench — Final Product Acceptance & Demo Handoff

**Target Audience:** Aryan, Mohit, Khushi (ProofBench Core Team)  
**Repository:** `farhanakhtar0x66/proofbench`  
**Branch:** `feat/bifrost-01-proofbench`  
**PR:** [#27 (Adaptive Execution Engine v1.5 — review remediation & product acceptance)](https://github.com/farhanakhtar0x66/proofbench/pull/27) — **OPEN and UNMERGED**  
**Verified Release Commit:** `cb79552` (and subsequent acceptance polish)  
**CI Quality Gate:** **100% Green (2 / 2 GitHub Actions Checks Passed)**

---

## 1. Executive Summary

ProofBench has successfully completed the Final Product Acceptance Gate:
1. **Durable Run Discovery:** The web dashboard connects to Fastify API (`/api/runs`) and automatically discovers stored, source-backed execution runs from `.local/data/`. Stored runs appear immediately in the Run Ledger without executing new inference.
2. **Asynchronous Non-Blocking Execution:** Long-running model inference is executed asynchronously via `POST /api/jobs` and polled via `GET /api/jobs/:id`. The frontend displays real-time progress indicators, eliminating browser 15-second HTTP timeout failures.
3. **Live Bifrost Inference Verified:** Executed `task-1-fix-failing-func` through the live API (`POST /api/jobs`) and stock Bifrost HTTP daemon (`:8089`). The `AdaptiveExecutionEngine` initiated localized repair, escalated via M3a autopsy to Qwen 9B, applied AST patch to `src/lib.rs`, and passed 100% of acceptance tests in 28.8s (`runId: 25a183e1-9a45-47cd-88f6-d194f991c12f`).
4. **Truthful Telemetry & Disclosures:**
   - **Task 9:** Truthfully reports the 5-turn escalation trajectory (`NON_LLM ➔ SMALL_LLM ➔ STRONGER_LLM`) where Qwen 9B resolved the multi-module service. No fictitious downward delegation is claimed.
   - **Task 10:** Relabeled from "Held-out" to `SENSOR FUSION VALIDATION` fixture, accurately reflecting that while model execution is live and autonomous, the fixture was co-designed for multi-file AST validation.
   - **Task 2 Controlled Benchmark:** Displays fair, comparable measurements under identical Tree-sitter AST tools: Direct Frontier (7,766 tokens, 100%), Governed Escalation (4,461 tokens, 100% — **saved 3,305 tokens, 42.5%**), Bidirectional Adaptive (6,215 tokens, 100%), Direct Small (2,500 tokens, 0% — failed).
   - **Tavily:** Clearly badged as `OFFLINE FIXTURE MODE` when `TAVILY_API_KEY` is not present, and `LIVE WEB SEARCH` when credentials are configured.

---

## 2. Startup Commands

### Prerequisites
- Node.js >= 22.12
- Rust & Cargo (for `cargo test` execution)
- Stock Bifrost HTTP Daemon running on port 8089 (for live model inference)

### Starting the Stack
```bash
# Terminal 1: Bifrost HTTP Daemon (if running live inference)
BIFROST_SETUP_TOKEN=proofbench-test-token \
  /Users/farhanakhtar/Library/Caches/bifrost/v2.4.0/bin/bifrost-http-0 \
  -app-dir /tmp/bifrost-app -port 8089

# Terminal 2: API & Web Dashboard
cd proofbench
npm run dev
# Web Dashboard: http://localhost:5173
# API Server:    http://localhost:3001
```

### Running Offline Mock Demo (Zero Credentials Needed)
```bash
# Starts both API and Web in mock mode
BIFROST_IMPLEMENTATION=mock npm run dev
```

---

## 3. Product Demo Sequence (For Judges & Video Recording)

### Act 1: The Trust the Evidence Dashboard (0:00 - 1:00)
1. **Open `http://localhost:5173`:**
   - Notice the Run Ledger automatically discovers stored records without executing new inference.
   - Highlight the status badges:
     - `SENSOR FUSION VALIDATION` (`task-10-live`)
     - `M3A ESCALATION (1.5B ➔ 9B)` (`task-9-live`)
     - `ZERO-TOKEN AST FIX` (`task-6-live`)
2. **Inspect Task 6 (Zero Tokens):**
   - Click **Zero-Token Deterministic Mechanical Repair**.
   - Show metrics: **Input Tokens: 0 tokens**, **Output Tokens: 0 tokens**, Controller CPU: 85 ms.
   - Show trace: MechanicalTransformer identified pattern and repaired visibility diagnostics without calling any LLM.

### Act 2: Truthful Multi-Model Escalation on Task 9 & Task 10 (1:00 - 2:30)
1. **Inspect Task 9 (Multi-Module Event Pipeline):**
   - Click **Multi-Module Bidirectional Event Pipeline Service**.
   - Show timeline: Turn 1 Small LLM (`Qwen2.5-Coder-1.5B`) produced an unapplicable patch. M3a autopsy triggered.
   - Sequence 4: Escalation to `Qwen3.5-9B-GGUF`.
   - Qwen 9B synthesizes `src/event.rs`, `src/dispatcher.rs`, `src/filter.rs`.
   - Subprocess `cargo test` confirms 4/4 passing tests.
   - Point out honest reporting: We do not claim an unobserved downward handoff on this live run; downward delegation is validated separately under controlled simulation (Scenario G).
2. **Inspect Task 10 (Multi-Module Sensor Fusion):**
   - Show transactional multi-file AST symbol resolution across `src/sensor.rs` and `src/aggregator.rs`.
   - 2 turns, 2,817 prompt tokens, 507 completion tokens, 3/3 tests passed.

### Act 3: Controlled Inference Optimization Benchmark (2:30 - 3:45)
1. **Click "Compare runs":**
   - The Controlled Benchmark card displays the empirical Task 2 comparison table:
     - **Direct Frontier:** 7,766 tokens | 168.3s | 100% pass
     - **Governed Escalation Only:** 4,461 tokens | 63.5s | 100% pass (**-3,305 tokens, -42.5%**)
     - **Bidirectional Adaptive:** 6,215 tokens | 75.2s | 100% pass
     - **Direct Small:** 2,500 tokens | 7.8s | 0% pass (failed on exponential backoff calculation)
2. **Point out the Attribution disclosure:**
   - All arms share identical Tree-sitter AST tools.
   - Governed escalation saved 3,305 tokens over direct frontier.
   - Single-trial observation on frozen coding challenge, honestly reported.

### Act 4: Answer Freshness Verifier via Tavily (3:45 - 4:30)
1. **Click "Freshness verifier":**
   - Note the mode badge (`OFFLINE` or `LIVE SEARCH`).
   - Click sample button: *"Try: Python 2 sunset (stale)"*.
   - Click **Verify answer →**.
   - Result: `contradicted` with offline reference link to Python sunset document.

---

## 4. API Endpoint Contract Reference

| Endpoint | Method | Status | Description |
|---|---|:---:|---|
| `/api/health` | GET | `200` | Health check (`{ version: '1', status: 'ok' }`) |
| `/api/capabilities` | GET | `200` | Returns agent metadata, adapter type, and active limitations |
| `/api/runs` | GET | `200` | Discovers stored runs from `DATA_DIR` (`RunListResponse`) |
| `/api/runs/:id` | GET | `200` | Returns individual `RunRecord` |
| `/api/runs/:id/trace` | GET | `200` | Returns granular `ExecutionTrace` with timestamps |
| `/api/reports/:id` | GET | `200` | Returns `EvidenceReport` with provenance |
| `/api/jobs` | POST | `202` | Submits coding task asynchronously; returns `{ jobId, status, runId }` |
| `/api/jobs/:id` | GET | `200` | Polls job status (`running`, `completed`, `failed`) and progress message |
| `/api/benchmarks/controlled` | GET | `200` | Returns Task 2 controlled routing benchmark comparison |
| `/api/verify` | POST | `201` | Tavily factual verification report |

---

## 5. Technical Disclosures & Limitations

1. **Local GGUF Model Latency:** On CPU-only environments (e.g. standard developer laptops or GitHub runner VMs), Qwen 3.5 9B inference requires 20-40 seconds per turn. The async job polling mechanism prevents HTTP timeouts.
2. **Task 10 Characterization:** Task 10 was co-designed to test unfamiliar AST symbols across multiple Rust modules. While executed autonomously against live Bifrost without hardcoded heuristics, it is properly classified as a validation fixture rather than a blind held-out task.
3. **Task 2 Benchmark Attribution:** In Task 2, model escalation (`SMALL_LLM ➔ STRONGER_LLM`) produced 42.5% token savings over direct frontier inference. Downward delegation was not exercised in this specific task because the frontier model completed the patch directly.
4. **Tavily Mode:** Without a paid `TAVILY_API_KEY`, Tavily functions in offline fixture mode, returning structured inconclusive verdicts for unknown claims.
