# Offline cross-topic pipeline evaluation

Run:

```bash
npm run evaluate:general
```

This runs 14 repeatable development scenarios through the actual Fastify `/api/analysis` route and existing extraction, retrieval normalization, source/date/scope checks, comparison validation, shared budgets and persistence code. It does not start a server port, read `.env`, start Bifrost, or contact Gemini/Tavily. Temporary storage is removed; the summary and per-scenario reports are written to ignored `.local/general-evaluation/report.json`.

Cases cover matching and changed pricing, a corroborated correction, changed leadership, wrong role/entity, unsupported version scope, dated completed end-of-life evidence, a historical plan, conflicting assessments, empty search, duplicate source URLs, model rate limiting, a general geography claim, the three-claim processing limit and question-only input. Fictional entities and simulated source dates/URLs are used throughout. Sources are titled `SIMULATED source`.

The source responses and model relation labels are prewritten fixtures. Passing checks establish that supplied labels and evidence envelopes produce the expected aggregation, abstention, preserved correction, claim omission and request-count behavior. They do **not** establish that a real model understands those topics, that live searches return good evidence, or that the verifier has a measured factual accuracy score. A scripted supported result must not be presented as a successful live demonstration.

The runner replaces `globalThis.fetch` with an exact-destination simulation before app creation. It never delegates to the original fetch; unexpected destinations are blocked and make the evaluation fail. It uses dummy credentials and temporary process-local settings solely to exercise the live-shaped code path. Each case has a fresh app/budget. Original environment values and fetch are restored in `finally`, including failures. This helper belongs in a standalone CLI/test process and must not be invoked concurrently inside a production server.

The added automated test independently replaces the caller's original fetch with a rejecting spy and verifies that no calls reach it, checks all case expectations, and verifies caller environment/fetch restoration. The command exits nonzero if any verdict, correction, omission count or simulated search/model-call count differs. Counts printed by this command are **simulated calls**, not entries that will appear in your Google/Tavily dashboard.

This evaluation is separate from `npm run evaluate:verifier`, which exercises the older narrow rules-based practice verifier. Both remain useful for regression testing. The website still uses the combined analysis implementation; this command does not create another feature version or change `.env`.

Validation on November 4, 2026: 14/14 synthetic scenario expectations matched; all 484 tests across 37 files using one worker, lint, TypeScript, six existing fixture regressions, production build and API smoke checks passed. Zero external requests were made and saved `.env` remained unchanged. This step did not alter production verification logic or claim a real-model accuracy improvement.
