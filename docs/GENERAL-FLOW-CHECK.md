# Metered real-source flow check

`npm run verify:check:live` exercises the existing Fastify API without opening another server port:

1. Ask the configured Bifrost model to extract one exact factual statement.
2. Retrieve up to three real Tavily excerpts for that extracted claim.
3. Call the comparison route, which reuses the shared retrieval cache and then either assesses qualifying evidence through Bifrost or abstains before inference.

The sample input is `Cristiano Ronaldo is captain of Real Madrid.` It is an assertion to investigate, not a statement endorsed as true. The check does not force a predetermined truth verdict or fabricate date metadata to make evidence qualify. Model interpretation of real excerpts still is not an independent proof of factual accuracy.

The command requires explicit process settings: live Tavily consent with exactly one allowed search, language mode Bifrost with exactly two model attempts, and LLM extraction/comparison selected. The model's free-tier readiness must also be satisfied. Saved `.env` defaults remain offline. A transport wrapper permits only the Tavily search endpoint and configured local gateway completion endpoint, blocks redirects and extra calls, and refuses any second external search or third model attempt. Provider fallback and inference retries are not used. The earlier user-confirmed free account settings still apply; these flags cannot audit account billing.

The same Fastify app supplies one shared search budget/cache and one shared inference adapter to all routes. Comparison cannot make a second Tavily search for the same claim during the check. The report records each stage, real request counts, extracted text, retrieved sources and comparison output in ignored `.local/general-flow-check/report.json`. Temporary app storage is removed when the test ends. API keys and raw provider errors are not printed or saved to the report.

Only `status: completed` confirms that model extraction, real retrieval and model comparison all ran. `completed_with_extraction_fallback` confirms retrieval and model comparison after heuristic extraction fallback, not a successful model-extraction stage. `comparison_not_exercised` means the flow safely abstained before model comparison (for example, fewer than two recent dated source groups); it must not be reported as a completed model chain. `comparison_failed` means an actual comparison attempt did not yield a validated model result. Other failed stages stop the check. No failure triggers a new search or inference retry. Exact single-claim heuristic extraction can continue downstream after a model failure; it must retain the original statement rather than repair or invent one.

Basic search is expected to use one Tavily credit. Actual billing is not verified by the script. Gemini requests are capped at two, and the second is skipped when source-quality/date checks fail. The saved website settings are not enabled by running this command with process-only overrides. Website integration remains a separate task.

## Publication-format compatibility

The shared date parser now accepts supported ISO dates plus strictly validated English RFC-style GMT timestamps, such as `Tue, 11 Mar 2025 17:00:00 GMT`, as shown in Tavily's [search API reference](https://docs.tavily.com/documentation/api-reference/endpoint/search). Calendar components, clock fields and weekday must match exactly; impossible dates and rollover values are rejected. Unsupported timezone abbreviations and other ambiguous formats remain unknown. No date is inferred from retrieval time, and an old date stays old after normalization. This parser change is offline-tested before a real-source check.

## November 3, 2026 result

Offline validation passed 353 tests, lint, TypeScript, six fixture regressions and build. Eight tests cover the additional publication-date format, including invalid dates, clock rollover, weekday mismatches and unsupported timezones.

The first live extraction request timed out; Bifrost logged a cancelled Gemini request at about 8.43 seconds. The API retained the exact input through rules fallback. No Tavily search had occurred. The initial check stopped because it originally required model extraction. Its report was preserved as `.local/general-flow-check/extraction-timeout.json`.

The check then continued from that saved exact-claim fallback using only the remaining original allowance: one search and at most one comparison request. No extraction inference was retried. The script's `--resume-extraction` option requires a matching failed report with exactly one previous inference and no search, archives it without overwriting, and counts that prior inference against the total cap. It refuses an already-used continuation/report. Subsequent ordinary runs now also allow an exact heuristic fallback to continue without manual resumption.

Real Tavily retrieval with `include_published_date: true` returned three sources. A Zhihu result was undated, an X result was dated July 18, 2026 (outside the 30-day window), and a StatMuse result had a recent November 3, 2026 date. Publication metadata therefore worked for two results, but only one source group qualified as recent. Relevance, a recent date, or these domain names do not establish that a page answers the current-captain claim. The comparison route reused the cached search and abstained before inference because two qualifying groups were unavailable. No second search or model comparison was attempted.

Final report status: `comparison_not_exercised`, outcome `inconclusive`. Actual usage across the initial attempt and continuation was one Gemini attempt and one basic Tavily search (expected one credit, not a billing audit). The second authorized model attempt was unused. The temporary gateway was stopped, app storage removed, and saved `.env` settings remained rules-only/mock with both request caps zero. The current report is `.local/general-flow-check/report.json`.

This validates real retrieval, cache sharing, exact-claim fallback and date-based abstention for this case. It does not validate a complete model-extraction → real-source → model-comparison chain. Remaining work is extraction latency/reliability, better source coverage within an explicitly agreed search budget, and a passing real-source comparison check before website integration. No date or verdict was fabricated to make the test pass.

