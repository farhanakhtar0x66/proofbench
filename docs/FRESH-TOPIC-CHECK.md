# Fresh multi-topic backend check

On November 4, 2026, three separate `/api/analysis` submissions used live Tavily retrieval and Gemini comparison through Bifrost. All returned HTTP 201. Saved source responses enabled offline diagnosis without repeating searches.

| Input | Fresh result | Observation |
| --- | --- | --- |
| Parent company of Google is Alphabet. | Inconclusive | Only one retained source explicitly supported the relationship; useful passages in another search result were lost during selection. |
| Python 2 is currently supported. | Inconclusive, before inference | Sources failed scope/date checks. Returned material mixed upstream lifecycle information with vendor extensions; dates were missing, old or conflicting. No decisive result is claimed. |
| Satya Nadella is the CEO of Microsoft. | Supported | A validated model comparison found two eligible supporting source groups. Different domains do not establish independence or authority. |

## General selection improvement

Corporate relationship claims now rank passages that mention the relationship's target, rather than passages about shareholders owning the alleged parent's stock. The heuristic covers ownership, parent companies and subsidiaries with arbitrary entity names. It does not infer the correct holder, relationship direction or factual truth. Alternative owners and independence/divestment wording remain candidates for model assessment.

Repeated identical source blocks with short, unqualified heading context no longer consume the excerpt budget repeatedly. Blocks with negation, conditions, dates or nearby qualifications remain distinct. Short wrapped statements still retain neighboring context. Complete original source substrings and offsets remain the evidence; there is no claim rewriting or fabricated quote.

After the improvement, the saved Google search response was reprocessed. Original publication/retrieval times were preserved. One additional real Gemini comparison returned `supported`, with two eligible supporting groups and an insufficient third source. This was a saved-response replay, not another fresh search or proof of universal correctness. The changed selection still needs a later fresh retrieval check.

## Limits and validation

The complete batch and replay used **three real Tavily searches and three real Gemini comparisons**, with zero inference retries or provider fallbacks. Gateway startup additionally performed metadata setup. Provider billing settings and saved `.env` were unchanged. The isolated test gateway was stopped afterward. No UI files changed.

All 699 unit/integration checks passed, including different synthetic entity names, alternate holders, unrelated ownership targets, repeated profiles and adjacent contradictory qualifications. Lint, build, and the offline general/topic evaluations passed. Scripted model outputs in offline tests do not establish live factual accuracy.

The backend has observed decisive results through live retrieval and through saved-source model comparisons. It still cannot guarantee a decisive or correct result for arbitrary statements. Current limitations include source coverage, temporal applicability, vendor/upstream scope, inferred relationships, and unestablished source independence. The crisp `reasonCode`, `shortReason` and `verificationStatus` API fields distinguish blocked comparisons from model failures and completed inconclusive assessments.
