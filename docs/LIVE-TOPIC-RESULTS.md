# Ten-case live topic batch and confirmed fixes

On November 4, 2026, the user authorized the prepared ten-case batch and fixes for confirmed issues. The allowance was at most nine Tavily Basic searches and nine Gemini comparisons. The same Fastify `/api/analysis` route as the website was exercised through local injection with rules extraction, current scope and Bifrost routing to the configured Gemini model. No browser was launched for the live batch, no retries or provider fallback were used, and reference labels/synthetic sources were not supplied as evidence. Official references in [the test plan](TOPIC-VALIDATION.md) were checked again independently before running.

## Original live results, before fixes

| Case | Reference label | Live outcome |
| --- | --- | --- |
| Tesla current CEO | supported | inconclusive |
| Tesla wrong CEO | contradicted | inconclusive |
| GitHub Team base price, explicit USD | supported | inconclusive |
| GitHub Team price with ambiguous dollar symbol | inconclusive | inconclusive |
| Python 2 completed end-of-life date | supported | supported |
| Python 2 currently receives upstream security updates | contradicted | inconclusive |
| IFAB on-field limit of eleven players | supported | inconclusive |
| IFAB on-field limit of twelve players | contradicted | inconclusive |
| EU GDPR application date in 2018 | supported | supported |
| EU GDPR application date in 2020 | contradicted | contradicted |

All ten cases executed. Four matched reference labels, six known facts were inconclusive, and no wrong decisive final verdicts were observed against these labels. Of the nine non-ambiguous factual assertions, three received decisive verdicts. This is a small developer-selected development set, not an independent factual accuracy estimate. All seven model comparisons returned HTTP 200 and validated structures; the remaining cases abstained before inference. The batch exposed retrieval and semantic coverage limits rather than a gateway transport failure. Its process completed successfully; that was not a statement that all ten reference expectations passed. The runner now exits nonzero on any reference mismatch as well as incomplete execution.

Actual verification usage: **eight Tavily Basic search attempts and seven Gemini comparison attempts**. Expected Tavily usage is eight credits under Basic pricing, not a billing audit. The two Tesla claims reused a neutral-query search; the ambiguous currency claim made no search or inference. Startup catalog metadata requests are separate. The temporary gateway was stopped and `.env` matched its pre-test checksum, retaining saved offline settings and zero request caps. The original exclusive report is ignored `.local/topic-validation/live-BsGphp/result.json`, with individual saved API reports below its `data/` directory. No raw article excerpts or personal paths were added to tracked fixtures.

## Evidence review and fixes

1. **Security-update language was missed by lifecycle retrieval.** The existing support-subject matcher recognized “is supported” but not “currently receives upstream security updates.” That claim therefore used a recent literal query and found unrelated product/version excerpts. The matcher now accepts explicit unqualified receives-security-updates/fixes/patches assertions, preserving the original claim for comparison while using the existing neutral lifecycle search without a publication filter. Excerpt screening also requires the matching product/version and recognizes security-update wording. Conditions, attribution, region and vendor qualifiers remain outside the narrow rewrite. Older documents still have to pass comparison date policy.

2. **Bare dollar prices were counted as potential evidence for USD.** One model source assessment supported the USD claim despite the excerpt naming only dollar symbols. It did not yield a decisive final verdict because a second eligible supporting group was missing. Pricing excerpt screening now requires an explicit matching supported currency marker before corroboration: ISO dollar codes, named currencies or their unambiguous prefixes. This is a scope guard, not a price parser or proof of the amount. Unsupported/multi-currency forms still require further semantic work; a matching code alone cannot prove that the plan, amount, region or period agrees.

3. **The model called eleven-player text support for twelve.** A source assessment on the false sports claim used `supports` despite the excerpt describing eleven. Again, no decisive final verdict resulted because corroboration was insufficient. A narrow count guard now makes a supporting assessment ineligible when an explicit at-most/at-least/maximum/minimum claim lacks the same integer or zero-to-twenty number word with its matching count unit in the excerpt. It covers selected count nouns and skips qualified/negative assertions. It preserves the original model relation for inspection, explains the eligibility exclusion and never turns a missing/mismatched number into an automatic contradiction. It does not establish semantic entailment or cover arbitrary arithmetic, ranges or quantities.

4. **An English page-update date was not checked.** The Python developer-guide excerpt contained an explicit May 27, 2026 update while Tavily supplied a newer publication estimate. Only ISO update labels had been parsed. Complete English month-name update dates now undergo calendar validation and the existing conflict checks; unsupported explicit numeric/date labels abstain conservatively. Updates never replace a missing publication date or make an old publication current. This fix removes one eligible source from the originally supported Python historical case.

The comparison cache policy version was advanced. Two neutral offline pricing fixtures were given explicit USD context so their conflict/claim-cap tests continue to exercise those intended paths after currency screening. No corroboration or context thresholds were lowered.

## Offline replay after fixes

The saved real excerpts were replayed through the revised comparator using the original model relations as **scripted** responses, with all network access blocked. This is not new Gemini inference or a live test of the revised search query. The replay artifact is ignored `.local/topic-validation/replay/result.json`.

The USD excerpts were excluded before inference for missing currency scope; unrelated support excerpts were excluded for missing product/version; the eleven-versus-twelve supporting assessment was made ineligible; and the Python update/publication conflict was detected. The two GDPR verdicts remained supported/contradicted. The Python historical result changed from supported to inconclusive because fewer than two source groups remained eligible. All other outcomes stayed inconclusive. Consequently the replay has **three reference matches, not an improved live pass rate**. It establishes stricter evidence rejection, not better real-world coverage.

## Remaining limitation

The revised query and model behavior have not been rechecked live; no second batch used the leftover allowance. Tesla evidence still lacks enough complete, matching role excerpts; sports results remain weak or context-clipped; pricing still needs explicitly scoped corroboration. The 30-day policy can exclude valid older/undated primary documents. Those are unresolved coverage limitations. Do not present the system as reliably verifying arbitrary statements merely because the transport works or the offline cases pass. A separately bounded live recheck and independent team examples are still needed to measure coverage after further retrieval improvements.

Final offline verification after the fixes: all **598 automated tests across 49 files**, all **16 desktop/mobile browser checks**, lint, TypeScript/production build, six existing fixture regressions and API smoke checks passed. The ten scripted topic cases also passed. No additional Tavily/Gemini requests were used for those checks or the saved-evidence replay. Saved `.env` remained unchanged; the work was committed locally without pushing.
