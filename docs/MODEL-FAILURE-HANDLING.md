# Model failures without losing retrieved evidence

The general comparison endpoint distinguishes configured rules-only mode, a missing adapter or key, an exhausted inference allowance, and a temporary failure cooldown. Gateway HTTP 504 and client timeout failures are described as timeouts; HTTP 429 is described as a rate limit. Other transport or invalid-output failures receive a safe generic diagnostic. Provider response bodies, credentials and arbitrary upstream errors are never included in these messages. The existing 60-second cooldown, deadlines, request budgets and no-retry policy remain unchanged.

When comparison is unavailable, the API can reuse matching evidence already in the shared Tavily cache. This is a cache-only read: a missing entry, different credential/query/date window or expired entry cannot trigger a new search. Existing in-flight searches can be shared, but a second search is never started by this path. The cache still expires after five minutes and is scoped to one server process. Restarting does not preserve these sources. Source access still requires live mode and the server's Tavily consent/key configuration; offline mode never exposes live cached evidence.

Retained citations preserve their source URLs, original excerpts, retrieval/publication dates and eligibility warnings. Their relation is `insufficient`, the outcome is `inconclusive`, freshness is unknown, and no correction is produced. Date eligibility does not mean a source was semantically assessed. The same preservation applies when comparison starts but its own inference fails. Suspicious instruction-like source text and invalid source metadata retain the existing protective behavior.

No frontend wiring is included in this change: these diagnostics and citations are available from `/api/claims/compare`, while the existing website still uses the older verification flow. Broader orchestration and website integration remain separate work.

Offline regression coverage includes extraction failure followed by cached retrieval/comparison, HTTP 504/429 diagnostics, comparison-stage timeout, absent cache entries, cache expiry, credential isolation, preserved timestamps, unspent search allowance, missing keys and exhausted model budgets. All upstream responses in these tests are simulated. No live model or Tavily requests are required.

Validation on November 3, 2026: lint, TypeScript, all 397 tests across 30 files using one worker, six offline fixture regressions and the production build passed. Actual `.env` settings were unchanged and no provider requests were made.
