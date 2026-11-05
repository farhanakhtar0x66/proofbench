# ProofBench — Final Product Acceptance & Demo Handoff

**Target Audience:** Aryan, Mohit, Khushi (ProofBench Core Team)  
**Repository:** `farhanakhtar0x66/proofbench`  
**Branch:** `feat/bifrost-01-proofbench`  
**PR:** [#27 (Adaptive Execution Engine v1.5 — review remediation & product acceptance)](https://github.com/farhanakhtar0x66/proofbench/pull/27) — **OPEN and UNMERGED**  
**Verified Release Commit:** `HEAD` (Final Browser Acceptance Hotfix)  
**CI Quality Gate:** **100% Green (Vitest 138/138, Playwright 10/10, Evaluator 7/7, Build clean)**

---

## 1. Executive Summary

ProofBench has completed the Final Product Acceptance Hotfix:
1. **Canonical Task Catalog by Mode:** 
   - Mock mode exposes only the published `sum-fixture` (`task.json`).
   - Live Bifrost `01` mode exposes the 10 canonical coding tasks (`task-1-fix-failing-func` through `task-10-sensor-fusion-aggregator`).
   - The web dashboard presents an explicit task selector dropdown allowing users to select any canonical coding task.
   - The server validates and loads canonical `TaskSpec` definitions directly from disk, preventing untrusted client tampering of prompts or acceptance criteria. Unsupported tasks fail with HTTP 400 before launching inference.
2. **Robust Long-Running Job Monitoring & Reload Recovery:**
   - Client polling supports bounded individual request timeouts (15s) and up to 300 polling iterations (~7.5 minutes) to accommodate CPU-only GGUF frontier inference.
   - Users can pause or stop browser polling at any time using **Stop monitoring** without cancelling the backend job, and resume with **Resume monitoring**.
   - Active jobs are tracked durably in `localStorage` (`proofbench_active_job_id`). Page reloads reconnect to in-flight jobs without triggering duplicate executions.
   - Server process restarts are reported honestly: orphaned in-flight jobs are marked as failed with `Interrupted by server restart; computation did not survive process restart.`
3. **Verified Real Browser Acceptance Test:**
   - Automated via `scripts/verify-browser-live-acceptance.ts` using real Chromium and live Bifrost daemon (`:8089`).
   - Flow: Selected Task 1 ➔ Clicked "+ Run task" ➔ Observed real progress events ➔ Verified passing acceptance (2/2 tests) in 21.1s ➔ Inspected multi-tier trace (1.5B attempt + 9B escalation) ➔ Verified page reload persistence ➔ Confirmed unavailable-gateway error handling.
4. **Tavily Track Status:**
   - Clearly badged as `OFFLINE` when uncredentialed, returning structured verdicts and offline references without making unauthorized external requests.
   - When configured with `TAVILY_MODE=live` and `TAVILY_API_KEY`, live search dynamically populates real web sources and timestamps.

---

## 2. Startup Commands

### Prerequisites
- Node.js >= 22.12
- Rust & Cargo (for `cargo test` execution)
- Stock Bifrost HTTP Daemon on port 8089 (for live model inference)

### Starting the Stack (Live Bifrost 01 Mode)
```bash
# Terminal 1: Bifrost HTTP Daemon
BIFROST_SETUP_TOKEN=proofbench-test-token \
  /Users/farhanakhtar/Library/Caches/bifrost/v2.4.0/bin/bifrost-http-0 \
  -app-dir /tmp/bifrost-app -port 8089

# Terminal 2: API & Web Dashboard
cd proofbench
BIFROST_IMPLEMENTATION=01 npm run dev
# Web Dashboard: http://localhost:5173
# API Server:    http://localhost:3001
```

### Running Offline Mock Demo (Zero Credentials Needed)
```bash
# Starts both API and Web in mock mode
BIFROST_IMPLEMENTATION=mock npm run dev
```

### Running the End-to-End Real Browser Acceptance Test
```bash
node --env-file-if-exists=.env --import tsx scripts/verify-browser-live-acceptance.ts
```

---

## 3. Five-Minute Demo Checklist (For Aryan & Khushi)

| Time | Action | What to Point Out to Judges |
|---|---|---|
| **0:00 - 1:00** | Open `http://localhost:5173` | **Run Ledger Discovery:** Stored runs appear automatically from `.local/data/`. Highlight `MEASURED LIVE`, `M3A ESCALATION (1.5B ➔ 9B)`, and `ZERO-TOKEN AST FIX` badges. |
| **1:00 - 1:45** | Click **Zero-Token Deterministic Mechanical Repair** | **Zero Tokens:** Show 0 input tokens, 0 output tokens, 85ms wall time. Tree-sitter mechanical transformer resolved compilation diagnostics deterministically without invoking any LLM. |
| **1:45 - 2:45** | Click **Compare runs** | **Controlled Benchmark Card:** Task 2 controlled comparison table under identical AST tools: Direct Frontier (7,766 tokens) vs. Governed Escalation (4,461 tokens — **42.5% token savings**). Downward delegation was not exercised in this task (honest attribution). |
| **2:45 - 3:45** | Select **Task 1** from dropdown, click **+ Run task** | **Live Inference Execution:** Observe real-time progress indicators (`AdaptiveExecutionEngine initialized; running turns...`). Watch it pass 2/2 acceptance tests. Point out the resulting multi-tier trace in the timeline and reload the page to demonstrate persistence. |
| **3:45 - 4:15** | Click **Stop monitoring** / **Resume monitoring** | **Monitoring Resilience:** Show that browser polling can be safely paused and resumed without duplicating jobs or losing backend execution state. |
| **4:15 - 5:00** | Switch to **Freshness verifier** tab | **Answer Verification:** Note `OFFLINE` badge. Click *"Try: Python 2 sunset (stale)"*, click **Verify answer →**. Observe `contradicted` verdict and authoritative Python reference URL. If live key configured, show `LIVE RESEARCH` badge. |

---

## 4. Tavily Track Coordination (For Mohit)

### Offline Mode (Default)
When `TAVILY_API_KEY` is not present:
- Dashboard displays badge: `OFFLINE`.
- Uses deterministic local reference corpus (`fixtures/freshness-cases/v1.json`).
- Evidence objects have `retrievedAt: null`, accurately reflecting offline provenance.
- Arbitrary unmapped statements return `inconclusive`.

### Activating Live Research Mode
To execute genuine live web verification:
```bash
# Add to .env:
TAVILY_MODE=live
TAVILY_API_KEY=tvly-YOUR_KEY_HERE

# Restart API:
npm run dev
```
In live mode:
- Dashboard displays badge: `LIVE RESEARCH`.
- Queries `https://api.tavily.com/search` via basic search depth with answer extraction.
- Parses live search results, extracts code symbols and entity names, and returns sanitized snippets with dynamic ISO timestamps.

---

## 5. API Endpoint Contract Reference

| Endpoint | Method | Status | Description |
|---|---|:---:|---|
| `/api/health` | GET | `200` | Health check (`{ version: '1', status: 'ok' }`) |
| `/api/capabilities` | GET | `200` | Returns agent metadata, adapter type, and active limitations |
| `/api/benchmarks` | GET | `200` | Returns mode-appropriate canonical task list (mock: sum fixture, 01: 10 coding tasks) |
| `/api/runs` | GET | `200` | Discovers stored runs from `DATA_DIR` (`RunListResponse`) |
| `/api/runs/:id` | GET | `200` | Returns individual `RunRecord` |
| `/api/runs/:id/trace` | GET | `200` | Returns granular `ExecutionTrace` with timestamps |
| `/api/reports/:id` | GET | `200` | Returns `EvidenceReport` with provenance |
| `/api/jobs` | POST | `202` | Submits coding task asynchronously; returns `{ jobId, status, runId }` |
| `/api/jobs/:id` | GET | `200` | Polls job status (`running`, `completed`, `failed`) and progress message |
| `/api/benchmarks/controlled` | GET | `200` | Returns Task 2 controlled routing benchmark comparison |
| `/api/verify` | POST | `201` | Tavily factual verification report |

---

## 6. Technical Disclosures & Limitations

1. **Local GGUF Model Latency:** On CPU-only environments (standard developer laptops or GitHub runner VMs), Qwen 3.5 9B inference requires 20-35 seconds per turn. The async job polling mechanism and 300-iteration ceiling prevent HTTP timeouts.
2. **Task 10 Characterization:** Task 10 was co-designed to test unfamiliar AST symbols across multiple Rust modules. While executed autonomously against live Bifrost without hardcoded heuristics, it is properly classified as a validation fixture rather than a blind held-out task.
3. **Task 2 Benchmark Attribution:** In Task 2, model escalation (`SMALL_LLM ➔ STRONGER_LLM`) produced 42.5% token savings over direct frontier inference. Downward delegation was not exercised in this specific task because the frontier model completed the patch directly.
4. **Process Restart Honesty:** In-flight job records in persistent storage do not resume automatically if the Node.js server process is terminated; orphaned jobs are reconciled as `failed` with explicit notice on restart.
