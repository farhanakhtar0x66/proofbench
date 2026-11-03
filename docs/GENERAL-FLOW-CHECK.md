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

Subsequent [offline reliability changes](FLOW-RELIABILITY.md) add coherent configurable model deadlines and the checker's `--current-evidence` option. They have not yet been exercised in a new live run. The saved report above remains the actual real-source outcome.
