# General evidence retrieval

`POST /api/claims/retrieve` accepts one claim on any topic and gathers up to three Tavily source excerpts when live retrieval is explicitly enabled. It does not decide truth, assign a freshness score, infer missing entities, rewrite negation or classify a source as supporting/contradicting. The new extraction and retrieval APIs are separate building blocks. The existing website still calls `/api/verify`; a general evidence-comparison stage and website integration remain to be built.

## Offline use

Restart the API after code changes using `npm run dev` (starts the API and website), then:

```sh
curl -X POST http://127.0.0.1:3001/api/claims/retrieve \
  -H 'Content-Type: application/json' \
  -d '{"version":"1","claim":"Ronaldo is not the captain of Real Madrid in 2026."}'
```

This is unverified example input, not a statement of current truth. With saved `TAVILY_MODE=mock`, the endpoint returns `status: offline`, no evidence, and an explanation. It does not fabricate citations, consume credits or call an LLM. No `.env` change is included in this feature.

Response fields are `version`, `claim`, `query`, `mode`, `status`, `createdAt`, `retrievedAt`, `evidence`, `message` and `limitations`. Results pass Zod validation. Evidence includes HTTP(S) URLs without embedded credentials, titles, bounded snippets and available date metadata. Every source has `relation: context` and `sourceTier: unreviewed`. There is no support/contradiction verdict. Query whitespace is normalized, but case, negation, dates, currencies and conditions are preserved; no forced `current` suffix is added to historical claims.

Optional `scope: current` explicitly selects recent dated evidence; absent scope defaults to `as_stated` and retains the behavior above. Reports now also carry `searchScope` and optional `searchWindow`. See [scope, date-estimate limitations and budget behavior](FLOW-RELIABILITY.md). Current scope does not automatically make another search or grant another request allowance.

For ongoing captain-role claims, current scope also applies [appointment-oriented queries and ordering](APPOINTMENT-RETRIEVAL.md). Source `scopeHint` values are heuristic relevance metadata only; source relations remain context and authority remains unreviewed. Match-only coverage is retained, and the comparison guard independently checks whether its scope is appropriate.

## Live readiness and shared budget

Live mode requires all three existing controls: `TAVILY_MODE=live`, an ignored local `TAVILY_API_KEY`, and `ALLOW_LIVE_REQUESTS=true` with an explicitly approved positive `TAVILY_MAX_REQUESTS` between 1 and 50. The oddly named consent flag permits API requests; it does not inspect billing, purchase credits, or prove that the account is free. Keep it false until a specific experiment is authorized and free-credit/account settings are checked. The API client cannot override any of these through its JSON body. Empty, oversized or unexpected fields are rejected. One call accepts only one claim of at most 2,000 characters, so extraction of a long answer does not automatically trigger a batch of searches.

The endpoint reuses the existing Tavily search implementation: `search_depth: basic`, `max_results: 3`, no generated answer or raw-content fetch, one attempt, and a ten-second deadline. There is no automatic query expansion, inference, search retry, paid upgrade or alternate search provider. Tavily documents basic search as one API credit; free credits are still credits and account usage must be checked before live testing. [Official Tavily search reference](https://docs.tavily.com/documentation/api-reference/endpoint/search).

Within the Fastify server, both `/api/verify` and `/api/claims/retrieve` use the same `SearchBudget` instance. Calls to either consume the same server-lifetime allowance. Identical query/credential combinations reuse the existing five-minute cache and concurrent-call coalescing. Failed attempts count; they are not refunded. Cached results retain their original retrieval timestamp. A restart resets the process-local cap; do not restart to bypass an agreed allowance. Direct library callers should explicitly share a `SearchBudget` when combining APIs outside Fastify; otherwise each helper's default budget is independent.

Canonical duplicate URL detection reuses the existing URL helper, including tracking parameters and fragments. Empty excerpts and unusable URLs are omitted. Results contain at most three snippets, each at most 1,200 characters, with titles capped at 200 characters. Distinct URLs or hostnames do not prove source independence. Search results are not automatically official sources, and no pages beyond Tavily's returned snippets are fetched by this module.

Existing conservative date checks annotate missing, invalid, unsupported-format, old, future or conflicting dates. They normalize supported ISO formats and strictly validated English RFC-style GMT timestamps; other provider formats may still be unsupported. Publication metadata is not guaranteed by search, and a retrieval timestamp must not be substituted for it. Older sources remain available as context with warnings, rather than being silently removed or declared false. The existing thirty-day date policy is not a universal suitability rule for historical/scientific/legal evidence. Source selection, applicability and factual freshness belong to the next comparison stage.

## Status and failure handling

- `offline`: mock mode; no network call.
- `retrieved`: at least one usable source excerpt, with no truth assessment.
- `empty`: the search completed without usable excerpts; this does not contradict the claim.
- `budget_exhausted`: no new search was made; cached queries may still be available.
- `unavailable`: a request failed, timed out, was rejected/rate-limited or returned malformed data. No retry is made and upstream secret/error bodies are not returned.

Configuration/input errors use HTTP 400. Retrieval outcomes use HTTP 200 with the explicit status above; callers must inspect it. No sources are invented on failures. Source snippets are untrusted data; instructions appearing in them are retained as quoted context and are not executed or passed to a model by this endpoint. No Gemini or Groq key is used here.

## Validation and next step

On November 3, 2026, `npm run check` passed 307 tests, including 22 general-retrieval tests, lint, TypeScript, six fixture regressions and build. Tests use injected search responses, including unrelated topics, dates, unsafe/duplicate URLs, conflicting setup, concurrent budgets, cache reuse, prompt-injection text, 401/429/503, malformed responses, network errors and timeout cases. Fastify tests show that retrieval and old verification share one allowance. No real Tavily or LLM calls were made for this implementation.

A separately authorized live test passed on November 3, 2026 after the user confirmed 1,000 available credits and pay-as-you-go disabled. One basic search for the unverified sample claim `Cristiano Ronaldo is captain of Real Madrid.` returned three usable excerpts, from zhihu.com, Wikipedia and realmadrid.com. None included a publication date; the date warnings and unreviewed/context labels were retained. This does not establish that any source supports or contradicts the claim. Repeating the identical API request reused the cache with the same retrieval timestamp; a different query was blocked by the exhausted server budget. Exactly one external search attempt and zero model requests occurred. Expected credit usage is one basic-search credit, but the response did not report credit usage; verify the actual account balance in the Tavily dashboard. This is not an account billing audit or proof of citation authority.

The repeatable command is `npm run tavily:check:retrieval`. It is blocked by the saved offline settings. A deliberate run requires temporary process settings selecting live mode, explicit consent and exactly one request, with language mode rules and hosted-model cap zero. An additional transport wrapper rejects non-Tavily destinations, redirects and any second external request. The command exercises the real Fastify route without opening server ports, saves `.local/tavily-live-check/report.json`, then closes the test app and removes temporary stored reports. The actual check used process-only overrides; `.env` remained unchanged, with mock mode and both saved request caps zero. Do not repeat a failed live test automatically: an unsuccessful attempt may still use credit.

[Evidence-grounded comparison](EVIDENCE-COMPARISON.md) is now implemented and tested offline, with citations and conservative abstention. General retrieval now explicitly requests publication metadata for that stage, but the new parameter has not been tested live and dates remain optional/format-limited. Live comparison validation and website integration remain pending. Merely retrieving sources does not complete general fact checking.