Subsequent [reliability changes](FLOW-RELIABILITY.md) add coherent configurable model deadlines and the checker's `--current-evidence` option. The later live retry is recorded below; the initial result was preserved locally.

## Current-evidence retry, November 3, 2026

After the user authorized a fresh one-search/two-model allowance, the reliability changes were tested live with a 20-second client deadline, 19-second gateway provider deadline and current-evidence scope. The previous report was preserved locally under a timestamped filename.

Model extraction succeeded (gateway latency about 18.30 seconds). The neutral query found two excerpts, from sports.yahoo.com dated November 2 and realmadrid.com dated November 1, both within the configured recency window. These are provider date estimates and unreviewed excerpts, not independently verified publication dates or proof of a current captain. Their availability addressed the earlier two-dated-group preflight gap for this case. The comparison reused the cached search and did make its second model request.

That comparison failed: Bifrost logged HTTP 504 with a timeout/deadline error after about 19.11 seconds. It was not reported as a schema failure or quota error. The final status is `comparison_failed`, with a safe inconclusive result rather than a fabricated correction. Usage was exactly one basic Tavily search and two Gemini attempts; no automatic retry occurred. The temporary gateway was stopped and saved offline settings/caps stayed unchanged. This run confirms extraction, dated retrieval and cache sharing but does not establish a completed comparison.

The follow-up command `npm run verify:check:saved -- --preflight-only` validates the saved envelope and counts without network requests. Without `--preflight-only`, the saved-source continuation requires a **new** one-model allowance and zero Tavily allowance, uses only the previously retrieved excerpts, and is limited to one request. It refuses to overwrite/repeat an existing continuation output. The existing configurable deadline can be deliberately set to its 30-second maximum for that one controlled test. This does not change `.env` or justify automatic retries. Even a successful saved-source comparison would be a continuation, not a new one-process end-to-end run.

## Saved-source continuation and scope review

The user authorized one additional Gemini request with zero Tavily searches. The continuation used a 30-second client deadline and 29-second provider deadline, completed in about 20.34 seconds, and returned a structurally valid `contradicted` assessment with no correction. Its unmodified record is `.local/general-flow-check/comparison-resume.json`, labeled `completed_with_saved_evidence`. Counts across the current-evidence run and this continuation are three Gemini attempts and one Tavily search. No further API calls were made; the temporary gateway was stopped and saved offline settings/caps remained unchanged.

Review of the actual quotes found that the two excerpts describe Courtois captaining a particular game or occasionally receiving the armband. That does not by itself settle who holds an unqualified ongoing club-captain appointment. The reports also cover the same underlying interview/event, so different hostnames do not establish independent corroboration. The model's decisive relation was therefore not treated as an established factual verdict, despite valid IDs, complete quotes and recent dates. A transport/schema success is not semantic validation.

An English scope guard now marks temporary/match-specific captaincy excerpts ineligible for an unqualified captain-role claim unless explicit ongoing appointment language is also present. Match-specific claims can still proceed to semantic assessment. An offline replay of the same saved real evidence now abstains before inference and returns `scopeReason` warnings, with no model or search request. That reviewed result is stored separately in `.local/general-flow-check/scope-review.json`; the original live response was not changed. This targeted heuristic does not solve all role ambiguity or shared-source provenance cases.

The full check after this change passed 370 tests, including six new scope tests, lint, TypeScript, six fixtures and build. All new scope tests and the replay were offline. The complete real-source flow still needs broader semantic validation and suitable evidence; the transport continuation alone must not be reported as a successful factual check. Website integration remains pending.

## Appointment-query check, November 3, 2026

After the appointment-query and repeated-passage changes, the user authorized at most one basic Tavily search and two Gemini inference requests, with no retries or paid fallback. The previous report was preserved under a timestamped ignored filename before running the checker with `--current-evidence`, a 30-second client deadline and a 29-second provider deadline. Saved `.env` settings were not changed.

Extraction failed with a gateway HTTP 504 after about 29.06 seconds. Rules fallback retained the exact original claim; extraction was not retried. The neutral appointment query returned two recent dated excerpts: an official club statement on a dispute involving football leadership, and a sports article about an award candidate. Neither supplied excerpt directly establishes the club-captain appointment. An official domain and recent date alone do not establish claim relevance.

Comparison reused the query without a second search, but did not make a model request: the adapter was in its existing failure cooldown. The current API reports this as `General comparison is disabled`, which is misleading here because comparison was configured on but temporarily unavailable. That diagnostic and the loss of already-retrieved citations on this unavailable path remain to be improved. This run did not exercise model comparison, schema preservation for that stage, or a factual verdict.

The report status is `comparison_not_exercised`, with outcome `inconclusive` and no correction. Actual application attempts were one Gemini inference and one Tavily basic search (expected one credit, not an account billing audit); the second model allowance was unused. No automatic retry or provider switch occurred. The temporary gateway was stopped. The latest ignored report is `.local/general-flow-check/report.json`. Remaining gaps include model latency, directly relevant source coverage, accurate unavailability diagnostics and a successful full model-backed flow. This test does not establish that the new query improves live evidence quality.
