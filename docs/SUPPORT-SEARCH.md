# Support-status search planning

For clear English support assertions with explicit subjects, current-scope retrieval now searches neutrally for lifecycle documentation. For example:

```text
Claim: Python 2 is currently supported.
Query: Python 2 support status end of life official documentation
```

Positive, negative and no-longer-supported variants use the same neutral query; the original claim is retained for comparison. The query does not assume support exists or has ended. No domain mapping, official ownership assertion, model-generated query or additional search is added. `official documentation` is a search hint, not proof of authority. It does not resolve whether an unqualified claim means upstream, vendor or other support; that scope still matters to interpretation and evidence comparison.

This recognized current-scope search omits `start_date`, `end_date` and `filter_by_published_date`, allowing older or undated announcements to be retrieved instead of discarded by the provider's recent-publication filter. `include_published_date` remains true. Basic search, at most three results, no raw-content fetching and no synthesized answer remain unchanged. `auto_parameters: false` is now explicit for all search requests, not only dated requests. The same server budget and raw-result cache apply.

The parser shares its explicit subject with excerpt-quality checks. It recognizes simple `subject is/are [not/currently/no longer] supported` forms. Recognized historical, conditional, attributed, compound, pronoun-only and object-qualified statements are deferred rather than stripped of context. `as_stated` remains literal with its previous unfiltered retrieval behavior. Pricing, leadership and other current queries retain the existing publication-date window. These are limited English patterns; unfamiliar phrases are not silently treated as lifecycle claims.

Retrieval reports expose current scope without a `searchWindow` for this case and disclose the unfiltered search in limitations. The website's scope selector and per-result search-window text explain the exception. Provider-estimated source dates and missing-date warnings remain visible.

Crucially, this changes **retrieval coverage**, not date eligibility or truth rules. The comparison's existing 30-day policy still excludes old or undated excerpts from current corroboration. They remain useful visible context but do not automatically supply a decisive verdict or current freshness. Distinct source groups, relevance, exact excerpts, correction validation, budgets and inconclusive fallback are unchanged. Source authority/current applicability for older announcements needs a separate justified policy; this implementation does not equate historical publication with verified present status. It can therefore still return inconclusive even after finding older direct documentation.

Offline regression cases cover support variants, version punctuation, preserved qualifications, unchanged pricing/role date windows, exact request parameters, retained historical dates/warnings, cache reuse and abstention without inference when only old sources are available. No live-source coverage improvement or factual accuracy measurement is claimed by those simulations.

Validation on November 4, 2026 passed all 464 tests across 35 files using one worker, all 16 desktop/mobile browser checks, lint, TypeScript, six fixture regressions, production build and offline API smoke checks. Sixteen new support-search cases were added. Actual `.env` was unchanged and zero Gemini or Tavily requests were made.

## Separately authorized live result

On November 4, 2026, the user authorized one fresh Tavily basic search and at most one Gemini comparison. A single website submission of `Python 2 is currently supported.` used rules extraction and the new neutral lifecycle query without a publication-date filter. This used a new, empty server cache, with hard transport caps and no retry. HTTP 201 returned in about 3.07 seconds.

The search returned excerpts from Stack Overflow (provider publication estimate in 2011), DNAnexus documentation (no publication date), and InfoWorld (estimate in 2020). Their text addressed Python 2 end of life more directly than the prior package-list/general-compatibility results. That is a qualitative observation for this one query, not an accuracy benchmark or proof of source authority. The Stack Overflow excerpt describes a historical plan for 2020; scheduled events are not by themselves proof of completion. The DNAnexus excerpt is vendor-context documentation, and it and the InfoWorld result received omitted-passage warnings.

Comparison abstained before inference: the existing date policy excluded old/undated evidence, and two sources also required fuller-context review. Outcome was `inconclusive`, status `partial`, all three source links/quotes/warnings retained, and no correction. Actual verification usage was one Tavily basic-search attempt (expected one credit, not a billing audit) and zero Gemini comparison attempts. Gateway startup catalog metadata requests are separate from the inference count. All temporary services were stopped and saved `.env` remained unchanged.

Ignored records are `.local/live-website-check/support-analysis.json`, `support-website.png` and current `usage.json`; earlier usage was archived under a timestamped name. This confirms that unfiltered lifecycle retrieval works and may surface more pertinent historical text. It does not establish a complete model-backed factual verdict. Further work must distinguish an explicitly completed historical event from a future schedule, current support scope from vendor support, and usable full context from an excerpt warning. Repeating this same query alone will not fix those eligibility issues, and simply treating every old page as current would be unjustified.

A subsequent offline [historical-support policy](HISTORICAL-SUPPORT.md) adds a narrow exception for dated completed-event assertions. It does not turn old announcements into proof of today's support state or waive missing dates/context warnings in the saved live test.
