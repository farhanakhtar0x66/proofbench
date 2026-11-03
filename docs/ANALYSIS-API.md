# Combined answer analysis API

`POST /api/analysis` combines existing claim extraction, Tavily retrieval and evidence comparison. It reuses the same interpreter, search cache, server budgets, schema validation, relevance checks and failure cooldown as the separate endpoints. No direct provider integration, retry, extra evidence search or paid fallback is introduced.

Request:

```json
{"version":"1","text":"Acme Pro costs USD 20/month.","scope":"current"}
```

`scope` is optional and defaults to `as_stated`; `current` uses the existing dated search plan. Input text is preserved for exact extraction offsets. Clients cannot supply evidence, keys, provider selection, spending consent or request caps in this request. The existing server environment controls these settings. `CLAIM_EXTRACTION_MODE=rules` avoids the extraction inference call; optional `llm` uses the existing extractor and its rules fallback. `EVIDENCE_COMPARISON_MODE=llm` and a ready adapter are required for general model-backed comparison. Default rules/mock settings make no API requests and return inconclusive results with offline explanations. The older narrow deterministic `/api/verify` route remains available.

The response has HTTP 201 and contains `id`, original `text`, `mode`, `scope`, `extraction`, `results`, `omittedClaims`, `status`, `limits` and `limitations`. Each result contains the original claim text/offsets, the retrieval report and the comparison report, including outcome, explanation, source citations and any validated correction. `GET /api/analysis/:id` returns the persisted report; unknown IDs return 404. Storage uses the existing server data directory.

Up to three distinct extracted statements are processed in original order. Repeated identical statements share their first result; the extraction report still preserves the original extracted spans. `omittedClaims` counts distinct extracted statements beyond this processing limit, not sentences the extractor itself missed or truncated. At most three searches and four model attempts can occur per analysis (one optional extraction plus three comparisons). Shared server caps may be lower, and cache hits or failed readiness/relevance checks reduce requests. These are inference/search limits, not a count of provider catalog metadata calls. Repeated analysis submissions can consume additional model allowance; do not automatically retry POST requests.

Status meanings:

- `complete`: every selected comparison produced a validated model assessment and no distinct extracted claims were omitted. An individual verdict can still be inconclusive. This is pipeline completion, not an accuracy certificate.
- `partial`: claims were omitted, extraction used fallback, or any comparison could not complete through the model. Completed earlier results remain available. Model/search failures do not fabricate corrections or decisive outcomes.
- `no_claims`: extraction returned no factual assertions; for example, question-only input. Extraction is heuristic and can miss facts.

When a model becomes unavailable, later claims do not start new searches; matching cached evidence can still be returned with inconclusive comparisons. A search failure, empty result or insufficient evidence produces a per-claim inconclusive result rather than deleting earlier results. Invalid requests/configuration and unexpected storage failures still use existing API error responses. A process crash cannot guarantee a saved partial report.

The separate comparison endpoint now uses the same orchestration helper, avoiding two divergent failure paths. No extra HTTP call is made internally. Processing is sequential and non-streaming, so several claims can take multiple model deadlines plus search deadlines. Frontend timeout/progress/cancellation work remains part of website integration; the current website still uses the older verifier route. No complete live-flow success is claimed from offline tests.

Validation on November 3, 2026 passed lint, TypeScript, all 422 tests across 32 files using one worker, six offline fixture regressions, production build and the offline API smoke check. New integration coverage verifies source spans, claim bounds, duplicates, request validation, empty extraction, stored-report lookup, a successful synthetic model-backed chain, partial results after rate limiting, four total model attempts and shared search-budget enforcement across endpoints. Test upstreams are simulated; `.env` remains unchanged and zero provider requests were made.
