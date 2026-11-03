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

## Live readiness and shared budget

Live mode requires all three existing controls: `TAVILY_MODE=live`, an ignored local `TAVILY_API_KEY`, and `ALLOW_PAID_REQUESTS=true` with an explicitly approved positive `TAVILY_MAX_REQUESTS` between 1 and 50. The oddly named consent flag permits API requests; it does not inspect billing, purchase credits, or prove that the account is free. Keep it false until a specific experiment is authorized and free-credit/account settings are checked. The API client cannot override any of these through its JSON body. Empty, oversized or unexpected fields are rejected. One call accepts only one claim of at most 2,000 characters, so extraction of a long answer does not automatically trigger a batch of searches.

The endpoint reuses the existing Tavily search implementation: `search_depth: basic`, `max_results: 3`, no generated answer or raw-content fetch, one attempt, and a ten-second deadline. There is no automatic query expansion, inference, search retry, paid upgrade or alternate search provider. Tavily documents basic search as one API credit; free credits are still credits and account usage must be checked before live testing. [Official Tavily search reference](https://docs.tavily.com/documentation/api-reference/endpoint/search).

Within the Fastify server, both `/api/verify` and `/api/claims/retrieve` use the same `SearchBudget` instance. Calls to either consume the same server-lifetime allowance. Identical query/credential combinations reuse the existing five-minute cache and concurrent-call coalescing. Failed attempts count; they are not refunded. Cached results retain their original retrieval timestamp. A restart resets the process-local cap; do not restart to bypass an agreed allowance. Direct library callers should explicitly share a `SearchBudget` when combining APIs outside Fastify; otherwise each helper's default budget is independent.

Canonical duplicate URL detection reuses the existing URL helper, including tracking parameters and fragments. Empty excerpts and unusable URLs are omitted. Results contain at most three snippets, each at most 1,200 characters, with titles capped at 200 characters. Distinct URLs or hostnames do not prove source independence. Search results are not automatically official sources, and no pages beyond Tavily's returned snippets are fetched by this module.

Existing conservative date checks annotate missing, invalid, unsupported-format, old, future or conflicting dates. They currently normalize only supported ISO formats; even a real provider date may be unsupported. Publication metadata is not guaranteed by search, and a retrieval timestamp must not be substituted for it. Older sources remain available as context with warnings, rather than being silently removed or declared false. The existing thirty-day date policy is not a universal suitability rule for historical/scientific/legal evidence. Source selection, applicability and factual freshness belong to the next comparison stage.

## Status and failure handling

- `offline`: mock mode; no network call.
- `retrieved`: at least one usable source excerpt, with no truth assessment.
- `empty`: the search completed without usable excerpts; this does not contradict the claim.
- `budget_exhausted`: no new search was made; cached queries may still be available.
- `unavailable`: a request failed, timed out, was rejected/rate-limited or returned malformed data. No retry is made and upstream secret/error bodies are not returned.

Configuration/input errors use HTTP 400. Retrieval outcomes use HTTP 200 with the explicit status above; callers must inspect it. No sources are invented on failures. Source snippets are untrusted data; instructions appearing in them are retained as quoted context and are not executed or passed to a model by this endpoint. No Gemini or Groq key is used here.

## Validation and next step

On November 3, 2026, `npm run check` passed 307 tests, including 22 general-retrieval tests, lint, TypeScript, six fixture regressions and build. Tests use injected search responses, including unrelated topics, dates, unsafe/duplicate URLs, conflicting setup, concurrent budgets, cache reuse, prompt-injection text, 401/429/503, malformed responses, network errors and timeout cases. Fastify tests show that retrieval and old verification share one allowance. No real Tavily or LLM calls were made for this implementation.

A separately authorized, small live Tavily test remains pending. After retrieval is validated live, the next feature is evidence-grounded comparison with citations and conservative abstention. Merely retrieving sources does not complete general fact checking.
