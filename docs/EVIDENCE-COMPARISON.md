# General evidence comparison and quoted corrections

`POST /api/claims/compare` is the next backend building block after extraction and retrieval. It accepts only `{version: "1", claim: "..."}`. Evidence is retrieved server-side through the existing capped Tavily path. The client cannot submit its own citations, dates, provider or request limit. The old `/api/verify` route and the website's current behavior remain unchanged. Connecting the new flow to the website is still a separate step.

## Default behavior and configuration

`EVIDENCE_COMPARISON_MODE=rules` is the default, added only to `.env.example`. The real `.env` has not been changed. In this mode the new route returns `inconclusive` without Tavily or model requests; existing deterministic verification remains available through its original route. For example, after restarting `npm run dev`:

```sh
curl -X POST http://127.0.0.1:3001/api/claims/compare \
  -H 'Content-Type: application/json' \
  -d '{"version":"1","claim":"Acme Pro costs USD 20/month."}'
```

This is synthetic input, not a real pricing assertion. To deliberately test model-assisted comparison later, the server needs `EVIDENCE_COMPARISON_MODE=llm`, `LANGUAGE_MODE=bifrost`, the selected provider/key/free-tier confirmation and a positive hosted cap, plus explicitly authorized live Tavily settings. See [provider safeguards](B05-MODEL-PROVIDERS.md) and [retrieval safeguards](GENERAL-EVIDENCE-RETRIEVAL.md). No new key or local model is needed. Missing model readiness, disabled comparison or exhausted hosted allowance avoids a new retrieval request. This is a best-effort preflight: a concurrent operation can consume a model slot while retrieval is running, causing safe fallback after a search. Existing shared counters still prevent exceeding approved caps.

## How a result is produced

1. Retrieve at most three excerpts. General retrieval now explicitly requests publication metadata via `include_published_date: true`; the older narrow verifier's request format is unchanged. Metadata remains optional and is not guaranteed to parse. No automatic extra search is made to fill gaps.
2. Check source URLs, nonempty bounded excerpts, retrieval metadata, publication dates and duplicate/corroboration groups before inference. Reuse the existing conservative date checks. At least two groups with qualifying recent dates must exist before making a model request.
3. Send the claim, assessment time, source IDs/URLs, excerpts and their date metadata through Bifrost. The model is instructed to assess only supplied evidence, without memory, tools or search. It labels every source `supports`, `contradicts`, `conflicting` or `insufficient`, and must quote each complete excerpt exactly. Relations are semantic model judgments, not mechanically proven entailment.
4. Validate strict JSON with Zod. Every supplied source must be assessed once, in order, using its assigned ID and entire unaltered excerpt. Missing, duplicated, invented or reordered citations, changed/partial quotations, generated URLs, extra verdict fields and free-form model explanations are rejected. URLs and citation metadata in the response are copied by the backend from retrieval, never from generated links.
5. Derive the verdict in code: at least two eligible groups must agree on support or contradiction. Assessed internal conflict, or any assessed mix of support and contradiction, makes the result inconclusive. Otherwise insufficient qualifying agreement also abstains. The explanation is a backend template describing the evidence assessment and its limits, not a free-form factual answer from the model.
6. Return a correction only for a contradicted result and only when an identical complete source sentence occurs in at least two eligible, distinct groups whose assessments contradict the claim. The sentence is copied verbatim, with source IDs; there is no unrestricted rewrite. Invented, partially quoted, single-source or uncorroborated proposed corrections invalidate the model result and fall back to inconclusive.

The correction is a **source-corroborated quotation**, not a guaranteed universal “right answer.” It may preserve attribution or conditional wording. Whether passages actually entail a verdict still depends on model interpretation and source quality; structural checks cannot prove semantics. An exact quote can be wrong or misleading in its source. No source authority, independence, or universal accuracy guarantee is made.

## Conservative date and grouping limits

Qualifying publication dates must be valid supported ISO dates within the last 30 days, not in the future. Future retrieval or update/effective metadata conflicts invalidate eligibility. Missing, old or unsupported-format dates trigger abstention; recent retrieval does not replace publication time. General retrieval's earlier live test returned three undated excerpts, so those particular results cannot produce a decisive verdict under this policy. The date-metadata request added here has not been tested live yet.

This policy is deliberately conservative and can reject useful historical, legal or timeless references. Domain grouping collapses the last two hostname labels to avoid counting ordinary subdomains twice; it is not a complete public-suffix/ownership service and can merge unrelated sites (for example, some public hosting domains). Duplicate canonical URLs and long exact copied excerpts do not count twice. Distinct groups still do not prove independence or credibility. These limitations are returned with every result. Extending temporal policies/source authority requires separate evidence and evaluation.

`freshnessScore` remains null. `freshness` is current only for a supported assessment meeting this date policy; otherwise unknown. A contradiction does not prove the original claim was once true and later became stale, so this new endpoint does not label every false statement stale. Assessment time and citation publication/retrieval times are returned separately.

## Failure handling and cost controls

Comparison shares the same Bifrost adapter counter and cooldown as extraction and the older interpreter. No extra provider quota pool, automatic retry or provider switch is introduced. One comparison attempt is made after evidence qualifies. The existing eight-second configured gateway timeout and a ten-second outer bound apply. Comparison permits up to 2,048 output tokens to quote three bounded excerpts; older schema requests retain 1,024. Input is bounded to 10,000 serialized characters. General search remains under the shared Tavily server budget and five-minute cache.

Disabled/unavailable models, empty retrieval, malformed output, rate limits, timeouts or unsupported corrections return `rules_fallback`/`inconclusive`. Safe sources retained after validation are returned as insufficient citations with their date warnings; no generated correction survives a failed result. An obvious instruction-like-text filter can avoid inference on some hostile snippets, but it is not a complete prompt-injection defense. The prompt treats all claims and excerpts as untrusted data. Only source-data assessment is added; there are no tools, execution privileges or model-triggered web requests.

## Validation and pending work

Offline tests cover valid support/contradiction, quoted corrections, conflicts, missing/stale/future dates, duplicate domains/URLs/copied content, altered citations, omitted context, invented corrections, missing keys, shared inference allowance, deadlines, invalid model output, default zero-network behavior and the Fastify retrieval/comparison path. All upstream responses are simulated. Existing extraction and deterministic verification tests remain in place.

Validation on November 3, 2026: `npm run check` passed lint, TypeScript, all 344 tests (including 37 comparison cases), six fixture regressions and production build. The offline API smoke check also covers the new route's disabled behavior. No real Gemini, Groq or Tavily requests were made in this implementation step. `.env` was not changed.

The comparison schema and new date-metadata request have not been exercised live. Earlier successful schema tests cover interpretation/extraction, not this new operation. Next steps are a separately capped live comparison check (using controlled evidence first), then source-quality/temporal evaluation and website integration. This consumer feature does not establish completion of the separately researched Bifrost challenge.
