# Integrating Farhan's implementation

1. Create `feat/bifrost-01-adapter` or `feat/bifrost-02-adapter` from current main. Keep source inside the corresponding `implementations/` module; do not replace apps or shared packages.
2. Implement `AgentAdapter` from `packages/contracts/src/index.ts`. Export `bifrost01` or `bifrost02` using the existing entry point. Return a parsed RunRecord and ExecutionTrace; keep evidence truthful and unsupported capabilities false. Native paths must be environment/config driven, never another developer's absolute path.
3. Install/compile dependencies, pin revisions, document configuration and runtime limitations. Never invoke a shell on arbitrary API input. Build task workspaces, timeouts, bounded outputs, cancellation and credential isolation before exposing execution.
4. Map provider telemetry individually to known/missing/estimated/incomparable observations. Preserve provider source and accounting scope. Save actual check evidence; an agent's success statement is not an acceptance test.
5. Add the adapter's offline contract suite, malformed events, failed execution, partial/missing usage and reproducibility cases. Test the same published task against each actual backend once available, with no fabricated results.
6. Set `BIFROST_IMPLEMENTATION=01` or `02` in local `.env`. Run `npm run check`, `npm run test:contracts`, `npm run test:ui` plus native checks when touched. Live experiments require separate explicit budget authorization; they are never CI prerequisites.
7. Start `npm run dev`. Confirm capabilities, runs, trace/report, verification and the web UI. Mohit's Tavily module does not change with backend selection. `mock` remains available for independent development.
8. Open a PR linking implementation, test evidence, provenance, limitations and selection rationale. Obtain relevant review, validate CI, then merge without force-pushing or rewriting main. Only the chosen track is submitted.

## Bifrost #02: Agent Benchmarking Platform Architecture

Bifrost #02 benchmarks autonomous coding agents against frozen tasks, providing independent acceptance testing and reproducible comparison reports.

### Components under `implementations/bifrost-02/src/`

- **Workspace Manager (`workspace.ts`)**: Creates completely isolated temporary directory workspaces for each agent run (`os.tmpdir()/proofbench-ws-<task>-<uuid>`). Templates from `fixtures/coding-tasks/` are cleanly copied and git-initialized. Agents never touch the source repository or peer agent files.
- **Process Runner (`process-runner.ts`)**: Manages subprocess lifecycles with:
  - *Credential isolation*: Scrubs ambient environment, stripping `TAVILY_API_KEY`, `OPENAI_API_KEY`, etc.
  - *Process group termination*: Detached process spawning; kills `-pid` on timeout or cancellation (SIGTERM followed by SIGKILL) to prevent orphan child processes.
  - *Output bounding*: Limits stdout/stderr bytes to prevent disk/memory exhaustion.
  - *Cancellation*: Clean abort signal integration.
- **Acceptance Verifier (`acceptance.ts`)**: Runs independent acceptance suites (e.g. `cargo test --quiet`) directly inside the agent's isolated workspace. An agent claiming success is never proof of success; only the independent test verdict determines `acceptance.status`.
- **CLI Adapters (`adapters/`)**:
  - `OpenCodeCliAdapter`: Non-interactive `opencode run --format json --auto --standalone` execution. Parses real JSON events, extracts real cumulative input/output token counts, and captures assistant output.
  - `CodexCliAdapter`: Non-interactive `codex exec --json --ephemeral -s workspace-write -C <workspace>`. Honestly captures real quota errors and exits without crash or fabrication; marks uncollected tokens as `missing`.
  - `MockCodingAgentAdapter`: Deterministic offline agent for reproducible unit testing (solves, fails, times out, or emits malformed output).
- **Benchmark Runner (`runner.ts`)**: Coordinates single-agent task execution, produces contracts v1 `RunRecord`, `ExecutionTrace`, `EvidenceReport`, and `PerAgentOutcome`.
- **Session Orchestrator (`session.ts`)**: Coordinates multi-agent runs on identical frozen tasks, producing `BenchmarkSession` and `ComparisonReport` with strict comparability rules (missing tokens or mismatched accounting scopes disallow direct ranking).

### Configuration

- `BIFROST_IMPLEMENTATION=02`: Activates Bifrost #02 adapter and benchmark catalog in Fastify.
- `BENCHMARK_AGENT=mock|opencode|codex`: Selects the agent adapter for single-run execution (defaults to `mock` for deterministic offline operation).

Build/deployment boundary: `npm run build` outputs `dist/api/server.js` and `dist/web/`. `npm start` launches API; serve web via a static host/reverse proxy forwarding same-origin `/api` to the API. Set a persistent DATA_DIR outside artifacts. No deployment or public exposure is performed by bootstrap. Do not put Tavily keys in Vite environment variables.
