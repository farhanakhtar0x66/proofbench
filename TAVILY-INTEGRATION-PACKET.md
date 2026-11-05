# Tavily B05 integration packet

Prepared November 5, 2026, for Farhan's Bifrost #01 integration. This packet describes the existing general verifier boundary; it is not authorization to publish, merge, enable live traffic, or replace the destination application.

## 1. Source snapshot and transfer

Source repository: `https://github.com/farhanakhtar0x66/proofbench.git`.

- Feature branch: `feat/tavily-verifier`.
- Exact committed HEAD: `a63ebeaac67ee8a6b15319dafcf86b58e39c385` (`fix(tavily): configure bounded search deadlines and explain retrieval failures`).
- Local ref comparison at preparation: `origin/feat/tavily-verifier` was `3670fcb`, 70 commits behind HEAD; HEAD had zero commits behind that cached remote ref. The local remote-tracking ref may be stale; no new fetch was used to assert current GitHub state. The remote branch does not contain HEAD on the evidence available here. `main` is `ed69cd1`; the verifier branch is substantially diverged.
- Working tree overlay on HEAD: uncommitted README/handoff updates, comparison prompt policy and regressions, plus new milestone summary/policy files. `git status --short` lists the precise files. The 838-test count includes this overlay; the committed HEAD handoff reports 829 tests. Do not represent the overlay as committed or assume HEAD alone contains it.
- No push, PR, merge, or change to Farhan's branch was made.

At the source checkout, commit `a63ebea` identifies only the committed snapshot. To preserve the current verifier files and local overlay as well, first create a review branch/worktree and transfer the exact package/API/contracts/frontend files listed below plus the listed overlay. Do not cherry-pick all 70 commits or copy the entire repository over the destination. The source has no prepared standalone integration commit or patch yet; this document is the reviewed transfer boundary.

## 2. Minimum implementation inventory

Transfer the **complete** `packages/tavily/src/` module set (including its internal helper modules), not just its public `index.ts`. This preserves transitive runtime imports and safeguards. The tracked committed source inventory at HEAD is available with:

```sh
git ls-tree -r --name-only a63ebea -- packages/tavily/src packages/contracts/src apps/api/src/app.ts apps/api/src/server.ts apps/api/src/store.ts apps/web/src/Verifier.tsx apps/web/src/api.ts
```

The minimal integration groups are:

- **Tavily backend:** every TypeScript file under `packages/tavily/src/`; package entry [packages/tavily/src/index.ts](packages/tavily/src/index.ts), combined orchestration [packages/tavily/src/analysis.ts](packages/tavily/src/analysis.ts), extraction, retrieval, budget/cache, comparison, Bifrost adapter/config and their imported helpers. `packages/tavily/package.json` declares the workspace package but no direct dependencies of its own.
- **Shared runtime contracts:** the analysis/extraction/retrieval/comparison schemas and their type exports in `packages/contracts/src/index.ts`; preserve the destination's existing execution/run/trace/report contracts. The current contract source is a shared monolith, so merge the named analysis schemas into the existing contract module rather than replacing it wholesale. Required public schemas are `ClaimExtractionRequest/Report`, `EvidenceRetrievalRequest/Report`, `EvidenceComparisonReport`, `AnalysisRequest/Status/Report`, and nested `VerificationSource`/reason-code definitions.
- **API mounting:** the relevant imports, one shared `SearchBudget` and `ComparisonCache`, `/api/analysis` handler and analysis-readiness/status/read routes from `apps/api/src/app.ts`; app construction/configuration and report persistence from `apps/api/src/server.ts` and `apps/api/src/store.ts` as compatible with the destination. Keep Farhan's existing job, coding-agent, run and trace routes intact.
- **Website use:** `apps/web/src/Verifier.tsx` and `apps/web/src/api.ts` show the existing user flow and wire schemas. Farhan's frontend can retain its own design while sending factual checks to `/api/analysis`; keep `/api/verify` as a legacy compatibility path and label it as a narrow fixture verifier, not the equivalent general pipeline.
- **Configuration and validation references:** root `.env.example` entries below; root workspace `package.json` scripts/dependency versions; `tests/analysis.test.ts`, `tests/general-retrieval.test.ts`, `tests/evidence-comparison.test.ts`, `tests/comparison-references.test.ts`, `tests/contracts.test.ts`, and relevant package tests. Port/launcher details are covered by `docs/EVIDENCE-FIRST.md`.

