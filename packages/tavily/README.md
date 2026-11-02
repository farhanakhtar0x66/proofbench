# Verification rules

Mock mode uses the existing offline fixtures. Tests inject fake search responses and require no API credits.

Live comparison currently recognizes only these English statement shapes:

- `The current CEO of Acme is Alice.`
- `Acme latest API version is 2.3.` (API is optional)
- `Acme Pro currently costs USD 5 per month.`

Pricing requires an explicit currency (USD, INR, EUR or GBP) and unit (month, year, million input tokens or million output tokens). Entity, category and unit must match exactly after case and whitespace normalization. Negated, historical and speculative statements abstain.

A source must contain a matching statement and a publication date within the previous 30 days. Missing dates never imply freshness from retrieval time. A verdict requires agreement from two distinct hostnames and no opposite relation. Hostnames do not establish independence or authority; these remain prototype limitations. Unsupported statements, mixed evidence and historical asOf requests remain inconclusive.

TAVILY_MAX_REQUESTS caps total search attempts for the lifetime of one Fastify application instance. Requests reserve budget synchronously, so concurrent calls cannot overspend. A failed attempt still consumes budget and is never retried automatically. Changing credentials or increasing configuration does not refill an existing budget.

Identical queries and credentials reuse search results for five minutes, retaining their original retrieval timestamp. Simultaneous identical searches share one in-flight request. Up to 100 completed searches are cached in memory; the cache does not store raw credentials. Expiry and eviction do not refund budget. Network requests time out after ten seconds.

Restarting the server resets its in-memory budget and cache. Multiple server instances each have their own cap. This is not an account-wide billing limit; keep Tavily account billing controls and live-mode consent configured accordingly.

Live mode requires TAVILY_MODE=live, ALLOW_PAID_REQUESTS=true, a server-side key and a positive cap. Default development remains mock mode.

Every new verification result includes freshnessScore. This coarse validity indicator is 100 for supported/current claims with recent corroboration, 0 for contradicted/stale claims with recent corroboration, and null for inconclusive results, missing qualifying evidence or mock fixtures. It is not confidence, a calibrated probability, or an evidence-quality rating. No intermediate values are emitted until evaluation supports a calibrated scale. Evidence recency and agreement are eligibility requirements, rather than arbitrary weighted bonuses.

The shared v1 schema accepts an optional nullable integer from 0 to 100 so older stored reports and frontend fixtures still parse. Missing scores mean unavailable. This additive contract change requires Farhan/Aryan review before merge; the frontend can display this field in a later UI change.
