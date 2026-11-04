# Entering new statements with a small live budget

The saved `.env` defaults remain offline. Plain `npm run dev` therefore does not fetch live evidence. Loading a saved assessment replays its earlier result. To type new statements and check current sources, use this temporary live session after confirming Gemini Free tier/billing disabled and Tavily pay-as-you-go off for the selected keys.

These commands allow at most **five Basic searches and five model-generation attempts in one API process**. This is a small session within the user's larger 100-search/25-model testing allowance, not an additional allocation. Basic searches normally cost one Tavily credit each; gateway catalog metadata requests are separate. Do not restart sessions to bypass the total allowance. Failed attempts count, and limits reset when the API process restarts. These are local process limits, not an account-wide billing lock.

Run both terminals from the project root containing `package.json`. Stop an existing `npm run dev` with Ctrl+C first so it does not occupy the API/web ports.

## Terminal 1: model gateway

```bash
env LANGUAGE_MODE=bifrost \
  BIFROST_FREE_TIER_CONFIRMED=true \
  BIFROST_LLM_MAX_REQUESTS=5 \
  BIFROST_LLM_TIMEOUT_MS=30000 \
  npm run bifrost:start
```

This starts Bifrost with the configured Gemini model and ignored server-side key. Wait until it says it is serving on localhost. It can make startup catalog metadata requests. There is no provider fallback or inference retry. The existing prepared gateway config must match the selected provider/model/timeout; a config mismatch is a setup failure, not a reason to run more model checks.

## Terminal 2: live API and website

```bash
env LANGUAGE_MODE=bifrost \
  CLAIM_EXTRACTION_MODE=rules \
  EVIDENCE_COMPARISON_MODE=llm \
  BIFROST_FREE_TIER_CONFIRMED=true \
  BIFROST_LLM_MAX_REQUESTS=5 \
  BIFROST_LLM_TIMEOUT_MS=30000 \
  TAVILY_MODE=live \
  ALLOW_PAID_REQUESTS=true \
  TAVILY_MAX_REQUESTS=5 \
  npm run dev
```

`npm run dev` starts Fastify and Vite. The environment overrides apply only to this process tree; `.env` is not rewritten. The existing `ALLOW_PAID_REQUESTS` variable is named awkwardly: here it is the app's request-consent gate, not an instruction to enable provider billing. Provider billing remains disabled at the accounts. `BIFROST_FREE_TIER_CONFIRMED` records the operator's confirmation; it does not inspect or change billing remotely.

Open the Vite address, select **Freshness verifier → General claim analysis**, and check that the banner says **LIVE SOURCES SELECTED** with model comparison configured. Enter a factual statement and click **Verify answer**. This is a new analysis; do not use **Load a saved assessment** when you want a fresh check.

For one claim, rules extraction adds no model request. Retrieval can use one Basic search and comparison can use one Gemini request if enough sources qualify. Multiple claims can consume more of the same shared five/five session ceilings. Cached evidence/comparisons may reduce requests; insufficient evidence can return inconclusive before inference. Live mode does not guarantee a decisive/correct verdict for every input.

Stop both terminals with Ctrl+C when finished. Ordinary `npm run dev` returns to the saved offline configuration. Keys stay in ignored `.env`, never in these commands, frontend variables or Git.

## Exact user-claim check after key replacement

On November 4, 2026, the user replaced both keys, offered a maximum testing allowance of 100 Tavily requests and 25 Gemini requests, and confirmed Gemini Free tier/billing disabled plus Tavily pay-as-you-go off. A temporary one-search/one-comparison check submitted the exact statement **“Rahul Gandhi is the PM of India.”** through `/api/analysis`, with rules extraction and no text rewrite.

The result was **contradicted**, with a validated model-assisted evidence assessment from eligible recent sources. It used **one Basic search and one Gemini comparison**, plus separate startup catalog metadata requests. The government [Who's Who directory](https://www.india.gov.in/directory/whos-who) was reviewed independently for the expected current office holder; its content/label was not injected into model evidence. This single successful claim does not establish general accuracy or test all abbreviations.

The full ignored record is `.local/user-claim-check/live-rmO8du/result.json`; successful search data is alongside it. The API report is also stored in normal local data storage and can be loaded by its ID from the result artifact. The gateway was stopped and `.env` matched its pre-test checksum, retaining the new keys and saved offline settings. No product code changed in this check; no source text or secret key was committed. These usage counts refer only to this replacement-key check, not earlier work or a provider billing audit.