Dependencies used by the integrated path are the workspace versions of `fastify` and `zod` at the API/contracts boundary, `react`/`react-dom` and `vite` for the existing frontend, and Node built-ins for transport, UUIDs, timers and file persistence. Development checks use TypeScript, tsx, Vitest, ESLint, esbuild and Playwright. There is no separate Tavily SDK package; Tavily uses `fetch`. Preserve the root lockfile/workspace versions; do not install a second Fastify/Zod copy in the feature package.

**Do not transfer or replace** Bifrost coding-agent controllers/jobs, `implementations/bifrost-01`, coding fixtures, native execution, `AgentAdapter`, `RunRecord`, `ExecutionTrace`, or `EvidenceReport` to obtain factual verification. Those belong to the destination application.

## 3. HTTP and report contract

The primary pipeline is:

```http
POST /api/analysis
Content-Type: application/json

{"version":"1","text":"The EU GDPR became applicable on 25 May 2018.","scope":"current"}
```

`scope` is optional: `as_stated` is the default; `current` requests current factual applicability and separates that assessment from the publication-date freshness score. Do not promise historical certainty from retrieval date.

Successful creation returns HTTP 201 with `AnalysisReport`: `{version,id,mode,createdAt,text,scope,status,extraction,omittedClaims,results,limits,limitations}`. Each selected result contains exact source-span `{text,start,end}`, a `retrieval` report, and `comparison`. Retrieval carries the query, scope/window, status, up to three citations with exact excerpts, source URL, dates, retrieval time, source/scope warnings and limitations. Comparison carries `supported | contradicted | inconclusive`, `verificationStatus: completed | blocked | failed`, method/reason, citations with relation/eligibility/date/context, explanation, freshness and optional recency score, and an optional exactly corroborated correction. A completed assessment can be inconclusive; HTTP 201 is report creation, not proof of fact.

Response shape (fields elided only for readability; the runtime Zod contract is authoritative):

```json
{
  "version": "1",
  "id": "persisted-report-id",
  "mode": "live",
  "status": "complete",
  "extraction": { "method": "rules", "claims": [{ "text": "...", "start": 0, "end": 12 }] },
  "results": [{
    "claim": { "text": "...", "start": 0, "end": 12 },
    "retrieval": { "status": "retrieved", "evidence": [{ "url": "https://example.org/source", "excerpt": "...", "publishedAt": null }] },
    "comparison": {
      "method": "llm", "verificationStatus": "completed", "outcome": "inconclusive",
      "freshness": "unknown", "freshnessScore": null, "explanation": "...",
      "citations": [{ "sourceId": "S1", "relation": "insufficient", "eligible": true, "dateReason": "..." }],
      "correction": null
    }
  }]
}
```

The snippet is illustrative and uses placeholder evidence; it is not a saved/live report. Use `AnalysisReport` to construct/validate the complete response.

Other APIs to preserve:

| Route | Purpose |
| --- | --- |
| `GET /api/analysis/status` | Current mock/live mode, extraction/comparison modes and model readiness/description |
| `GET /api/analysis/readiness` | Runtime allowance and selected comparison readiness; explicitly not billing, account quota or gateway-health proof |
| `GET /api/analysis/:id` | Read a persisted analysis by report ID |
| `POST /api/claims/extract` | Rules/model exact-span claim extraction building block |
| `POST /api/claims/retrieve` | Server-side evidence retrieval building block |
| `POST /api/claims/compare` | Evidence comparison building block |
| `POST /api/verify`, `GET /api/verify/:id` | Legacy narrow verifier compatibility only |

