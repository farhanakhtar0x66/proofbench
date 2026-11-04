# Ten-statement topic validation

Run from the project root:

```bash
npm run evaluate:topics
```

This adds ten development cases across leadership, pricing, software lifecycle, sports and law. The command exercises the same Fastify `/api/analysis` route used by the website, using the existing offline evaluation harness. It does not load `.env`, start Bifrost, open a server port or make Tavily/Gemini requests. It writes an ignored report to `.local/topic-validation/offline.json`; temporary API storage is removed. The report includes a dataset hash to identify the inputs used.

## Reference labels

Reference pages were read on November 4, 2026. These labels describe the assertion with adequate, applicable evidence; a live search can still fail to obtain that evidence. Recheck changing facts and linked rules before a live batch. Currency ambiguity is a policy abstention rather than a demonstrated false price.

| ID | Statement in brief | Reference label |
| --- | --- | --- |
| leadership-current | Elon Musk is CEO of Tesla | supported |
| leadership-wrong-holder | Tim Cook is CEO of Tesla | contradicted |
| pricing-explicit-currency | GitHub Team base price: USD 4 per user/month | supported |
| pricing-ambiguous-currency | GitHub Team: $4 per user/month, currency unspecified | inconclusive |
| software-completed-lifecycle | Python 2 end of life: January 1, 2020 | supported |
| software-upstream-support | Python 2 currently receives upstream security updates | contradicted |
| sports-player-limit | IFAB association football on-field maximum: eleven per side | supported |
| sports-wrong-player-limit | That maximum is twelve | contradicted |
| law-application-date | EU GDPR application began May 25, 2018 | supported |
| law-wrong-application-date | EU GDPR application began May 25, 2020 | contradicted |

Primary references: [Tesla executive profile](https://ir.tesla.com/corporate/elon-musk), [GitHub pricing](https://github.com/pricing), [Python upstream sunset notice](https://www.python.org/doc/sunset-python-2/), [IFAB Law 3](https://www.theifab.com/laws/latest/the-players/) and [EDPB legal framework](https://www.edpb.europa.eu/about-edpb/legal-framework_en). Base subscription pricing excludes add-ons and usage charges; upstream Python support excludes commercial third-party extensions; GDPR application is distinct from adoption/entry into force. The law cases test a historical date, not personalized legal advice.

## What offline success means

The tracked fixture is `fixtures/topic-validation/v1.json`. Its evidence consists of invented paraphrases under simulated hostnames, with recent simulated publication dates. These are not quotations or retrieved pages. Model relation labels are scripted too. Primary reference URLs and expected labels are evaluation metadata, never extra model evidence. The offline harness validates fixture structure with Zod, rejects duplicate IDs, blocks unexpected network destinations and restores process environment/fetch after running.

A passing case confirms extraction, scope handling, source normalization, schema/quote checks, deterministic aggregation and request-count behavior for those supplied responses. It does not measure Gemini's interpretation, real search coverage, source independence or real-world accuracy. Existing general evaluation separately covers missing evidence, conflicts, duplicates, rate limits and claim limits. Nothing restricts website input to these ten cases.

## Next live batch

Live testing is **not run or enabled by this command**. The report contains planning ceilings only: at most nine Basic Tavily searches and nine Gemini comparison attempts, with rules extraction. The ambiguous-currency case should make zero requests. No cache savings are assumed; fewer calls are possible when sources are insufficient or cached. Gateway startup catalog metadata requests are separate. A new bounded allowance is needed because the preceding live recheck has ended.

For that batch, use the existing Bifrost/Gemini model and the same combined API/current scope. Enforce attempt ceilings in the runner and process configuration, disable retries and paid/provider fallback, stop on provider failure and retain completed/unrun cases. Leave saved `.env` offline. Only the exact claim and real server-retrieved evidence may enter the model prompt; do not seed synthetic sources, expected labels, rationales or reference-page content. Preserve complete reports and actual request counts. Stop the temporary gateway afterwards.

Score the live batch in three separate ways: exact matches to the reference label, wrong decisive verdicts, and inconclusive/unfinished cases. An inconclusive result on a known fact is a coverage limitation, not an accuracy success and not automatically a transport bug. Review exclusions, dates, source context and any model validation failure before changing behavior. In particular, older or undated official pages may fail current-evidence policy even when the reference fact is well established. Do not lower corroboration requirements to force a pass.

This is a small, developer-selected set with known labels, not an independent holdout or proof of universal verification. Team review should add independently chosen examples before any broad accuracy claim.

Validation on November 4, 2026: all ten scripted topic cases passed, all 565 automated tests across 46 files passed, all 16 desktop/mobile browser checks passed, and lint, TypeScript, production build and six existing fixture regressions passed. Tavily/Gemini usage was zero. Saved `.env` was not edited; live topic testing remains pending.
