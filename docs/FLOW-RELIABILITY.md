# Bounded deadlines and current-evidence search

These changes address the timeout and source-coverage gaps observed in the first real-source check. They have offline validation and partial live results recorded below, not proof that arbitrary claims can receive decisive verdicts. The implementation step made no API calls or saved `.env` edits; later live checks used separately approved request allowances. No automatic inference retry is included.

## Model deadlines

New Bifrost settings default to `BIFROST_LLM_TIMEOUT_MS=20000`, configurable from 100 to 30,000 milliseconds. Existing explicit settings still win: an ignored `.env` containing `8000` continues to use eight seconds until the operator deliberately selects another value. `.env.example` changes to 20 seconds; real keys/settings are not overwritten.

The adapter exposes its request timeout to the older interpreter, general extraction and evidence comparison. Their outer guard waits one additional second, bounded by the validated adapter setting; custom adapters without a valid declared timeout keep the existing ten-second guard. Increasing only the HTTP timeout would not have helped if an outer ten-second timer still cancelled the operation; the new shared deadline prevents that mismatch. Direct legacy Ollama keeps its existing settings and is not required.

Generated gateway configuration uses an upstream timeout one whole second shorter than the client where possible, with a one-second minimum. For the normal 20-second setting, provider/client/outer limits are 19/20/21 seconds. Very short sub-second client settings still have a one-second minimum provider timeout; the client remains the earlier bound. Provider retries stay zero, inference counts/cooldown are unchanged, and model output limits are unchanged. Longer waits do not create extra model requests, but may retain an in-flight request longer. Provider availability and machine memory pressure can still cause failures.

Gateway configuration, gateway startup and the API/check command must use the same chosen timeout. `npm run bifrost:prepare -- --refresh-timeout` explicitly permits refreshing only the timeout in an existing generated config. It refuses changes to keys, model allowlists, providers, retries, networking or any other setting. Without the flag, differing configuration is preserved and reported. A running gateway must be stopped and restarted with the reviewed configuration before a controlled test. Preparation still uses the existing readiness settings; it starts no service and makes no model request.

The old website client has its own shorter request deadline. The broader flow is not connected to that UI yet; its loading/cancellation behavior must be addressed during website integration. Do not enable the whole pipeline in the current UI simply because a longer backend deadline is available.

## Explicit current-evidence scope

The retrieval and comparison endpoints now accept an optional scope:

```json
{
  "version": "1",
  "claim": "Cristiano Ronaldo is not captain of Real Madrid.",
  "scope": "current"
}
```

This is unverified sample input. Omitting `scope` or choosing `as_stated` preserves the existing literal query and historical-context behavior. The option controls which evidence to seek; it does not change the assertion's meaning or erase historical qualifiers. Unknown scope values are rejected before a request. Offline settings still return offline results even with current scope selected.

For clear `X is [not] the captain/CEO/president/... of Y` statements in current scope, the search asks neutrally for Y's current role holder, such as `Real Madrid current captain official sources`. It does not presume the claimed person is correct. The original assertion, including negation, remains unchanged in the response and comparison input. Object-side qualifiers such as `India in 2026` remain in the search. For other wording, it retains the literal claim and adds the hint `current official sources`; no role or entity is guessed. These hints do **not** verify that returned sites are official. The search selects the last 30 calendar days through the next UTC day as a practical window, requests date metadata and enables `filter_by_published_date`. The backend still applies its exact 30-day age and no-future-date checks afterward. Search remains basic, capped at three results, with generated answers/raw page fetching disabled and `auto_parameters: false`. The existing request cap, no-retry policy and shared server allowance remain authoritative.

Tavily documents date filtering and warns that its date is a publication/update estimate, not independently verified original publication. See the [official search reference](https://docs.tavily.com/documentation/api-reference/endpoint/search). Returned limitations now state this explicitly. A recent source-date estimate does not prove that the fact was recently checked. Current filtering can lose useful undated or older pages and can return no results. It does not establish source independence, ownership, support or contradiction.

The retrieval report records `searchScope` and optional `searchWindow` along with the actual query. Cache keys include the current window so a literal/historical query is not accidentally served a filtered result (or vice versa). Repeated identical requests still use the same five-minute cache and budget. No second search, news fallback, domain allowlist or query-generation model call is introduced.

The live flow checker supports `--current-evidence` to pass the same scope to retrieval and comparison, preserving cache sharing. Its existing explicit one-search/two-model allowance remains unchanged. This flag does not authorize paid or live usage by itself. The chosen timeout must be supplied consistently for the prepared gateway, gateway process and checker. Keep saved request caps at zero outside an agreed test.

## Validation and remaining work

On November 3, 2026, `npm run check` passed lint, TypeScript, all 364 tests, six fixture regressions and build. Eleven new tests check coordinated deadlines, 15-second simulated responses for interpretation/extraction/comparison, a stalled custom adapter, timeout-only configuration refresh, historical query preservation, neutral role queries, unknown wording, current date parameters, cache/budget isolation and invalid scope. The offline API smoke check also passed. All responses are simulated; no Gemini, Groq or Tavily credits were used for these changes.

The two-source agreement and semantic/date/correction checks have not been weakened to obtain a passing demonstration. A result may still correctly remain inconclusive. A complete real-source model chain and website integration remain pending.

In the later authorized [current-evidence check](GENERAL-FLOW-CHECK.md), extraction succeeded and two dated source groups were returned, but comparison exceeded the 19-second provider limit and failed with HTTP 504. Thus the source-coverage/preflight gap improved for this query while comparison latency remains unresolved. No complete-flow success is claimed. Saved settings remain unchanged; the next one-model test would require a separate allowance and can reuse the saved source data without another Tavily search.

The subsequently authorized saved-source request completed in about 20.34 seconds with the existing maximum 30-second client setting. This establishes completion for that attempt, not a general latency guarantee or a changed default/saved timeout. Its quotes exposed an ongoing-role versus match-role mismatch, which is now guarded separately. The replay abstains correctly; no complete semantic-success claim is made. See the preserved run and review details in the flow record.
