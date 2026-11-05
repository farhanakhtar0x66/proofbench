# Tavily milestone — owner: Mohit

Reviewed November 5, 2026. Mohit owns Tavily retrieval, evidence comparison and the submission evidence for this milestone. Khushi owns independent evaluation; Farhan owns the separate selected Bifrost implementation and integration.

## Recorded live evidence

The saved records establish successful live retrieval and a passing selected combined API flow. They do not establish reliable arbitrary-claim verification. The [credential-free evidence summary](examples/tavily-live-validation.v1.json) records dates, request counts, results, citation URLs and SHA-256 hashes of the original ignored artifacts. This review parsed those saved reports against the current runtime contracts without making provider requests.

| Recorded check | Result | Usage in that check |
| --- | --- | --- |
| November 3: Tavily retrieval, cache reuse and exhausted-budget blocking | Passed; three source excerpts, no factual verdict | One search, zero model requests |
| November 4: fresh combined `/api/analysis` historical pair through Tavily and Bifrost/Gemini | 2018 applicability claim supported; 2020 counterclaim contradicted; freshness unknown and scores null | One shared search, two model comparisons |

The original retrieval record is `.local/tavily-live-check/report.json`; the fresh combined record is `.local/showcase-continuation/fresh.json`. These files are ignored and local. The summary is shareable, but full excerpt review requires the original artifacts. Hashes identify those artifacts; they do not authenticate a provider response. Usage above covers only these selected runs and is not an account billing audit or total project usage.

See [retrieval validation](GENERAL-EVIDENCE-RETRIEVAL.md#validation-and-next-step) and [fresh combined-flow confirmation](SHOWCASE-VALIDATION.md#separately-approved-fresh-combined-flow-confirmation) for the original methods and limitations. Earlier failed checks remain failures. The fresh historical pair used the website's backend route; it did not test fresh browser submission.

## Verdict correctness

The legacy `/api/verify` comparator currently parses narrow pricing, CEO and version facts and requires matching entity/scope, qualifying dates and corroboration. Keyword occurrences alone are context. Generic support/lifecycle claims are outside those templates and remain inconclusive; an inconclusive result has unknown freshness and no numeric score.

General `/api/analysis` uses Bifrost-assisted interpretation of supplied excerpts, followed by backend source, scope, context, date and corroboration checks. Its prompt explicitly rejects verdicts based only on words such as `deprecated`, `supported` and `current`. Deprecation alone does not establish end of support. Version, upstream versus third-party support, dates and conditions must apply. An insufficient assessment remains inconclusive, without a correction or freshness score. Rules-only fallback also abstains.

The targeted regression tests exercise keyword-only evidence, another version, unrelated deprecation, missing values, negation and conditions through the actual legacy verifier. Separate comparison tests check insufficient-assessment aggregation and that the gateway receives the strengthened prompt. Search/model responses in those tests are simulated; they do not measure real-model semantic accuracy. Schema-valid model assessments can still misinterpret evidence.

## Remaining acceptance work

- Mohit: include this live evidence summary in the submission/handoff and retain the original reports for review. Do not describe the November 3 retrieval-only check as a factual verification.
- Mohit and Khushi: evaluate ambiguous support/deprecation claims and broader topics with independent reference labels; report abstentions and wrong decisive verdicts separately. A new live check of the updated prompt is not recorded here.
- Mohit and Aryan: record a bounded fresh browser submission if browser-to-provider validation is claimed. Saved-report loading and fresh backend submissions establish different behavior.
- Farhan: integrate the selected hackathon Bifrost implementation. Successful Bifrost gateway routing does not complete that separate challenge requirement.

The saved configuration remains offline. This review and regression work made zero Tavily or model requests and did not change `.env`.

Offline validation on November 5 passed all 838 unit/API tests, the 65 targeted verifier/comparison tests after both prompt paths were updated, all 20 desktop/mobile browser checks, lint, TypeScript/build, six fixture regressions and API smoke checks. These checks validate implementation behavior, not live-model factual accuracy.