Runtime schemas are authoritative in `packages/contracts/src/index.ts`; use them as wire contracts. Do not create structurally similar duplicate interfaces in the destination frontend or API. Keep report storage in the destination's persistence layer and implement `GET /api/analysis/:id` there. The source uses a JSON file store behind a small `JsonStore` API.

## 4. Environment, ports and safe startup

All provider credentials remain server-side. The source `.env.example` defaults are offline/rules-only and zero-cap:

```dotenv
TAVILY_MODE=mock
TAVILY_API_KEY=
ALLOW_LIVE_REQUESTS=false
TAVILY_MAX_REQUESTS=0
TAVILY_TIMEOUT_MS=20000
LANGUAGE_MODE=rules
CLAIM_EXTRACTION_MODE=rules
EVIDENCE_COMPARISON_MODE=rules
BIFROST_LLM_PROVIDER=gemini
BIFROST_LLM_ENDPOINT=http://127.0.0.1:8080
BIFROST_LLM_MODEL=
BIFROST_LLM_TIMEOUT_MS=20000
BIFROST_FREE_TIER_CONFIRMED=false
BIFROST_LLM_MAX_REQUESTS=0
GEMINI_API_KEY=
GROQ_API_KEY=
HOST=127.0.0.1
PORT=3001
DATA_DIR=.local/data
```

Never copy secret values. The live endpoint requires a server key, `TAVILY_MODE=live`, `ALLOW_LIVE_REQUESTS=true` and an explicitly chosen positive `TAVILY_MAX_REQUESTS` (1–50). The cap is per API process, failed attempts count, and restarts reset it. It is not an account billing guard. Hosted inference requires an explicit `BIFROST_LLM_PROVIDER=gemini|groq`, matching provider/model, explicit account/free-tier confirmation, a provider key and positive `BIFROST_LLM_MAX_REQUESTS`; there is no cross-provider fallback. Comparison uses a local Bifrost endpoint, normally port 8080, configurable with `BIFROST_LLM_ENDPOINT`.

Farhan's coding inference port 8089 and Mohit's hosted-comparison gateway port 8080 must remain separate settings. Keep the coding app's existing `BIFROST_IMPLEMENTATION`/coding inference config untouched. The source verifier already reads `BIFROST_LLM_ENDPOINT`; it does not require a shared hard-coded gateway port. Avoid a single global `BIFROST_URL` override unless both apps explicitly consume separate configuration keys.

The Tavily deadline defaults to 20 seconds and accepts 1–30 seconds; each Tavily attempt is made once with no automatic retry. The hosted Bifrost adapter has its own configured timeout, per-instance cap and 60-second failure cooldown. Keep `HOST` and `PORT` compatible with the destination's existing server; do not bind a second API over Farhan's coding routes.

## 5. Evidence and reproducible offline checks

Current evidence classifications and the credential-free report are in [TAVILY-MILESTONE.md](docs/TAVILY-MILESTONE.md) and [the validation summary](docs/examples/tavily-live-validation.v1.json). The implementation/evidence-first record is [handoff.md](handoff.md), [EVIDENCE-FIRST.md](docs/EVIDENCE-FIRST.md), and [EVIDENCE-FIRST-RESULTS.md](docs/EVIDENCE-FIRST-RESULTS.md).

