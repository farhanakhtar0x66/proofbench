# Tavily backend handoff

For the current combined website/API flow and deployment checks, start with [TEAM-RUNNING-GUIDE.md](TEAM-RUNNING-GUIDE.md). The legacy `/api/verify` notes below describe the original narrower implementation. General `/api/analysis` is now connected to the website, with unavailable numeric freshness scores and separately recorded live-source limitations. The browser tests now use isolated ports; closing normal developer servers is unnecessary.

Entry point: packages/tavily/src/index.ts. The existing POST /api/verify route accepts a whole answer plus optional explicit claims. GET /api/verify/:id reads the saved report. Shared runtime schemas remain in packages/contracts. The frontend already consumes this API; numeric-score display and its offline-only labels remain frontend follow-up work.

Example request (mock mode is the default):

```json
{"version":"1","text":"Acme latest version is 2.","claims":[{"text":"Acme latest version is 2."}]}
```

The response includes version, report id, mode, createdAt, original text and claims. Each claim includes outcome (supported/contradicted/inconclusive), freshness (current/stale/unknown), freshnessScore (100/0/null), uncertainty and evidence. Evidence includes source URL, excerpt, publication date when present, and real retrieval time. Old reports without a score remain readable.

Default local settings: TAVILY_MODE=mock, ALLOW_PAID_REQUESTS=false, TAVILY_MAX_REQUESTS=0. Keys belong only in ignored .env or server secrets. Enabling live mode requires all three safeguards plus a key. Changing settings requires restarting the server. No further live tests are necessary for this handoff.

The request cap covers the running app instance, including failed attempts. Concurrent identical queries share a request. Cached results last five minutes and retain the original retrieval time. Restarting creates a new budget; multiple instances each have a cap. These controls cannot enforce an account-wide monetary limit.

Live comparisons recognize only the formats documented in packages/tavily/README.md. Two distinct hostnames must supply matching, date-qualified statements within 30 days. Missing dates, unrecognized wording, conflicting evidence and explicit historical scopes abstain. Different hostnames are not proof of independence or authority. Statements contradicted today are labeled stale, but previous truth is not established. This is a prototype, not an arbitrary-answer semantic verifier; no accuracy claim is justified from fixture regression results.

Checks: npm run check covers lint, types, tests, fixture regression and build. npm run test:contracts checks shared examples. npm run test:ui checks browser integration using forced mock settings and fresh local servers; close existing dev servers first. Browser binaries must already be installed or separately installed by the developer.

Validated on November 2, 2026: npm run check passed with 52 tests and six offline fixture regressions, plus a successful build. All four desktop/mobile browser tests passed. The local browser installation uses ignored .local/playwright; rerun those checks with PLAYWRIGHT_BROWSERS_PATH=.local/playwright npm run test:ui when using that installation. No live Tavily requests were made during final validation.

Review before merge: Farhan/Aryan should review the additive freshnessScore contract and Farhan the execution/spending controls. Khushi should evaluate held-out claims independently. Remaining improvements include source-authority rules, broader semantic extraction/comparison and calibrated intermediate scores. Keep work on the feature branch until team review; no push or merge is performed by this handoff.
