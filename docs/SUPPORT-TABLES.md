# Support tables and publication estimates

A manual website check of `Python 2 is currently supported upstream.` reached Groq, which found contradicting content in one eligible source. A second source was historically scoped, and the developer-guide result was reduced to navigation text instead of its version/status table. Its valid past page-update date also preceded Tavily's estimated publication date, causing a metadata veto. The correct neutral lifecycle query was already in use.

The [official version-status page](https://devguide.python.org/versions/) was inspected publicly to establish its structure. It separates supported/unsupported sections and places version numbers in table rows beneath a shared product heading. That public-page inspection was not substituted into the application's Tavily response and was not a fresh end-to-end app verification.

The backend now recognizes bounded product/version support tables generically:

- The exact product heading, intervening introductory/section text, column headings and all matching version-family rows are retained with original offsets. Markdown and flattened-cell layouts are supported.
- Matching a family selects evidence for interpretation; it does not establish version equivalence or a support verdict. Exact minor-version claims do not match neighboring minor versions; major-version prefixes do not match different major numbers.
- Conflicting statuses and support conditions remain visible. Missing product/column context, scan overflow, too many rows or an oversized selection fall back to the existing conservative selector. No source name, claim-specific answer or new authority binding is added.

In current-scope comparison only, a valid past page update earlier than a valid provider publication estimate becomes a recency warning, rather than a factual-content veto. Both dates stay unchanged. Such a source cannot establish recent-publication freshness. Invalid, future, effective-date, explicit historical/as-of and incomplete-context warnings still block as before. The literal/as-stated policy is unchanged. The model receives the date warning alongside each exact excerpt.

Offline regressions cover table extraction, source offsets, product/version boundaries, conflicting rows, conditional support, date-estimate ordering and future/invalid-date controls. They use synthetic evidence and fake comparisons. **No post-fix Tavily/Groq recheck has been run, and no successful fresh Python-support verdict is claimed.** The application's previous inconclusive outcome remains the last observed live result for that claim.

The selector was also checked against an earlier saved Tavily raw page for the same developer-guide URL: it retained the product heading and both matching version-family status rows in a 1,286-character exact-offset excerpt, with no excerpt-quality warning. This is recorded-page extraction validation only, not a new live search or model verdict.

Final local checks passed: 815 tests across 67 files, lint, TypeScript/build and 6/6 fixture evaluation. These are offline regressions, not 815 live factual checks.
