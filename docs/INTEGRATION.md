# Integrating Farhan's implementation

1. Create `feat/bifrost-01-proofbench` from current main. Keep source inside `implementations/bifrost-01`; do not replace apps or shared packages.
2. Implement `AgentAdapter` from `packages/contracts/src/index.ts`. Export `bifrost01` using `implementations/bifrost-01/src/index.ts`. Return parsed `RunRecord` and `ExecutionTrace`; keep evidence truthful and unsupported capabilities false.
3. Install/compile dependencies, pin revisions, document configuration and runtime limitations. Never invoke a shell on arbitrary API input. Build task workspaces, timeouts, bounded outputs, cancellation and credential isolation before exposing execution.
4. Map provider telemetry individually to known/missing/estimated/incomparable observations. Preserve provider source and accounting scope. Save actual check evidence; an agent's success statement is not an acceptance test.
5. Add the adapter's offline contract suite, malformed events, failed execution, partial/missing usage and reproducibility cases. Test the same published task against each actual backend once available, with no fabricated results.
6. Set `BIFROST_IMPLEMENTATION=01` in local `.env`. Run `npm run check`, `npm run test:contracts`, `npm run test:ui` plus native checks when touched. Live experiments require separate explicit budget authorization; they are never CI prerequisites.
7. Start `npm run dev`. Confirm capabilities, runs, trace/report, verification and the web UI. Mohit's Tavily module does not change with backend selection. `mock` remains available for independent development.
8. Open a PR linking implementation, test evidence, provenance, limitations and selection rationale. Obtain relevant review, validate CI, then merge without force-pushing or rewriting main. Only the chosen track is submitted.

## Bifrost #01 — Deterministically Governed Coding Agent Architecture

The Bifrost #01 implementation (`implementations/bifrost-01`) integrates Maxim AI Bifrost Gateway routing with NeuroMesh governance mechanisms:

- **Host-Controlled Execution Loop:**
  `Task → Policy → Context → Bifrost → Model → Proposed Action → Approval → Execution → Verification → Recovery`
- **M1 Deterministic Context Selection:**
  Syntax-aware Rust symbol extraction (top-level `fn`, `struct`, `enum`, `trait`, `impl`), bounded to ≤4,000 tokens with explicit omissions logged in the context ledger. Fails safely on context overflow.
- **M2 Progress & Loop Control:**
  Computes SHA-256 patch digests and normalized compiler error signatures across turns. Detects duplicate identical patches (attempts 1 and 2 identical) and oscillating edits ($A \to B \to A$), halting before attempt 3 to eliminate wasted model invocations.
- **M3a Evidence-Only Failure Autopsies:**
  Constructs compact diagnostic handoffs (≤2,000 tokens) with verified unified diffs and compiler diagnostics (zero LLM narrative) to authorize model escalation via Bifrost routing headers.
- **Bifrost Gateway & Virtual Key Budgets:**
  Virtual key provisioning (`sk-bf-*`), conservative pre-request spending allowance reservation, automatic 5xx/429 fallback routing via `x-bf-fallback-providers`, and HTTP 402 rejection upon budget exhaustion. No paid overages allowed.
- **Confidential Repository Policy:**
  When `confidential: true`, cloud models are rejected at the host boundary (regardless of prompt injection), and external Tavily requests are suppressed to prevent code/dependency leakage.
- **Host Approval Engine:**
  Read-only operations proceed automatically; write, command, and git mutations require host authorization. Model self-approval is rejected.
- **Tavily Documentation Verification:**
  Extracts version-sensitive claims in public mode and queries Mohit's `verifyAnswer` to supply cited documentation evidence.
- **Frozen Task Fixtures:**
  Located in `fixtures/coding-tasks/`:
  1. `task-1-fix-failing-func`: Fix off-by-one loop bounds bug in sliding window sums.
  2. `task-2-missing-feature`: Implement exponential backoff retry calculation.
  3. `task-3-multi-file-regression`: Repair event pipeline regression across parser and sink.

Build/deployment boundary: `npm run build` outputs `dist/api/server.js` and `dist/web/`. `npm start` launches API; serve web via a static host/reverse proxy forwarding same-origin `/api` to the API. Set a persistent DATA_DIR outside artifacts. No deployment or public exposure is performed by bootstrap. Do not put Tavily keys in Vite environment variables.
