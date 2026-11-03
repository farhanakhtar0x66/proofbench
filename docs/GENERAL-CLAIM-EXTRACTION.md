# General factual claim extraction — first expansion step

`POST /api/claims/extract` identifies candidate factual statements beyond the existing price/CEO/version interpreter. It does not retrieve evidence or assign supported/contradicted verdicts. The existing `/api/verify` route, its fixture behavior, and its narrow comparison rules are unchanged. The website still uses `/api/verify`; connecting broader extraction and evidence comparison to that flow is a later step.

## Try the default offline endpoint

After restarting the API with `npm run dev` (starts the API and website), send:

```sh
curl -X POST http://127.0.0.1:3001/api/claims/extract \
  -H 'Content-Type: application/json' \
  -d '{"version":"1","text":"Ronaldo is not the captain of Real Madrid in 2026."}'
```

This sentence is sample input, not a verified assertion. The default `CLAIM_EXTRACTION_MODE=rules` uses heuristic sentence candidates with no model or Tavily requests. Responses contain `version`, `method`, `claims` with exact `text`, `start` and `end`, and `limitations`. Offsets use JavaScript UTF-16 string indexing: `input.text.slice(start,end) === claim.text`. Request whitespace is preserved for offset accuracy. There is no truth/freshness field. Questions, code fences, Markdown headings, explicit first-person opinions and obvious commands are skipped. Rules can still include other subjective sentences; they are labeled heuristic candidates.

## Optional Bifrost extraction

Server-side settings, when deliberately enabled later:

```env
CLAIM_EXTRACTION_MODE=llm
LANGUAGE_MODE=bifrost
```

The selected Gemini or Groq route, ignored local key, billing-disabled Free-tier confirmation and a positive hosted request cap are also required, exactly as in [provider setup](B05-MODEL-PROVIDERS.md). This change adds only `CLAIM_EXTRACTION_MODE=rules` to `.env.example`; it does not alter `.env`, enable hosted requests, or download models. Never enable live requests just to run unit tests. Legacy direct Ollama has no general-extraction implementation and falls back to rules.

The server first builds candidate whole sentences, then asks the configured model through Bifrost to select factual assertions. All subjects are allowed; there is no three-category restriction in this new extraction schema. A strict JSON schema is sent to the gateway. Zod rejects extra fields, missing fields and invalid types. Selected text must exactly match a full candidate sentence in source order; duplicate selections, paraphrases, invented text, partial clauses and changed qualifiers invalidate the batch. The service calculates source offsets itself rather than trusting model-generated positions. The model never decides factual truth and cannot choose a provider, raise a cap, call a tool, or initiate a search.

Extraction and the older structured interpreter share one adapter instance, request counter, cooldown and failure handling. Hosted requests remain capped over the running API process, not separately per action. Model extraction makes at most one attempt per API call with the adapter's configured deadline plus a one-second outer guard; custom adapters without a valid declared timeout keep a ten-second bound. See [coordinated timeout settings](FLOW-RELIABILITY.md) before the next controlled live test. No automatic inference retry or provider fallback is added. A process restart still resets the existing cap; this is not an account-wide quota. Only server configuration can enable LLM extraction; extra request fields such as a client-supplied provider are rejected.

Input accepts up to 20,000 characters, as in the existing verification API. Model extraction is limited to 4,000 input characters. Output is limited to the first 50 eligible sentences, each at most 2,000 characters. Oversized input or unavailable, disabled, rate-limited, timed-out or invalid model output produces `method: rules_fallback`, a reason and heuristic candidates. If there are no eligible candidates, no model request is made. Omitted candidates are disclosed in limitations. Model selection can still omit a factual sentence; exact spans do not prove semantic classification or coverage. An empty model selection means no assertions selected, not that the text is true.

Negation, dates, conditions, attribution, uncertainty and linked clauses stay in the original full sentence. Compound sentences are deliberately retained intact; independent atomic decomposition and coreference resolution are not claimed. Non-English sentences can retain source spans, but multilingual extraction quality has not been evaluated. No medical/legal/scientific assertion is verified by this endpoint.

## Validation and remaining steps

Offline tests exercise unrelated topics, negation and date preservation, Unicode offsets, code/question exclusion, changed qualifiers, partial clauses, extra verdict fields, duplication/order, request/input bounds, invalid responses, deadlines, missing keys, shared caps and Fastify integration. They use fake gateway responses only. The old verifier fixture is also checked for compatibility.

Validation on November 3, 2026: `npm run check` passed lint, TypeScript, 285 tests, all six fixture regressions and the production build. Twenty-one tests cover general extraction. No real Gemini, Groq or Tavily requests were made for this implementation step.

The new extraction schema was also exercised against real Gemini through Bifrost on November 3, 2026. `npm run bifrost:check:claims` runs two synthetic checks with one shared adapter: the existing price interpretation, followed by general extraction of a sports assertion with negation/date and a fictional policy assertion with region/approval/date qualifiers. Both checks passed, with exact full sentences and source offsets preserved. These sample assertions were not verified as facts. The gateway logged exactly two new successful requests, taking approximately 1.17 and 1.22 seconds. The saved result is `.local/bifrost-benchmark/claims-check-gemini.json`. This is an observed schema smoke check, not evidence of universal extraction quality or factual accuracy.

The combined command loads ignored `.env`, requires the same provider readiness checks, and allows at most two attempts through its shared adapter (never raising a lower configured cap). It makes no Tavily requests and does not retry inference or switch providers. The actual test used temporary process environment overrides for free-tier confirmation, request cap `2` and an isolated gateway on port `8081`; no saved `.env` setting changed. The gateway was stopped after the test and both saved request caps remained zero. Running the command with the saved zero cap remains blocked.

The next [general evidence-retrieval API](GENERAL-EVIDENCE-RETRIEVAL.md) is implemented and tested with mocked search responses and a separately authorized one-search Tavily check, including real cache reuse and budget blocking. [Evidence-grounded comparison](EVIDENCE-COMPARISON.md) is implemented with offline tests, but its live validation and website integration remain pending. Those steps are not enabled by extraction alone. Groq's new extraction schema has not been tested live.
