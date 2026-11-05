# General current-scope evidence policy

General `/api/analysis` and `/api/claims/compare` requests with `scope: current` compare source content separately from publication recency. The literal/as-stated path retains its earlier strict date policy. The backend, model gateway, provider selection, frontend components and saved `.env` are otherwise retained.

## Verdict and recency

Current-scope searches no longer exclude documents using a publication-date filter. Up to six Tavily Basic candidates are requested, and up to three selected excerpts are compared. Missing dates and publications older than 30 days alone do not prevent comparison or factual corroboration. Publication validity, explicit historical/future scopes, metadata conflicts, duplicate evidence, incomplete context, prompt injection and exact source bindings retain their checks.

One usable source can reach model comparison. A model assessment of its excerpt is not automatically a decisive verdict: two eligible agreeing hostname groups are required unless a single source has an operator-reviewed identity binding. Hostname diversity is a heuristic, not proof of independence. Conflicting assessments remain inconclusive. The model must compare the supplied sources, preserve temporal/region/version qualifiers, distinguish upstream from vendor support, and return insufficient for ambiguous applicability. A past role announcement or end-of-life event alone does not prove today's role/support state.

A supported or contradicted result describes an evidence assessment, not independently proven truth. Older or undated corroboration can produce a factual verdict while `freshness: unknown` and `freshnessScore: null` disclose unconfirmed recency. Current freshness requires applicable recent supporting publications; a numeric score still requires two dated supporting groups. Retrieval time and page-update time never become publication time. Original quotes, dates, eligibility warnings and source links remain available.

## Clearly identified primary sources

An optional ignored local setting contains operator-reviewed bindings:

```env
TAVILY_PRIMARY_SOURCES=[{"entity":"Acme","urlPrefix":"https://acme.example/leadership"}]
```

This is a fictional configuration example. Before adding a real binding, the operator must establish that the URL belongs to the entity and is an appropriate primary source. Exact HTTPS origin and path-prefix boundaries are enforced, as is an entity mention in both claim and excerpt. Lookalike domains, model statements, page titles and domain-name resemblance cannot create a binding. Invalid bindings fail closed. A binding verifies an operator's identity decision, not the truth or current applicability of every statement on that site. The model still needs explicit supporting/contradicting content; date/scope/conflict gates still apply. Single-source results disclose that independent corroboration was not established and do not fabricate a numeric freshness score.

No list of thousands of sites is required for ordinary two-source comparisons. Unbound sites remain unreviewed. The earlier narrow reviewed official-role mapping remains for compatibility.

## Run a bounded manual website session

The saved defaults remain offline. If the operator authorizes a session of at most **five searches and five model comparisons**, run from the package root:

Terminal 1 (configured provider key, free-tier confirmation and model must already be valid):

```sh
npm run bifrost:start
```

Terminal 2:

```sh
env LANGUAGE_MODE=bifrost CLAIM_EXTRACTION_MODE=rules EVIDENCE_COMPARISON_MODE=llm \
BIFROST_LLM_MAX_REQUESTS=5 TAVILY_MODE=live ALLOW_LIVE_REQUESTS=true \
TAVILY_MAX_REQUESTS=5 npm run dev
```

Keep both terminals running. Use General claim analysis with Current sources. Submit one statement at a time while testing; a multi-claim input can consume several requests. The existing frontend's “last 30 days” current-scope label describes the earlier search policy; the frontend owner needs to update that label. No frontend component is changed here.

Check runtime configuration and search allowance without provider requests:

```sh
curl http://127.0.0.1:3001/api/analysis/readiness
```

This endpoint is not a provider-health/billing audit. Server-lifetime ceilings are shared by submissions and cached searches do not reset them. Exhaustion blocks further fresh searches; restarting is not authorization to spend more. Provider daily/minute quotas are separate. A single-statement rules-extraction submission needs at most one search and one model comparison, with zero inference retries. Bifrost startup catalog requests are separate metadata requests.

## Validation

Run `npm test`, `npm run lint`, `npm run build` and `npm run evaluate` for offline regressions. They validate date/recency separation, primary identity bounds, ambiguous evidence, conflicting evidence, exact quotes, protocol handling and allowance snapshots. They are not live accuracy measurements. Record fresh API checks and saved-source replays separately and retain failures. No arbitrary-statement reliability guarantee is implied by passing examples or test counts.

Fresh development results and the unresolved software-support case are recorded in [EVIDENCE-FIRST-RESULTS.md](EVIDENCE-FIRST-RESULTS.md).
