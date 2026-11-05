# Dashboard & Runtime Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the real Adaptive Execution Engine to the ProofBench API and Aryan's Web Dashboard, eliminate misleading trace claims, enable asynchronous long-running task execution with progress tracking, provide automatic discovery of stored runs, and display honest, comparable benchmark measurements.

**Repository:** `farhanakhtar0x66/proofbench`  
**Branch:** `feat/bifrost-01-proofbench`  
**PR:** #27 (MUST REMAIN OPEN AND UNMERGED)  

---

## Proposed Changes & Architecture

### 1. Contracts & Storage (`packages/contracts`, `apps/api/src/store.ts`)
- **`packages/contracts/src/index.ts`:**
  - Export `RunListResponse = z.object({ version: z.literal('1'), runs: z.array(RunRecord) })`.
  - Export `JobStatus = z.enum(['queued', 'running', 'completed', 'failed'])`.
  - Export `JobRecord = z.object({ version: z.literal('1'), id: z.string(), status: JobStatus, task: TaskSpec, agentId: z.string(), runId: z.string().optional(), progress: z.string().optional(), error: z.string().optional(), createdAt: z.string(), updatedAt: z.string() })`.
- **`apps/api/src/store.ts`:**
  - Implement `JsonStore.list<T>(kind: string, schema: z.ZodType<T>, limit?: number): Promise<T[]>`.
  - Safely enumerate directory entries, filter `${kind}-*.json`, safely parse and validate schemas, sort deterministically (`createdAt` descending), bound results.

### 2. Evidence Integrity & Preloaded Data (`.local/data/`, `docs/`)
- **`trace-task-9-live.json`:**
  - Remove fabricated events 4 & 5 (which claimed an invented stronger-to-small delegation on `src/filter.rs`).
  - Replace with the authentic 5-turn escalation trajectory recorded in `adaptive-engine-v1-5-live-evidence.json` (`NON_LLM -> SMALL_LLM -> STRONGER_LLM`), where Qwen 9B completed synthesis of `src/event.rs`, `src/dispatcher.rs`, and `src/filter.rs` with 4/4 passing tests.
- **`runs-task-9-live.json` & `reports-task-9-live.json`:**
  - Remove claims of downward delegation for this live run; truthfully describe the M3a autopsy escalation and multi-module resolution.
- **Update documentation:**
  - Accurately describe the Task 9 live run in `docs/HACKATHON_INTEGRATION_HANDOFF.md` and `.local/data/pr-27-body.md`.

### 3. API Integration (`apps/api/src/app.ts`)
- **Run Discovery:**
  - `GET /api/runs`: Returns `{ version: '1', runs: await store.list('runs', RunRecord, 50) }`.
- **Benchmark Data:**
  - `GET /api/benchmarks/controlled`: Returns the empirical controlled routing benchmark comparison from `.local/data/optimization-benchmark-evidence.json`.
- **Async Execution Jobs:**
  - `POST /api/jobs`:
    - Validates task against allowed tasks list.
    - Performs preflight check: verifies Bifrost Gateway connectivity when `implementation === '01'`. If unreachable, returns 503 with explicit error (no silent mock fallback).
    - Creates durable `JobRecord` in `store`.
    - Spawns asynchronous execution via `AdaptiveExecutionEngine` in background.
    - Returns 202 Accepted `{ version: '1', jobId: job.id, status: 'running', runId: job.runId }`.
  - `GET /api/jobs/:id`:
    - Returns `JobRecord` with current status and progress message.
- **Backward Compatibility:**
  - Preserves synchronous `POST /api/runs` for mock adapter and regression tests.

### 4. Real Engine Adapter Integration (`implementations/bifrost-01/src/index.ts`, `packages/agent-adapters/src/index.ts`)
- Connect `AdaptiveExecutionEngine` directly to the execution adapter:
  - Configure workspace isolation via `TaskWorkspace`.
  - Wire host approval handler via `createWorkspaceApprovalHandler()`.
  - Wire live `BifrostClient` with preflight check.
  - Return genuine `RunRecord` and `ExecutionTrace`.

