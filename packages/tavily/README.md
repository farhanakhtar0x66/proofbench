# Verification rules

## Offline practice

Run `npm run practice` from the repository root, then type one claim and two sample source statements. Try claim `Acme Pro costs USD 20/month.` with evidence `Acme Pro costs USD 25/month.` and `The monthly price of Acme Pro is USD 25.` The simulated result should be contradicted/stale with score 0. `npm run practice -- --example` runs this example without prompts.

The practice tool runs the real comparison pipeline with an injected fake search response. It does not load .env, use your key, make network requests or persist reports. Publication dates and source hostnames are fabricated for the simulation; results are labeled practice only and do not establish real-world truth. Type your own English claims and evidence; unsupported wording remains inconclusive. Blank source statements provide no evidence.

Mock mode uses the existing offline fixtures. Tests inject fake search responses and require no API credits.

Live comparison currently recognizes only these English statement shapes:

- `The current CEO of Acme is Alice.`
- `Acme latest API version is 2.3.` (API is optional)
- `Acme Pro currently costs USD 5 per month.`

Equivalent common wording is also supported: `Alice is the CEO of Acme.`, `Acme's latest API version is v2.3.`, `Acme Pro costs USD 5/month.`, and `The monthly price of Acme Pro is USD 5.` Curly apostrophes and version prefixes normalize consistently. Currency symbols ₹, €, and £ normalize to INR, EUR, and GBP. A bare $ remains ambiguous between dollar currencies and is not assumed to mean USD; use an explicit currency code. Product/plan names and billing units must still match; approximate, future and negated statements abstain.

Pricing requires an explicit currency (USD, INR, EUR or GBP) and unit (month, year, million input tokens or million output tokens). Entity, category and unit must match exactly after case and whitespace normalization. Negated, historical and speculative statements abstain.

A source must contain a matching statement and a publication date within the previous 30 days. Missing dates never imply freshness from retrieval time. A verdict requires agreement from two distinct hostnames and no opposite relation. Hostnames do not establish independence or authority; these remain prototype limitations. Unsupported statements, mixed evidence and historical asOf requests remain inconclusive.

Internal conflicts also block a verdict: if one recent source both supports and contradicts the same entity and scope, the whole claim stays inconclusive even when two other sources agree. The explanation identifies that conflict and the score remains null.

Inconclusive explanations distinguish unsupported claim wording or ambiguous currency, missing usable sources, missing recent dates, conflicting sources, mismatched scope and insufficient corroboration. These messages do not trigger extra searches or change the scoring rules.

## Source ranking

`src/sources.ts` contains a reviewed `sourcePolicy`, initially empty. The team must review entity/domain/page mappings before adding entries. Tests use synthetic domains; there is no automatic domain guessing. For example, a rule can list an exact product/plan name, official hostname, allowed page prefixes and whether subdomains are included. Code callers can inject a separate policy through verifyAnswer options for testing. Public API callers cannot supply trusted domains.

Evidence is ordered as `official_direct`, `reviewed_secondary`, then `unreviewed`. Official-direct requires HTTPS, a reviewed entity and page match, and a recent directly comparable statement. Secondary status is a reviewed mapping, not proof of the statement. Relevance scores do not establish authority. Unknown entities, missing dates, HTTP pages, misleading hostname suffixes and unrelated pages cannot earn official-direct status.

Evidence includes optional sourceTier, sourceReason, duplicateOf and corroborationGroup fields. Repeated URLs ignoring fragments and common tracking parameters count once; meaningful query parameters remain distinct. Identical excerpts of at least 120 characters and 20 words count once. Short matching facts are not automatically considered plagiarism. Subdomains are grouped when a reviewed rule explicitly allows them. All conflicting evidence remains visible and can block a verdict regardless of rank.

Ranking prioritizes evidence but does not make official status a new prerequisite for the existing coarse verdicts. Agreement from unreviewed sources is explicitly labeled; it does not establish authority or independence. Paraphrased copies and unknown organizational relationships remain limitations. No extra searches are made, and the credit cap is unchanged.

## Automatic official candidates

Without a reviewed mapping, `likely_official` can be assigned using only the existing result URL, title and dated snippet: an exact compact entity/brand-domain match, HTTPS, an entity-specific title, a relevant pricing/leadership/documentation path, and recent direct comparable content are all required. Plan suffixes Pro/Basic/Enterprise/API can be removed for brand matching. Reviewed official and reviewed secondary sources both outrank automatic candidates.

This is an identity heuristic, not ownership verification. A lookalike operator can mimic title and content. Unsupported domain suffixes, deeper/custom subdomains, multi-part public suffixes and internationalized hostnames abstain rather than guessing. The result explains its signals and limitations; candidates are never counted as manually reviewed. Missing dates or unsupported claim wording also prevent automatic candidacy. No discovery requests, crawls or additional credits are used, and likely status alone cannot produce a verdict.

TAVILY_MAX_REQUESTS caps total search attempts for the lifetime of one Fastify application instance. Requests reserve budget synchronously, so concurrent calls cannot overspend. A failed attempt still consumes budget and is never retried automatically. Changing credentials or increasing configuration does not refill an existing budget.

Identical queries and credentials reuse search results for five minutes, retaining their original retrieval timestamp. Simultaneous identical searches share one in-flight request. Up to 100 completed searches are cached in memory; the cache does not store raw credentials. Expiry and eviction do not refund budget. Network requests time out after ten seconds.

Restarting the server resets its in-memory budget and cache. Multiple server instances each have their own cap. This is not an account-wide billing limit; keep Tavily account billing controls and live-mode consent configured accordingly.

Live mode requires TAVILY_MODE=live, ALLOW_PAID_REQUESTS=true, a server-side key and a positive cap. Default development remains mock mode.

Every new verification result includes freshnessScore. This coarse validity indicator is 100 for supported/current claims with recent corroboration, 0 for contradicted/stale claims with recent corroboration, and null for inconclusive results, missing qualifying evidence or mock fixtures. It is not confidence, a calibrated probability, or an evidence-quality rating. No intermediate values are emitted until evaluation supports a calibrated scale. Evidence recency and agreement are eligibility requirements, rather than arbitrary weighted bonuses.

The shared v1 schema accepts an optional nullable integer from 0 to 100 so older stored reports and frontend fixtures still parse. Missing scores mean unavailable. This additive contract change requires Farhan/Aryan review before merge; the frontend can display this field in a later UI change.
