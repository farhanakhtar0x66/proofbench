# Stable facts and changing facts

The general analysis backend previously required recent publication dates even for definitions and intrinsic technical facts. A current search also filtered out older reference documentation. This could make clear factual claims inconclusive before comparison ran.

Current-scope searches now omit the publication-date filter for potentially stable claims. Explicitly changing claims retain the recent-search policy, and lifecycle/completed-event searches keep their existing exceptions. Retrieval still uses one capped Tavily Basic search, six candidates and up to three selected sources. Search results never establish truth by themselves.

For potentially stable claims, the existing evidence-comparison request also returns `claimTimeSensitivity`: `stable`, `changing` or `uncertain`. The backend requires this field through both Bifrost output formats and validates it using Zod. It adds no inference request. The model interprets the claim and compares supplied excerpts; it must not use its own knowledge as evidence.

Only a stable interpretation can admit older or undated sources. Invalid or future dates, conflicting temporal metadata, lost qualifications, duplicates, prompt injection and inadequate corroboration still block a decisive verdict. Explicit volatile wording for prices, leadership, ownership, availability, support, versions, laws and statistics vetoes this exception. Unknown wording/classification is fallible and remains a coverage risk.

Two distinct qualifying source groups must agree, except for the existing narrowly reviewed official-role exception. The change does not add per-statement answers, a website allowlist or a single-source shortcut. Hostname diversity is not proof of independent reporting or authority.

Stable assessments can be `supported` or `contradicted`, but receive `freshness: unknown` and no freshness score. A supported definition and a recently reverified changing fact are different evidence situations. Never present an undated source as a newly published source or the freshness score as truth confidence.

## Excerpt coverage

`excerptSelection.omissionRisk` is optional backend metadata:

- `coverage`: additional matching passages were omitted, but no detected qualifying passage was lost. The warning remains visible; comparison covers the supplied complete excerpts.
- `qualification`: omitted passages contain detected conditions, attribution, negation or other qualification cues. The warning remains blocking.

Clipped paragraphs, sources exceeding the scan limit, markup/login walls and older warnings without the new metadata remain blocking. This heuristic cannot prove that all relevant context was found.

Long flattened paragraphs are divided at exact sentence boundaries before selection; adjacent qualifications still travel with a statement. Oversized single sentences remain blocking. Superlative claims retain their asserted property during excerpt matching, so unrelated qualified background about the same subject does not automatically displace a direct statement. Declarative sentence relevance also ranks above words scattered through questions. None of these signals establishes entailment or authority.

Numeric page-update dates are accepted only when day/month order is unambiguous, and invalid calendar dates remain excluded. `07/13/2019` and `13/07/2019` therefore describe the same update; `03/04/2026` stays uncertain. An update never replaces a missing publication date. Date-only update labels on the same calendar day as a timestamped publication no longer manufacture a conflict from midnight precision.

Source-search failures now return fixed short diagnostics (`retrieval_timeout`, `retrieval_unavailable`, `retrieval_rate_limited`) with `verificationStatus: failed`. They remain inconclusive, but are distinguished from insufficient evidence and model failures. Source-search budget exhaustion remains blocked. Raw upstream messages and credentials are not returned.

## Verification

`npm test` includes stable support/contradiction, changing/uncertain classifications, invalid/future dates, a misclassified volatile claim, missing structured fields, exact quote restoration and omission-risk controls. Tests use synthetic evidence and no paid or live requests. Live evaluation results must be reported separately; passing these tests does not establish arbitrary-statement reliability.

No frontend components, saved environment settings, provider selection or billing controls are changed by this policy.

Observed live development results and their limits are recorded in [the November 5 acceptance report](LIVE-ACCEPTANCE-NOV5.md).
