# Integrating Farhan's implementation

1. Create `feat/bifrost-01-adapter` or `feat/bifrost-02-adapter` from current main. Keep source inside the corresponding `implementations/` module; do not replace apps or shared packages.
2. Implement `AgentAdapter` from `packages/contracts/src/index.ts`. Export `bifrost01` or `bifrost02` using the existing entry point. Return a parsed RunRecord and ExecutionTrace; keep evidence truthful and unsupported capabilities false. Native paths must be environment/config driven, never another developer's absolute path.
3. Install/compile dependencies, pin revisions, document configuration and runtime limitations. Never invoke a shell on arbitrary API input. Build task workspaces, timeouts, bounded outputs, cancellation and credential isolation before exposing execution.
4. Map provider telemetry individually to known/missing/estimated/incomparable observations. Preserve provider source and accounting scope. Save actual check evidence; an agent's success statement is not an acceptance test.
5. Add the adapter's offline contract suite, malformed events, failed execution, partial/missing usage and reproducibility cases. Test the same published task against each actual backend once available, with no fabricated results.
6. Set `BIFROST_IMPLEMENTATION=01` or `02` in local `.env`. Run `npm run check`, `npm run test:contracts`, `npm run test:ui` plus native checks when touched. Live experiments require separate explicit budget authorization; they are never CI prerequisites.
7. Start `npm run dev`. Confirm capabilities, runs, trace/report, verification and the web UI. Mohit's Tavily module does not change with backend selection. `mock` remains available for independent development.
8. Open a PR linking implementation, test evidence, provenance, limitations and selection rationale. Obtain relevant review, validate CI, then merge without force-pushing or rewriting main. Only the chosen track is submitted.

Build/deployment boundary: `npm run build` outputs `dist/api/server.js` and `dist/web/`. `npm start` launches API; serve web via a static host/reverse proxy forwarding same-origin `/api` to the API. Set a persistent DATA_DIR outside artifacts. No deployment or public exposure is performed by bootstrap. Do not put Tavily keys in Vite environment variables.
