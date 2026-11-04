# General-flow freshness scoring

General `/api/analysis` and `/api/claims/compare` responses return an integer `freshnessScore` from 0 to 100 **only for supported, current, model-assisted assessments** that pass existing evidence gates. This is a publication-recency policy, not a calibrated truth probability, prediction of change, authority ranking or independent source verification. It makes no additional search/model requests and does not change verdicts or corrections.

## Policy

After schema, quote, date, scope, duplication, conflict and corroboration checks, take **all eligible citations assessed as supporting** the claim. At least two distinct source groups are required under existing conservative hostname grouping. Each publication date must be valid, not future, and no older than 30 days. Retrieval/update timestamps do not replace publication dates.

```text
oldestAge = assessmentTime - oldest eligible supporting publicationTime
freshnessScore = floor(100 × (1 - oldestAge / 30 days))
```

The score is bounded to 0–100. The oldest agreeing eligible publication controls the score; adding a new agreeing page cannot refresh older corroboration. Ineligible and insufficient citations do not affect it. At publication time the score is 100; at 15 days it is 50; at exactly 30 days it is 0. A supported result with score 0 means its corroboration is at the policy's age limit, **not** that the statement is false or demonstrated stale. After 30 days the existing date gate excludes the source.

Missing/invalid dates, insufficient corroboration, conflict, offline/rules fallback and model failures return `null`. Historical support remains unscored, even if its historical verdict is supported. Contradictions remain unscored because evidence against today's assertion does not establish that it was once true or when it changed. No fixed zero is assigned to contradictions and no probability is assigned to inconclusive results.

The LLM cannot submit a score or score explanation; it still returns only source relations and an optional source-quoted correction. The backend computes `freshnessScore` and `freshnessScoreReason`. Zod permits numeric scores only for current supported model-assisted reports with an explanation. Existing saved reports with null scores and no explanation remain readable. Legacy `/api/verify` and practice/demo score policies remain separate and unchanged.

The shared v1 response contract widens the previously null-only score and adds an optional explanation. Deploy the API and website from the same revision. Teammates with a separately built strict null-only client must update their contract before consuming numeric-score responses; this is not an LLM output-schema change.

## Website and saved results

The website shows `Freshness score: 50/100 (evidence recency)` or `Freshness score: unavailable`, followed by the backend explanation. `assessedAt` fixes the reference time. Reading an old saved report does not silently refresh the score, recheck the claim or call any provider; review its assessment date before treating it as current.

Publication dates are provider estimates, source relevance still includes model judgment, and different hostnames need not be independent. A high score cannot fix weak semantic assessment, establish official ownership or overcome missing evidence. The real-source demo's coverage blocker remains unresolved by scoring. The linear window is an explicit prototype policy, not an empirically calibrated freshness model; category-specific decay requires separate evaluation.

## Validation

On November 4, 2026, all 531 unit/API tests (including 14 new freshness tests), six affected desktop/mobile browser checks, lint, TypeScript, production build, six offline fixture regressions and API smoke passed. Tests cover publication-age boundaries, older corroboration despite a fresh added source, excluded/unrelated citations, missing/future/expired dates, conflict/contradiction, historical abstention, saved assessment-time behavior and invalid/misleading contract scores. Browser numeric-score examples are explicitly simulated. No Gemini or Tavily requests were made, saved `.env` was unchanged, and no live accuracy or calibration claim follows from these checks.
