# ProofBench

Execution evidence + standalone answer freshness verification for a four-person Global AI Hackathon team. Branding is provisional; UI name and package scope can be changed independently of contracts.

**Submission scope: ONE selected Bifrost implementation + permanent Tavily #01.** Bifrost #01 (token-efficient coding agent) and #02 (agent benchmarking platform) are alternatives under development by Farhan. Neither real implementation is integrated yet. Aryan is the hackathon team leader; Farhan owns this repository technically.

## Run offline

Node 22.12+ (CI: Node 22), npm, and Git. Rust is optional for web/API development.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open http://127.0.0.1:5173. API: http://127.0.0.1:3001/api/health. The dashboard initially displays a clearly marked example. **Run fixture** executes a local arithmetic check and records a real trace/report; this is simulated agent data, not an AI-agent performance result. Try “Python 2 is currently supported.” in Freshness verifier. Unknown arbitrary text stays inconclusive.

Frontend-only: `VITE_API_MODE=mock npm run dev:web` (no backend or Rust needed). In this mode verification deliberately stays inconclusive. Full integration: `npm run dev` uses the HTTP API and persists results under `.local/data/`.

```sh
npm run check             # lint, types, unit/API tests, fixture regression, build
npm run test:contracts
npx playwright install chromium
npm run test:ui            # starts local API + web; desktop and mobile
cargo test --manifest-path crates/neuromesh-bridge/Cargo.toml --locked
```

No command makes paid model or Tavily requests. ChatGPT Plus does not supply API credits. `TAVILY_MODE=live` fails closed until Mohit's metered integration is reviewed. Keys belong only in the server environment.

## Team boundaries

| Lead | First deliverable | Boundary |
| --- | --- | --- |
| Aryan — Team Leader / Product & Frontend | Refine dashboard and responsive interaction states | `apps/web`; independent architecture decisions within v1 API |
| Farhan — Architect / AI Systems & Integration | Review contracts and implement one adapter at a time | `packages/contracts`, `implementations`, native bridge |
| Mohit — Tavily Backend & Verification | Replace sentence extraction with claim extraction; design metered retrieval | `packages/tavily`, verify API; offline mocks first |
| Khushi — Evaluation, Research & Demo | Independently validate and expand source-backed holdout dataset | `fixtures`, acceptance rubric, adversarial testing and demo |

See [architecture](docs/ARCHITECTURE.md), [contracts](docs/CONTRACTS.md), [integration](docs/INTEGRATION.md), [track selection](docs/TRACK-SELECTION.md), [evaluation](docs/EVALUATION.md), [team policy](CONTRIBUTING.md), [reuse disclosure](docs/REUSE-DISCLOSURE.md) and [local source adaptation](docs/NEUROMESH-ADAPTATION.md).

## Honest limits

The verifier is an exact fixture lookup with sentence splitting, not completed Tavily retrieval/semantic verification. Fixture regressions measure plumbing, not verification accuracy. Persistent JSON storage is local prototype storage, not a multi-user production database. Bifrost `01` and `02` return unsupported (HTTP 501). The Rust executable is a capability probe only. Default server binding is loopback; deployment remains a team-reviewed step. November 15 is our internal prototype target; exact organizer cutoff and reuse eligibility require confirmation.
