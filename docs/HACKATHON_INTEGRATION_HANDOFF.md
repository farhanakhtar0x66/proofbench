# ProofBench — Hackathon Integration & Release Handoff

**Challenge Track:** Bifrost #01 — Coding Agent with Minimal Token Usage  
**Secondary Track:** Tavily — Documentation Freshness & Verification  
**Repository:** `farhanakhtar0x66/proofbench`  
**Active Branch:** `feat/bifrost-01-proofbench`  
**Target Pull Request:** [PR #27](https://github.com/farhanakhtar0x66/proofbench/pull/27) — **HOLD OPEN AND UNMERGED**  
**Release Milestone:** v1.5 Stabilization & Integration Candidate  
**Quality Gate Status:** All CI checks passing (0 warnings, 0 errors, 128 tests passing across 11 test suites)

---

## 1. Quickstart & Service Startup

### A. Run Full Quality Gate (Deterministic & Local)
```bash
npm run check
```
Executes:
- `npm run lint` (`eslint . --max-warnings=0`): 0 warnings, 0 errors
- `npm run typecheck` (`tsc --noEmit`): 0 TypeScript errors
- `npm test` (`vitest run`): 128 / 128 unit and integration tests passed
- `npm run evaluate` (`scripts/evaluate.ts`): 7/7 offline fixture regressions passed
- `npm run build`: Vite production bundle (`dist/web`) and esbuild API server (`dist/api/server.js`)

### B. Start the Fastify API Server
```bash
npm run api
```
- Listens on `http://127.0.0.1:3000`
- Reads persistent execution records, traces, and reports from `DATA_DIR` (default: `.local/data/`)
- Supports `BIFROST_IMPLEMENTATION=01` (Adaptive Execution Engine) or `mock`
- Supports `TAVILY_MODE=live` (with `TAVILY_API_KEY`) or `mock` (offline fixtures)

### C. Start the React Web Dashboard
```bash
npm run web
```
- Listens on `http://127.0.0.1:5173`
- Pre-configured Vite reverse proxy maps `/api` -> `http://127.0.0.1:3000/api`
- Automatically discovers stored runs in `.local/data/`

---

## 2. API Endpoints & Request / Response Contracts

The ProofBench API implements strict, versioned Zod schemas defined in `packages/contracts/src/index.ts`.

| Endpoint | Method | Input Contract | Output Contract | Purpose |
|---|---|---|---|---|
| `/api/health` | `GET` | None | `{ version: '1', status: 'ok' }` | Liveness health check |
| `/api/capabilities` | `GET` | None | `Capabilities` | Reports adapter descriptor, enabled flags, and limitations |
| `/api/benchmarks` | `GET` | None | `{ version: '1', tasks: TaskSpec[] }` | Published benchmark tasks catalog |
| `/api/runs` | `POST` | `RunRequest` | `RunRecord` | Executes a coding task with the selected agent adapter |
| `/api/runs/:id` | `GET` | URL param `id` | `RunRecord` | Retrieves execution summary, usage telemetry, and reproducibility |
| `/api/runs/:id/trace` | `GET` | URL param `id` | `ExecutionTrace` | Full timestamped sequence of start, output, check, error, finish events |
| `/api/reports/:id` | `GET` | URL param `id` | `EvidenceReport` | Acceptance checks, honest usage observations, and limitations |
| `/api/verify` | `POST` | `VerifyRequest` | `VerificationReport` | Tavily freshness check verifying claims against live or fixture sources |
| `/api/verify/:id` | `GET` | URL param `id` | `VerificationReport` | Retrieves previously verified claim report |

---

## 3. Preloaded Sanitized Live Traces in `.local/data/`

To allow instant dashboard exploration without running live inference, three real, verified execution runs are preloaded in `.local/data/` conforming to runtime schemas:

1. **Held-Out Task 10 Live Acceptance:**
   - Files: `runs-task-10-live.json`, `trace-task-10-live.json`, `reports-task-10-live.json`
   - Challenge: `task-10-sensor-fusion-aggregator` (unfamiliar symbols and multi-file dependencies)
   - Metrics: 2 execution turns, 2,817 prompt tokens, 507 completion tokens, 0 USD, PASSED
   - Highlights: Generic AST symbol indexing, zero fixture heuristics, transactional multi-file commit across `src/sensor.rs` and `src/aggregator.rs`.

2. **Task 9 Live Multi-Module Escalation Trajectory:**
   - Files: `runs-task-9-live.json`, `trace-task-9-live.json`, `reports-task-9-live.json`
   - Challenge: `task-9-bidirectional-event-service` (`event.rs`, `dispatcher.rs`, `filter.rs`)
   - Metrics: 5 execution turns, 11,154 prompt tokens, 2,044 completion tokens, PASSED (4/4 tests)
   - Highlights: Live model escalation (`NON_LLM -> SMALL_LLM -> STRONGER_LLM`). Small model initiated, triggered M3a autopsy on unapplicable patch, escalated to Qwen 9B which synthesized the 3-module event service. (Bidirectional downward delegation is tested in simulation under Scenario G).

3. **Task 6 Zero-Token Deterministic Mechanical Fix:**
   - Files: `runs-task-6-live.json`, `trace-task-6-live.json`, `reports-task-6-live.json`
   - Challenge: `task-6-deterministic-fix`
   - Metrics: 1 turn, strictly 0 prompt tokens, 0 completion tokens, 85 ms controller CPU, PASSED
   - Highlights: MechanicalTransformer synthesized pattern-matched AST patch directly from diagnostics.

---

## 4. Shared JSON Examples for Judges & Dashboard

Sanitized schema reference files are located in `docs/examples/` and continuously verified by `tests/contracts.test.ts`:

- `docs/examples/tier-transition-event.v1.json` (`TierTransitionEventSchema`): Records inter-tier handoffs with authorized reason and source revision hash.
- `docs/examples/handoff-packet-export.v1.json` (`HandoffPacketExportSchema`): Structured payload containing slice rationale, relevant files, bounded instructions, and token budget.
- `docs/examples/model-inference-provenance.v1.json` (`ModelInferenceProvenanceSchema`): Full provenance including endpoint, latency ms, HTTP status, token counts, and revision hash.
- `docs/examples/attribution-breakdown.v1.json` (`AttributionBreakdownSchema`): Signed token savings breakdown isolated by driver (deterministic tooling, context compilation, model selection, bidirectional delegation).
- `docs/examples/controlled-benchmark-export.v1.json` (`ControlledBenchmarkExportSchema`): Fair comparison benchmark export equalizing AST tooling across all 4 policies.

---

## 5. Live Bifrost Reproduction Commands

When the stock Maxim Bifrost HTTP daemon is running on port 8089 with local GGUF models (`Qwen2.5-Coder-1.5B` and `Qwen3.5-9B`):

```bash
# 1. Run Controlled Routing Benchmark (Fair Comparison, Equalized AST Tools on Task 2)
npx tsx scripts/benchmark-optimization.ts --live --task=task-2-missing-feature --controlled

# 2. Run Held-Out Task 10 Live Demonstration
npm run demonstrate:task10:live

# 3. Run Strict Live Task 9 Bidirectional Multi-Model Demonstration
npm run demonstrate:adaptive:v1-5:live

# 4. Run True OS Child-Process Restart & Crash Resilience Suite
npx vitest run tests/process-restart.test.ts
```

---

## 6. Empirical Controlled Routing Benchmark Results

Evaluated on frozen coding task `task-2-missing-feature` ("Implement exponential backoff retry calculation") under identical acceptance criteria and equalized AST tools:

```
Controlled Routing Policy Comparison (All Arms have Tree-sitter & Mechanical Tools):
----------------------------------------------------------------------------------------------------
| Policy                             | Pass %   | Avg Tok    | Tok/Accept  | Wall ms   | CPU ms   |
----------------------------------------------------------------------------------------------------
| controlled_direct_small            | 0%       | 2,500      | N/A         | 7,824     | 41       |
| controlled_direct_frontier         | 100%     | 7,766      | 7,766       | 168,349   | 334      |
| controlled_escalation_only         | 100%     | 4,461      | 4,461       | 63,501    | 118      |
| controlled_bidirectional_adaptive  | 100%     | 6,215      | 6,215       | 75,249    | 136      |
----------------------------------------------------------------------------------------------------
Attribution Breakdown:
  • Model Selection Savings: 3,305 tokens saved (42.5% reduction vs direct frontier)
  • True Deterministic CPU Overhead: 118 ms - 136 ms across entire multi-turn workflow
```

### Empirical Takeaways:
1. **Honest Capability Boundaries:** The small model alone cannot solve exponential backoff and fails (0% pass rate). ProofBench accurately reports 0% rather than suppressing failures.
2. **Token Efficiency:** Governed escalation resolves the challenge with 4,461 tokens compared to 7,766 for the direct frontier arm, reducing total inference consumption by **42.5%**.
3. **Negligible Deterministic Overhead:** Tree-sitter concrete parsing, diagnostic filtering, and host approval consumed only 118 ms of CPU time.

---

## 7. Verified Capabilities vs. Known Limitations

### Verified Achievements:
- **Zero-Token Mechanical Repair:** Resolves mechanical syntax/visibility errors without invoking an LLM.
- **Generic File Resolution:** 5-stage deterministic file resolution using Web-Tree-Sitter symbol declarations; zero fixture-specific path heuristics.
- **Path Containment & Symlink Defense:** Strictly rejects absolute paths (`/etc/...`), parent traversals (`../`), UNC paths, null bytes, and symlinks.
- **Transactional Atomic Edits:** 3-stage transactional edits (in-memory staging -> host approval -> atomic disk commit with SHA-256 validation and automatic rollback).
- **Execution-Security Isolation:** Scrubbed subprocess environment stripping API keys, tokens, and credentials. Frozen test harness tamper detection terminates unauthorized harness edits with code 126.
- **True OS Child-Process Resiliency:** Survives planned process suspension and unhandled `SIGKILL` host termination via durable disk checkpoints and `CONTEXT.MD`.

### Known Limitations:
- **Local Inference Latency:** Local GGUF models on CPU take 30-55 seconds for complex 9B completions.
- **Offline Tavily Fallback:** When `TAVILY_API_KEY` is omitted, Tavily runs in offline fixture mode where arbitrary unknown queries return inconclusive verdicts.
