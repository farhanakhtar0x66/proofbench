# General retrieval source quality

The November 4 live demo returned Facebook login/feed text and encoded SVG in two of three result slots. It also exposed overly narrow source coverage and incomplete paragraphs. This update improves local screening and candidate selection without loosening corroboration, date, quotation, scope or context checks. It does not establish a recovered three-verdict live demo.

## One search, a larger candidate pool

General retrieval now requests six candidates in one Basic Tavily search, with `auto_parameters=false`, raw-content/answer generation off, and `exclude_domains=["facebook.com"]`. This small platform exclusion addresses the observed failure; it is not a list of official organizations or a claim that social posts are false. It can omit useful public posts. There is no automatically inferred official domain, paid upgrade, extra search, page fetch or Tavily Extract request. The legacy narrow verifier keeps its previous search parameters.

[Tavily's Search reference](https://docs.tavily.com/documentation/api-reference/endpoint/search) documents result-count and domain-exclusion controls. Its [credit documentation](https://docs.tavily.com/documentation/api-credits) lists Basic search as one credit per request. Six candidates remain one Basic request under those documented terms; actual account usage still requires dashboard review. This implementation/validation made zero real Tavily or Gemini requests.

At most twelve returned candidates are locally inspected if the provider returns an unexpected extra tail. Unsafe/empty URLs and canonical URL duplicates are filtered as before. The API still returns at most three sources. Current scope prioritizes passages passing quality and role-anchor checks, existing appointment hints where applicable, and valid recent publication dates. It then selects distinct conservative hostname groups before filling spare slots with repeated groups. This grouping is not verified ownership or independence. Literal `as_stated` scope retains provider ordering. Selection does not depend on the asserted role holder being named or on a model's support/contradiction label.

The response's retrieval limitations disclose candidate/retained counts, ordering policy and that omitted candidates may contain conflicting evidence. The website exposes these notes under **Retrieval limitations**. The top three excerpts are a bounded sample, not a complete web consensus. No source is promoted to official or reviewed status by these heuristics.

## Local content checks

`excerptQualityReason` now flags text dominated by encoded image/HTML artifacts, short login/subscription forms with multiple UI cues, and caption-only excerpts. It does not reject ordinary readable text merely for mentioning login or containing simple formatting. These are conservative heuristics that can still miss junk or reject usable text. Source titles and URL slugs cannot substitute for readable excerpt evidence.

Quality reasons appear in selection warnings and are checked again independently in comparison, even if selection metadata is absent. Poor excerpts remain visible when retained, but cannot count toward corroboration or trigger comparison when fewer than two groups qualify. Source text is never decoded, cleaned or rewritten into evidence; the retained passage remains an exact contiguous substring with original offsets.

For long text, the selector now chooses the best fitting whole paragraph even when an earlier equally relevant paragraph is oversized. If relevant passages are left out, the existing context warning still excludes that source. The 1,200-character excerpt limit, 20,000-character scan limit and historical/role/date safeguards remain. This does not recover text that Tavily never returned or make incomplete Tesla passages eligible.

The search cache key includes a new quality-profile identifier, separating six-candidate filtered searches from older narrow searches while sharing the existing request budget. Raw-text cache reuse still avoids another search. Comparison caching also sees the changed excerpts, URLs, ordering and warnings in its key, so changed evidence does not reuse an old comparison.

## Validation and remaining work

Offline replay of the saved real Apple excerpts flagged the Facebook login page and encoded SVG, while the New York Post excerpt received no new content-quality warning. This replay used saved text only, not a new live search or model assessment. Synthetic regressions test six-candidate selection, alternate role holders, domain grouping, literal ordering, unsafe content, date preservation, context warnings, cache isolation and avoided inference.

At implementation time, live confirmation was pending. A [subsequent bounded recheck passed](LIVE-DEMO-VALIDATION.md#source-quality-recheck-passed-on-november-4-2026): one Basic search returned readable New York Post, TechCrunch and The Verge excerpts, supporting the positive Apple CEO claim and contradicting the former-holder claim with two Gemini comparisons. The original failed demo record remains unchanged. This is one entity/topic, not broad accuracy evidence. Undated/older official leadership pages still cannot automatically prove a current role under the existing date policy; no dates are fabricated and no one-source decisive verdict is introduced.

Validation on November 4, 2026: all 563 unit/API tests passed, including 14 new source-quality regressions. All six affected desktop/mobile browser checks, lint, TypeScript, production build, six offline fixture regressions and API smoke passed. The final saved-source replay confirmed the readable/login/SVG distinction. Browser notes disclose retrieval limitations and omissions. No real Tavily/Gemini calls occurred; `.env` stayed unchanged. These results validate filtering and wiring, not improved live coverage or arbitrary-claim accuracy.
