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

Open http://127.0.0.1:5173. API: http://127.0.0.1:3001/api/health. The dashboard initially displays a clearly marked example. **Run fixture** executes a local arithmetic check and records a real trace/report; this is simulated agent data, not an AI-agent performance result. Freshness verifier defaults to general analysis, which stays inconclusive under the saved offline settings. For the canned “Python 2 is currently supported.” demonstration, select Legacy verifier / fixture demo. Unknown arbitrary text stays inconclusive offline.

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

For teammate setup, command explanations, current validation limits and production hosting checks, use the [B05 running guide](docs/TEAM-RUNNING-GUIDE.md). After `npm run build`, `npm run smoke:deployment` checks the compiled API offline, including report persistence across a restart. `npm start` serves the API only; the built website needs separate static hosting and an `/api` proxy.

General supported current assessments now include an [evidence-recency freshness score](docs/EVIDENCE-FRESHNESS.md). It measures the oldest qualifying supporting publication within the existing 30-day policy, not truth confidence. Contradicted, inconclusive, historical and offline results remain unscored.

Quick offline checks: `npm run smoke:api` exercises the API without server ports, and `npm run demo:verifier` demonstrates all three verdicts with simulated evidence. See the [API testing guide](docs/API-TESTING.md) and [demo guide](docs/DEMO-GUIDE.md) for commands, expected results, error behavior and presentation notes. Neither command loads .env or makes live requests.

`npm run evaluate:general` runs [14 cross-topic combined-API regression scenarios](docs/GENERAL-EVALUATION.md) with simulated search/model responses. It checks pipeline behavior and abstention with zero provider requests; its passing rate is not a model accuracy estimate.

`npm run benchmark:verification:prepare` prepares a [fixed ten-case rules/model benchmark](docs/VERIFICATION-BENCHMARK.md), locks the evidence snapshot with hashes and runs the deterministic baseline offline. Real model comparison remains pending; preparation uses zero provider requests.

| Lead | First deliverable | Boundary |
| --- | --- | --- |
| Aryan — Team Leader / Product & Frontend | Refine dashboard and responsive interaction states | `apps/web`; independent architecture decisions within v1 API |
| Farhan — Architect / AI Systems & Integration | Review contracts and implement one adapter at a time | `packages/contracts`, `implementations`, native bridge |
| Mohit — Tavily Backend & Verification | Replace sentence extraction with claim extraction; design metered retrieval | `packages/tavily`, verify API; offline mocks first |
| Khushi — Evaluation, Research & Demo | Independently validate and expand source-backed holdout dataset | `fixtures`, acceptance rubric, adversarial testing and demo |

See [architecture](docs/ARCHITECTURE.md), [contracts](docs/CONTRACTS.md), [integration](docs/INTEGRATION.md), [track selection](docs/TRACK-SELECTION.md), [evaluation](docs/EVALUATION.md), [team policy](CONTRIBUTING.md), [reuse disclosure](docs/REUSE-DISCLOSURE.md) and [local source adaptation](docs/NEUROMESH-ADAPTATION.md).

## Honest limits

Mohit's B05 implementation selects optional **Bifrost → Gemini** interpretation, with **Groq selectable explicitly**, alongside TypeScript/Fastify, Tavily evidence and deterministic verdicts. Rules-only remains the default; Ollama/llama.cpp setup is deferred. See [provider setup, cost controls and benchmarks](docs/B05-MODEL-PROVIDERS.md). The original interpretation schema has passed a real Gemini gateway smoke check and an eight-case development benchmark, with validation rejections explicitly recorded; these do not establish general accuracy. The new general extraction schema has passed offline tests and a controlled real Gemini schema smoke check preserving complete source sentences and qualifiers. Routing through Bifrost alone does not solve its challenge. The Bifrost contribution and A04 Contract Guard remain separate research.

The new [general claim-extraction endpoint](docs/GENERAL-CLAIM-EXTRACTION.md) can identify source-preserving statements across topics, with optional Bifrost assistance and rules fallback. It does not verify truth or change the existing website verification flow; the combined API below connects it to evidence retrieval and comparison.

The [general evidence-retrieval endpoint](docs/GENERAL-EVIDENCE-RETRIEVAL.md) collects Tavily excerpts for arbitrary claims when explicitly enabled, using the existing shared server search budget. It defaults to offline mode and returns no truth verdict. A controlled one-search Tavily check passed retrieval, cache reuse and budget blocking; general verdicts are not yet available in the website.

The new [evidence-comparison endpoint](docs/EVIDENCE-COMPARISON.md) adds optional Bifrost assessment of server-retrieved excerpts, backend citation/date checks, conservative verdicts and exact corroborated correction quotes. It is disabled by default. After an initial failed run, its strengthened schema passed offline tests and a separately authorized real Gemini smoke check using synthetic evidence. The complete real-source flow and website integration remain pending.

The first [real-source flow check](docs/GENERAL-FLOW-CHECK.md) exercised exact-claim fallback, real retrieval, shared caching and safe abstention. Extraction timed out and only one recent dated source group was returned, so model comparison was not exercised. The complete model-backed chain and website integration remain pending.

[Deadline coordination and explicit current-evidence search](docs/FLOW-RELIABILITY.md) add configurable bounded model waits and optional recent dated search within the same existing request cap. Offline checks pass; the later live result below improved extraction/source coverage but did not complete comparison. Saved offline settings are unchanged.

The subsequent current-evidence live check succeeded at model extraction and found two dated source groups, but comparison hit the gateway provider deadline and returned inconclusive. The complete flow remains unvalidated; saved-source continuation can test the remaining stage only after a fresh explicit model allowance.

The authorized saved-source comparison completed with a 30-second deadline, but review found that its match-captaincy evidence did not justify an ongoing-role verdict. A new scope guard correctly abstains on an offline replay of those sources. The live transport path is exercised; broader real-source semantic validation and website integration remain pending.

[Appointment-focused retrieval](docs/APPOINTMENT-RETRIEVAL.md) now seeks ongoing club-captain roles and ranks explicit appointment excerpts ahead of match-only coverage, using shared scope heuristics. It preserves the assertion, source text and request limits, and has only been tested offline so far.

Optional local language interpretation is documented in [Language interpretation](docs/LANGUAGE-INTERPRETATION.md). It is disabled by default, requires no model download for normal use/tests, and preserves rules-only behavior. Run `npm run benchmark:language` for recorded offline paired comparisons; real Ollama quality is not established by that simulation.

Mock verification uses exact fixtures with heuristic claim extraction. Live retrieval is integrated with a server-lifetime request cap and cache; comparison handles only narrow English pricing, version and CEO templates. Many real-world claims remain inconclusive. Numeric freshness is a coarse 0/100/null indicator, not calibrated confidence. Source authority and independence are not established. Fixture regressions measure plumbing, not verification accuracy. Persistent JSON storage is local prototype storage, not a multi-user production database. Bifrost `01` and `02` return unsupported (HTTP 501). The Rust executable is a capability probe only. Default server binding is loopback; deployment remains a team-reviewed step. November 15 is our internal prototype target; exact organizer cutoff and reuse eligibility require confirmation.

The [combined analysis API](docs/ANALYSIS-API.md) now runs extraction, retrieval and comparison in one request, returns up to three distinct per-claim results, and persists reports for lookup. It shares existing server caps/cache, retains partial results and defaults to offline behavior. The [website now uses this endpoint](docs/WEBSITE-ANALYSIS.md) by default in Freshness verifier, with an optional legacy fixture flow. Saved offline settings remain unchanged; a completed real-source model-backed flow remains unconfirmed.
