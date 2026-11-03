# Retrieval for ongoing captain appointments

This addresses the mismatch found in the real-source comparison: reports about someone wearing the armband in a particular match do not settle an ongoing club-captain appointment. The improvement changes search planning and ordering, not the original assertion or truth policy. It is offline-tested; no live query or model request was made for this implementation.

## Search behavior

With explicit `scope: current`, clear ongoing captain-role claims now seek appointments/hierarchy:

```text
Claim: Cristiano Ronaldo is captain of Real Madrid.
Query: Real Madrid current club captains captaincy appointment official sources
```

This is sample input to investigate, not an endorsed fact. The query does not assume that the named holder is right or wrong. There are no hardcoded clubs, players or website mappings. `official sources` is a search hint, not verification of ownership or authority. The same basic-search limit, date window and three-result cap apply; no second search, model query generator or paid fallback is added.

Straight English `is [not/currently] ... captain of/for ...`, `serves as captain for ...`, and possessive forms such as `Acme FC's current captain is Alex` are recognized. Object-side region/year qualifiers remain in the query. Explicit match/game/opponent or acting/temporary claims retain their event scope instead of being silently promoted to ongoing appointment claims. Explicit ongoing club-role language has priority when a sentence also mentions a game.

Historical (`was`, `formerly`, `previously`), conditional, explicitly attributed/quoted and modal statements recognized by the conservative planner remain literal rather than becoming an invented current appointment query. Unknown wording also falls back to the original claim plus the existing current-evidence hint. These are limited English patterns, not universal parsing or multilingual evaluation. Omitted scope (`as_stated`) preserves the original literal query and retrieval order.

## Source ordering and scope checks

For ongoing captain claims in current scope, returned excerpts receive a heuristic `scopeHint`:

- `appointment`: clear club/permanent/first-team captain wording, or season/hierarchy appointment language.
- `match_only`: temporary captaincy, starting/serving as captain for a game, receiving the armband at a match's end, or captaincy against a particular opponent.
- `unspecified`: no qualifying scope signal.

Within the at-most-three usable returned results, appointment excerpts rank first, unspecified context next, and match-only coverage last. Sorting is stable within each tier. Excerpts, URLs and dates are preserved exactly as collected; match reports are not silently deleted. `scopeHint` is not a relation, authority score or verified factual classification. All results remain unreviewed context. An excerpt denying an appointment can still be appointment-relevant; ranking does not treat it as support.

Retrieval and comparison now share the same captain-scope helper. The comparison independently recomputes scope from claim and excerpt instead of trusting the hint. An explicit match appointment such as `named captain for this match` must not be promoted solely because it contains nomination language. Actual appointment evidence can still require semantic review: a recent date and a role keyword are not proof of relevance, independence or truth. The old saved match reports still result in scope-based abstention without inference.

## Limits and validation

This cannot guarantee that one search finds two suitable sources. A strict recent-date filter may omit the official appointment announcement if it is old or undated. The query may still return tangential pages. No age threshold, citation requirement, correction check, inference cap or search cap is weakened to manufacture a verdict. A useful result can still be inconclusive.

On November 3, 2026, the full check passed 385 tests, including 15 new appointment-retrieval tests, lint, TypeScript, six fixture regressions and build. Tests cover common affirmative/negative/possessive forms, qualifiers, historical/modal/event claims, one-game nominations, source ordering/text preservation, cache reuse, unchanged basic-search parameters and safe abstention. Upstream responses are mocked. `.env` remains unchanged, and the website still uses the older offline flow.

Next is a separately capped live retrieval check for this new query strategy. A successful fetch alone will not validate a factual verdict; scope and semantic evidence review still apply before website integration.

General comparison also applies a conservative [repeated-passage check](EVIDENCE-OVERLAP.md), so articles with different introductions but a substantial shared sentence do not count as separate corroboration. This does not establish complete source independence.