### 5. Frontend Dashboard Integration (`apps/web/src/main.tsx`, `apps/web/src/client.ts`, `apps/web/src/style.css`)
- **Automatic Run Discovery:**
  - In `connect()`, call `GET /api/runs`.
  - Display Task 6, Task 9, and Task 10 in the Run Ledger automatically.
  - Set default selected run to the latest discovered run.
- **Run Status Badges:**
  - Clearly distinguish:
    - `MEASURED LIVE` (verified live Bifrost execution)
    - `DETERMINISTIC ZERO-TOKEN` (Task 6 mechanical fix)
    - `ESCALATION TRAJECTORY` (Task 9 M3a escalation)
    - `SIMULATED` / `OFFLINE FIXTURE` (when simulated)
- **Async Execution with Live Progress:**
  - Replace blocking 15-second execution with job submission + polling (`/api/jobs`).
  - Display real-time progress message ("Running turn 2/5...", "Applying mechanical fix...").
  - On completion, add new run to ledger and select it.
- **Honest Benchmark Presentation:**
  - In the comparison/benchmark view, render the Task 2 controlled benchmark table:
    - Direct Frontier: 7,766 tokens, 100% pass.
    - Escalation Only: 4,461 tokens, 100% pass (saved 3,305 tokens).
    - Bidirectional Adaptive Policy: 6,215 tokens, 100% pass.
    - Direct Small: 2,500 tokens, 0% pass (failed).
  - Explicit disclosure: Single-trial empirical observation; downward delegation did not occur in this task.
- **Tavily Freshness Tab:**
  - Clearly display whether Tavily is operating in `live` web research mode or `mock` offline fixture mode.

---

## Execution Tasks

- [ ] **Task 1: Update Contracts & Implement `JsonStore.list`**
  - Add `RunListResponse`, `JobRecord`, `JobStatus` to `packages/contracts/src/index.ts`.
  - Implement `JsonStore.list()` in `apps/api/src/store.ts`.
  - Add unit tests for `JsonStore.list()` in `tests/api.test.ts`.

- [ ] **Task 2: Audit and Truthfully Correct Preloaded Run Traces & Reports**
  - Update `.local/data/trace-task-9-live.json` to remove fabricated delegation events and replace with authentic 5-turn escalation trajectory.
  - Update `.local/data/runs-task-9-live.json` and `.local/data/reports-task-9-live.json` to accurately reflect escalation without claiming downward delegation.
  - Verify `.local/data/trace-task-10-live.json` and `.local/data/trace-task-6-live.json`.
  - Update `docs/HACKATHON_INTEGRATION_HANDOFF.md` with truthful descriptions.

- [ ] **Task 3: Implement API Endpoints for Run Discovery, Controlled Benchmarks & Async Jobs**
  - Implement `GET /api/runs` in `apps/api/src/app.ts`.
  - Implement `GET /api/benchmarks/controlled` in `apps/api/src/app.ts`.
  - Implement `POST /api/jobs` and `GET /api/jobs/:id` with preflight checks and background `AdaptiveExecutionEngine` execution.
  - Add integration tests in `tests/api.test.ts`.

- [ ] **Task 4: Connect Real `AdaptiveExecutionEngine` to Agent Adapter**
  - Wire `AdaptiveExecutionEngine` into `bifrost01` adapter in `implementations/bifrost-01/src/index.ts` with strict preflight and workspace isolation.
  - Ensure mock fallback is never silent when live mode is requested.

- [ ] **Task 5: Update Frontend Dashboard (Aryan's UI)**
  - Update `apps/web/src/client.ts` with new schemas and endpoints.
  - Update `apps/web/src/main.tsx` to automatically discover stored runs, display accurate badges, support polling for long-running jobs, and render the honest controlled benchmark table.
  - Update `tests/browser/dashboard.spec.ts` for Playwright testing.

- [ ] **Task 6: Verification, Full Quality Gate & Handoff**
  - Run `npm run check` (ESLint, TypeScript, Vitest 129+ tests, evaluate, build).
  - Run Playwright browser tests (`npm run test:ui`).
  - Test browser dashboard manually or via automated script to verify all acceptance criteria.
  - Author integration handoff summary for Aryan, Mohit, and Khushi.
  - Commit, push to `feat/bifrost-01-proofbench`, and verify GitHub Actions CI is green while PR #27 remains OPEN.
