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

Default mock development and automated checks make no paid Tavily requests. Live search requires `TAVILY_MODE=live`, `ALLOW_PAID_REQUESTS=true`, a server-only key and a positive `TAVILY_MAX_REQUESTS` cap. The cap covers one running API instance and resets on restart. Search results are cached for five minutes. ChatGPT Plus does not supply API credits. See [Tavily handoff](docs/TAVILY-HANDOFF.md) before enabling live mode.

## Team boundaries

Quick offline checks: `npm run smoke:api` exercises the API without server ports, and `npm run demo:verifier` demonstrates all three verdicts with simulated evidence. See the [API testing guide](docs/API-TESTING.md) and [demo guide](docs/DEMO-GUIDE.md) for commands, expected results, error behavior and presentation notes. Neither command loads .env or makes live requests.

| Lead | First deliverable | Boundary |
| --- | --- | --- |
| Aryan — Team Leader / Product & Frontend | Refine dashboard and responsive interaction states | `apps/web`; independent architecture decisions within v1 API |
| Farhan — Architect / AI Systems & Integration | Review contracts and implement one adapter at a time | `packages/contracts`, `implementations`, native bridge |
| Mohit — Tavily Backend & Verification | Replace sentence extraction with claim extraction; design metered retrieval | `packages/tavily`, verify API; offline mocks first |
| Khushi — Evaluation, Research & Demo | Independently validate and expand source-backed holdout dataset | `fixtures`, acceptance rubric, adversarial testing and demo |

See [architecture](docs/ARCHITECTURE.md), [contracts](docs/CONTRACTS.md), [integration](docs/INTEGRATION.md), [track selection](docs/TRACK-SELECTION.md), [evaluation](docs/EVALUATION.md), [team policy](CONTRIBUTING.md), [reuse disclosure](docs/REUSE-DISCLOSURE.md) and [local source adaptation](docs/NEUROMESH-ADAPTATION.md).

## Honest limits

Mohit's B05 implementation selects optional **Bifrost → Gemini** interpretation, with **Groq selectable explicitly**, alongside TypeScript/Fastify, Tavily evidence and deterministic verdicts. Rules-only remains the default; Ollama/llama.cpp setup is deferred. See [provider setup, cost controls and benchmarks](docs/B05-MODEL-PROVIDERS.md). The original interpretation schema has passed a real Gemini gateway smoke check and an eight-case development benchmark, with validation rejections explicitly recorded; these do not establish general accuracy. The new general extraction schema has only been tested offline. Routing through Bifrost alone does not solve its challenge. The Bifrost contribution and A04 Contract Guard remain separate research.

The new [general claim-extraction endpoint](docs/GENERAL-CLAIM-EXTRACTION.md) can identify source-preserving statements across topics, with optional Bifrost assistance and rules fallback. It does not verify truth or change the existing website verification flow; broader evidence comparison remains a later step.

Optional local language interpretation is documented in [Language interpretation](docs/LANGUAGE-INTERPRETATION.md). It is disabled by default, requires no model download for normal use/tests, and preserves rules-only behavior. Run `npm run benchmark:language` for recorded offline paired comparisons; real Ollama quality is not established by that simulation.

Mock verification uses exact fixtures with heuristic claim extraction. Live retrieval is integrated with a server-lifetime request cap and cache; comparison handles only narrow English pricing, version and CEO templates. Many real-world claims remain inconclusive. Numeric freshness is a coarse 0/100/null indicator, not calibrated confidence. Source authority and independence are not established. Fixture regressions measure plumbing, not verification accuracy. Persistent JSON storage is local prototype storage, not a multi-user production database. Bifrost `01` and `02` return unsupported (HTTP 501). The Rust executable is a capability probe only. Default server binding is loopback; deployment remains a team-reviewed step. November 15 is our internal prototype target; exact organizer cutoff and reuse eligibility require confirmation.
