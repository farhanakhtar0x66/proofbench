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

The Bifrost #01 implementation (`implementations/bifrost-01`) integrates Maxim AI Bifrost Gateway routing with host-controlled governance mechanisms:

- **Host-Controlled Execution Loop:**
  `Task → Policy → Context → Bifrost → Model → Proposed Action → Approval → Execution → Verification → Recovery`
- **Model Action Parsing & Safety:**
  The agent does not copy answer keys. It parses genuine model output via `parseModelActions` (supporting structured `write_file` tool calls or formatted markdown code blocks with `// File: <relpath>`). Proposed target paths are validated to prevent directory traversal or workspace escaping.
- **Host Approval Engine:**
  Read-only operations proceed automatically; write, command, and git mutations require host authorization via `HostApprovalEngine`. Model self-approval is rejected.
- **M1 Deterministic Context Selection:**
  Syntax-aware Rust symbol extraction (top-level `fn`, `struct`, `enum`, `trait`, `impl`), bounded to ≤4,000 tokens with explicit omissions logged in the context ledger. Fails safely on context overflow.
- **M2 Progress & Loop Control:**
  Computes SHA-256 patch digests and normalized compiler error signatures across turns. Detects duplicate identical patches (attempts 1 and 2 identical) and oscillating edits ($A \to B \to A$), halting before attempt 3 to eliminate wasted model invocations.
- **M3a Evidence-Only Failure Autopsies:**
  Constructs compact diagnostic handoffs (≤2,000 tokens) with verified unified diffs and compiler diagnostics (zero LLM narrative) to authorize model escalation via Bifrost routing headers.
- **Bifrost Gateway & Virtual Key Budgets:**
  Integrates Maxim AI Bifrost gateway daemon (`http://127.0.0.1:8089`) with virtual keys (`sk-bf-*`), conservative pre-request spending allowance reservation, automatic 5xx/429 fallback routing via `x-bf-fallback-providers`, and HTTP 402 rejection upon budget exhaustion. No paid overages allowed. Offline deterministic testing is supported via explicitly labeled `EmbeddedBifrostGateway` simulation (`simulated: true`). Live gateway errors fail closed and never silently fall back to simulation.
- **Confidential Repository Policy:**
  When `confidential: true`, cloud models are rejected at the host boundary (regardless of prompt injection), and external Tavily requests are suppressed to prevent code/dependency leakage.
- **Tavily Documentation Verification:**
  Extracts version-sensitive claims in public mode and queries Mohit's `verifyAnswer` to supply cited documentation evidence.
- **Frozen Task Fixtures:**
  Located in `fixtures/coding-tasks/`:
  1. `task-1-fix-failing-func`: Fix off-by-one loop bounds bug in sliding window sums.
  2. `task-2-missing-feature`: Implement exponential backoff retry calculation.
  3. `task-3-multi-file-regression`: Repair event pipeline regression across parser and sink.
  Reference solutions in `fixtures/coding-tasks/*/solution/` are evaluator-only benchmark controls and are never accessed by the execution agent runtime.

## Technical Disclosures & Limitations

In compliance with truthful benchmarking principles, the following limitations are explicitly disclosed:
1. **M1 Symbol Scanning:** Current implementation uses regex and brace-depth parsing for Rust symbol extraction rather than a full Tree-sitter AST or verified Language Server Protocol (LSP).
2. **M2 Stagnation Detection:** Current implementation tracks SHA-256 hashes of patch texts and compiler error strings rather than complete semantic AST edit scripts.
3. **M3a Token Budgeting:** Token bounds in autopsy handoffs use character-ratio heuristics (~4 characters per token) rather than model-specific BPE tokenizer profiles.
4. **Workspace Isolation:** Tasks execute in temporary directories (`TaskWorkspace`) with scrubbed environment variables and process group termination; this is a lightweight host isolation boundary, not a hardware-isolated container or virtual machine sandbox.
5. **Cost Telemetry:** External inference costs are estimated using standard pricing tier calculations ($0.15/1M input, $0.60/1M output) and recorded with `status: 'estimated'` and `method: 'pricing_model_v1'`, rather than direct billing invoices. Local models are verified as unmetered zero-cost.

## Research Protection & Provenance

- **Clean-Room TypeScript Implementation:** All runtime modules, context selectors, loop breakers, and Bifrost gateway clients in `implementations/bifrost-01` are independent implementations created specifically for this hackathon submission.
- **Strict IP Protection:** The original NeuroMesh research repository and 69-test offline Rust core (`/Users/farhanakhtar/Projects/neuromesh-research`) remain completely private, untouched, and unimported. No proprietary algorithms, tokenizer profiles, architecture documents, or research benchmarks have been included in this PR.

Build/deployment boundary: `npm run build` outputs `dist/api/server.js` and `dist/web/`. `npm start` launches API; serve web via a static host/reverse proxy forwarding same-origin `/api` to the API. Set a persistent DATA_DIR outside artifacts. No deployment or public exposure is performed by bootstrap. Do not put Tavily keys in Vite environment variables.
