# Verification rules

Mock mode uses the existing offline fixtures. Tests inject fake search responses and require no API credits.

Live comparison currently recognizes only these English statement shapes:

- `The current CEO of Acme is Alice.`
- `Acme latest API version is 2.3.` (API is optional)
- `Acme Pro currently costs USD 5 per month.`

Pricing requires an explicit currency (USD, INR, EUR or GBP) and unit (month, year, million input tokens or million output tokens). Entity, category and unit must match exactly after case and whitespace normalization. Negated, historical and speculative statements abstain.

A source must contain a matching statement and a publication date within the previous 30 days. Missing dates never imply freshness from retrieval time. A verdict requires agreement from two distinct hostnames and no opposite relation. Hostnames do not establish independence or authority; these remain prototype limitations. Unsupported statements, mixed evidence and historical asOf requests remain inconclusive.

One basic search is attempted per unique eligible claim within each verification request, subject to TAVILY_MAX_REQUESTS. This cap resets for each API invocation; it is not an account-wide or server-lifetime spending limit. All attempts, including failures, consume the local budget. There are no retries. Duplicate results are reused only within a report. Network requests time out after ten seconds.

Live mode requires TAVILY_MODE=live, ALLOW_PAID_REQUESTS=true, a server-side key and a positive cap. Default development remains mock mode. No numeric freshness score is added to the shared v1 contract in this checkpoint.