- **Offline/simulated:** `npm test -- --maxWorkers=1`, `npm run lint`, `npm run typecheck`, `npm run evaluate`, `npm run build`, `npm run smoke:api`. Latest observed on November 5: 838 tests across 68 files, lint/typecheck/build, six fixture cases and API smoke passed; after the prompt overlay, 65 focused tests also passed. These use mocks/synthetic evidence and establish no provider accuracy.
- **Browser:** `PLAYWRIGHT_BROWSERS_PATH=.local/playwright npm run test:ui` ran 20 desktop/mobile tests successfully on November 5 using isolated local API/web servers forced to mock/rules mode. It made no provider calls. This verifies UI/API in offline mode, not live browser-to-provider behavior.
- **Real Tavily retrieval:** November 3 saved check passed one Basic retrieval, cache reuse and one-budget exhaustion. Three excerpts, zero model calls; no truth judgment. The provider response did not report billed credits.
- **Real model comparison / combined flow:** November 4 saved fresh combined API submissions produced a supported/contradicted historical GDPR pair using one shared Tavily search and two Bifrost/Gemini comparisons. The four-case evidence-first check on November 5 used new Tavily/Groq calls: three of four selected labels matched; the Python support case abstained. Both batches were small development checks, not independent accuracy estimates. The later support/table and Tavily timeout changes have no fresh provider retest recorded. The country/population case had a live Tavily timeout before comparison; no retry was made.
- **Saved-source continuation:** classify separately from fresh retrieval. A successful saved-source model comparison demonstrates model transport on supplied prior excerpts only; it is not a new Tavily-to-verdict run.

Do not make any additional Tavily, Gemini or Groq requests from this packet. Further live requests require Mohit's new explicit per-provider limits and confirmed account billing controls.

## 6. Frozen independent-evaluation seed

Use `docs/EVIDENCE-FIRST-RESULTS.md` only as a development record. Do not relabel its four developer-selected claims as an independent holdout. Before evaluation, Khushi should create and hash a separate small set covering supported, contradicted, ambiguous, historical and misleading evidence, with independently verified reference labels and source snapshots. Freeze it before running against this verifier; record abstention and wrong-decisive rates separately. Do not use its outcomes to tune this frozen run. No independently labeled holdout is included in the present packet, and no external facts are invented here to fill that gap.

## 7. Destination merge risks

- `packages/contracts/src/index.ts`: merge only the named verifier schemas and referenced source fields/enums; do not overwrite execution contracts or duplicate exports.
- `apps/api/src/app.ts` and `server.ts`: mount unique `/api/analysis*` routes on Farhan's existing Fastify app. Keep `/api/verify` and all coding-agent/job/run/acceptance routes. Avoid registering a second app/listener on the same host/port.
- `apps/api/src/store.ts` versus the destination persistence: adapt the `analysis` record kind to existing storage; do not replace stored coding runs or acceptance evidence.
- `apps/web/src/Verifier.tsx`, `src/api.ts` and `vite.config.ts`: adapt route/client/schema/base URL to destination conventions; don't copy the dashboard or proxy config wholesale. General facts use `/api/analysis`; `/api/verify` remains labelled legacy.
- Environment: namespace verifier caps/mode and preserve separate `BIFROST_LLM_ENDPOINT` vs Farhan's port-8089 coding endpoint. Never expose keys through `VITE_*`.
- Root `package.json`, workspaces and lockfile: preserve the destination dependency graph and scripts. Avoid replacing versions or workspaces wholesale.

## 8. Minimal acceptance checklist

- [ ] Farhan's existing coding-agent/job/run/acceptance endpoints and stored data still work after verifier routes are mounted.
- [ ] The same Fastify listener serves unique `/api/analysis`, readiness/status, and saved-report routes; legacy `/api/verify` remains compatible and clearly distinct in the UI.
- [ ] A test request returns exact claim offsets and the version-1 analysis/report schemas; a returned ID loads the same persisted report after API restart.
- [ ] Mock/rules defaults make zero external calls; malformed requests and missing report IDs fail safely.
- [ ] With isolated fake transports, retrieval and inference caps, cache behavior, blocked/failed status, cooldown and no-retry rules hold. Tests do not spend provider credits.
- [ ] Gemini and Groq can each be selected explicitly through the hosted gateway setting; port 8080 config remains separate from coding port 8089. No model/key data reaches browser configuration.
- [ ] A bounded, separately approved live smoke run checks the current merged source at the agreed Tavily/model ceilings; record actual stages and abstentions. This packet does not authorize that run.
- [ ] The frozen independent set is scored without post-freeze tuning; report coverage, abstentions and wrong decisive verdicts, not only an overall pass rate.

Prepared from current local refs and saved reports. No integration was performed on Farhan's branch; stop here and hand this packet to the integrator.
