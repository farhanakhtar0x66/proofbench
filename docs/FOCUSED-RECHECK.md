# Focused retrieval recheck preparation

The full ten-case batch is not repeated. This selects three actual misses and one historical control from the original live baseline, preserving exact statements and reference labels from `fixtures/topic-validation/v1.json`. Selection and baseline outcomes are tracked separately in `fixtures/topic-validation/focused-recheck-v1.json`.

| Statement | Original live result | Target |
| --- | --- | --- |
| Elon Musk is CEO of Tesla. | inconclusive | supported |
| GitHub Team costs USD 4 per user/month. | inconclusive | supported |
| Under IFAB Law 3, an association football team may have at most twelve players on the field. | inconclusive | contradicted |
| The EU GDPR became applicable on 25 May 2018. | supported | supported with unknown historical freshness |

The GDPR case is a control, not a previously failed case. The baseline is the original `live-BsGphp` batch, not the later scripted replay. Historical support was already supported there; the new query/date path must preserve useful historical behavior without claiming current freshness. Primary reference links and their original check date are included in the plan; recheck changing facts before live execution. Previously reviewed labels are not guaranteed current forever.

Run the preparation from the project root:

```bash
npm run evaluate:focused:prepare
```

This reads tracked fixtures, validates IDs, records their hashes, calculates current search queries/windows and writes ignored `.local/topic-validation/focused-plan.json`. It does not load `.env`, start Bifrost, call a provider, fetch reference pages or change any application setting. `prepared_not_run` explicitly means the live recheck has not happened. There are no synthetic evidence statements in this plan.

The live ceiling is **four Tavily Basic searches and four Gemini comparisons**, rules extraction, current scope, no retries or provider/paid fallback. Expected maximum Basic usage is four credits, not a billing audit. Gateway startup catalog metadata requests are separate. Cached or insufficient evidence can reduce usage. Preparation is not live authorization; a new bounded allowance is required before running it.

The dormant live command is `npm run evaluate:focused:live`. It reuses the existing live topic runner with `--focused`, requiring explicit process settings including `RUN_TOPIC_VALIDATION=true`, live Tavily consent, Bifrost/free-tier confirmation, rules extraction, model comparison and request caps of exactly four. Ordinary offline settings refuse execution. The full ten-case command retains its nine-attempt ceilings. Saved `.env` should remain offline; only an authorized run should receive temporary overrides. Starting the gateway may make catalog requests, so do not start it merely to prepare this plan.

The existing runner journals actual reserved attempts before dispatch, checks destinations, stops on provider/schema failure, preserves completed/unrun cases and writes full reports under a unique ignored `focused-live-*` directory. Baseline labels/purposes/reference URLs stay outside API inputs and model prompts. A dataset hash check prevents recording mismatched fixture snapshots.

Review more than the final verdict: check whether page text replaced an incomplete snippet, whether selected passages remain complete, and which source/date/currency/count checks pass or fail. A recovered case requires the expected decisive outcome with a validated model comparison. Remaining inconclusive or unrun cases are not recoveries. The historical control must retain unknown freshness/null score. Loss of its original label is reported separately. The runner exits nonzero if any reference target is missed. No improved live pass rate or universal verification claim follows from preparation or synthetic tests.

Offline validation on November 4, 2026: preparation generated all four cases; all 620 automated tests across 52 files, lint and TypeScript/production build passed. Tests verify no fetch/environment changes during preparation, unique/known IDs, recovery accounting and rejection of a historical result incorrectly marked current. Saved `.env` matched its prior checksum. No live API requests were made during this step.
