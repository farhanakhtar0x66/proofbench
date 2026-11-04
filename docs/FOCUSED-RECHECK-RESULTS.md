# Focused live retrieval recheck: targets failed

On November 4, 2026, the user authorized the [prepared four-case recheck](FOCUSED-RECHECK.md), capped at four Tavily Basic searches and four Gemini comparisons, followed by a local commit. It ran against implementation commit `09698b3` with the runner from `3ccc122`. All four combined API requests returned HTTP 201 with partial/inconclusive reports. The evaluation command exited nonzero because none of the reference targets was met. This is a coverage failure, not a successful verification demonstration.

## Results against the original live baseline

| Case | Original baseline | Recheck | Target |
| --- | --- | --- | --- |
| Tesla current CEO | inconclusive | inconclusive | supported |
| GitHub Team base USD pricing | inconclusive | inconclusive | supported |
| IFAB maximum of twelve players | inconclusive | inconclusive | contradicted |
| EU GDPR application date | supported | inconclusive | supported, unknown freshness |

There were zero recovered misses, one lost baseline match (the historical control), zero wrong decisive verdicts and four inconclusive known facts. Absence of wrong decisive verdicts does not make zero coverage a pass. The historical result retained unknown freshness/null score, but failed its expected verdict. No model comparisons were dispatched: fewer than two eligible source groups remained in every case. This run therefore does not test Gemini interpretation or schema preservation.

Expected labels were reviewed independently against the [Tesla executive profile](https://ir.tesla.com/corporate/elon-musk), [GitHub pricing](https://github.com/pricing), [IFAB Law 3](https://www.theifab.com/laws/latest/the-players/) and [EDPB legal framework](https://www.edpb.europa.eu/about-edpb/legal-framework_en). Reference-page text was not injected into retrieved evidence. Actual results used only Tavily-returned sources. This small developer-selected set is not an independent accuracy benchmark.

## What blocked comparison

Returned page text was present in all twelve retained sources. The new code path ran, but more text did not produce usable complete excerpts under the current policy.

- **Leadership:** Britannica, Digg and Forbes returned page-text lengths of 7,654, 2,109 and 1,381 characters. Each selected initial passage was clipped at 1,200 characters, and none explicitly included the company and role together in a sentence. All were ineligible.
- **Pricing:** two pages exceeded the 20,000-character scan bound (38,318 and 32,980 characters); the third had an omitted-relevant-context warning. Temporal-scope warnings also appeared. All three were ineligible.
- **Sports:** Wikipedia and Britannica page text exceeded the scan bound (38,533 and 31,656 characters). An Instagram result remained a single context candidate. One group was insufficient for comparison.
- **Historical control:** Wikipedia and a privacy-history article exceeded the scan bound (98,298 and 22,925 characters). A GDPR reference site's selected passage was paragraph-clipped. All had unresolved temporal/context eligibility issues, so the new completed-event policy did not rescue the control.

Most retained clipped excerpts contain single newlines but no blank-line paragraph separators. The selector splits on blank lines or snippet omission markers. With plain text that uses single-line structure, it often treats a large block as one paragraph and clips its beginning, including navigation, rather than finding a fitting complete passage. This is a concrete format/selector mismatch. The scan bound, incomplete-context exclusions, global temporal parsing and source coverage remain additional blockers. The saved selected excerpts do not preserve the full returned bodies, so they cannot establish that all missing facts or qualifications were absent elsewhere on the page.

No source was relabelled official, no missing publication date was invented, no safeguard was lowered and no synthetic evidence was substituted to obtain a pass. The change has not demonstrated improved live coverage and regressed the selected historical control. A follow-up should first fix single-line/structured text segmentation and context handling offline, preserving surrounding qualifications and conflict checks. Repeating this same live batch without addressing that mismatch would not establish progress. No further live run is authorized by this completed allowance.

## Usage, artifacts and validation

Actual usage was **four Tavily Basic search attempts and zero Gemini generation requests**. Expected Basic usage is four credits, not a billing audit. Bifrost startup catalog metadata calls are separate from the generation count. There were no retries, provider switches, paid fallbacks, extra page fetches or Extract requests. The temporary gateway was stopped; saved `.env` matched its pre-run checksum and remained offline with zero saved caps.

The original exclusive ignored report is `.local/topic-validation/focused-live-8uzcYF/result.json`, with individual API reports in its `data/` subdirectory. Original ten-case reports and fixtures were preserved. Dataset hash: `65dbdb3ad1ae19a7cc87ce2cddf70c000961d1d7b7bebd1e6a7c3a15c11b9f1b`. Selection hash: `bf1df4299f18bbbc02454aec470c6d0db7ce312f28f681dde41fb9b22c6cf56c`.

This step changes documentation only. The runner validated all four API reports against the shared schema and enforced request ceilings; result counts and baseline transitions were reviewed locally. Production code was not changed or retested in this documentation step; the preceding implementation/preparation checks passed 620 automated tests, lint and the build. No new passing test count is presented as evidence that this failed live recheck succeeded. Findings were committed locally without pushing.
