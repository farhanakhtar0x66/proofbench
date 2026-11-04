# Showcase context fix

The failed focused recheck found a concrete mismatch: Tavily page text often uses single line breaks, while our selector expected blank-line paragraphs. It clipped the beginning of long pages, then rejected those clips. The old 20,000-character scan also excluded several otherwise inspectable pages. This change addresses that mechanism before using the separately approved four-search/four-comparison showcase allowance.

## Text and grounding

Selection now recognizes single-newline blocks and nearby wrapped context. It scans at most 200,000 characters from the already bounded search response, while keeping the total quoted model context at 1,200 characters per source. Readable subject/role, product/support, plan/pricing, historical-event and quantity statements are ranked without preferring the asserted value. Navigation/package identifiers are not evidence. Common adjacent conditions and attribution are carried with the selected block; oversized qualifying or omitted relevant material still excludes corroboration.

Separated relevant blocks can be included together in source order, joined with a visible `[...]` marker. This carries opposing statements to the same model input instead of selecting one and dropping the other. At most six exact blocks fit within the existing total quote limit. Optional `VerificationSource.excerptPassages` records each block's original text and UTF-16 offsets. Selection bounds enclose the original blocks; they no longer imply that a multi-block excerpt is one continuous substring. Short sources and single-block selections retain their original representation. The website already shows the omission markers and selection explanation.

Comparison validates the block order, bounds, lengths and exact assembled quote before inference. The model must still return the exact entire supplied quote or validated source references. Source metadata authenticates neither website ownership nor truth; all evidence remains untrusted. Existing duplicate/hostname corroboration, quantity, currency, context and schema guards remain. This additive contract field is optional for old reports; strict external clients should accept it before upgrading API/web together.

## Temporal context and queries

Page-wide update labels are still checked, but effective/as-of dates are evaluated in the selected evidence rather than unrelated archive/footer content. Complete English effective/as-of dates, including supported day-first and ordinal month forms, are calendar validated. Non-temporal adjectives such as “effective leadership” no longer look like unresolved dates. Invalid/future operative dates and unknown explicit temporal statements still abstain. Retrieval time never becomes publication time.

Recognized simple pricing searches are neutral about the claimed amount, retaining the product, currency, period and explicit region/billing qualifiers. Original statements remain unchanged for comparison. Literal/qualified unsupported language retains the previous path. No extra search, page fetch, provider, retry or inference stage is added.

## Reproducibility and remaining limits

The live evaluation runner can now save successful bounded search response bodies under ignored `search-N.json` files beside its result. They contain returned public search data, not request headers or keys. A response clone preserves the verifier's stream; saving adds no provider call. This allows offline diagnosis of the same returned page bodies if a live case fails, unlike the earlier artifact that retained only clipped excerpts. The source response remains bounded at 2 MiB and the model quote/input limits stay in place.

Regression tests cover single-line navigation, useful facts beyond the former scan limit, exact block offsets, separated opposing statements, wrapped/oversized conditions, tampered bundle rejection, scoped temporal checks and neutral pricing. These tests do not establish a working live showcase. Live findings and actual request counts must be recorded separately; no universal verification claim follows from a passing offline suite.

Offline validation on November 4, 2026 passed all 630 automated tests across 53 files, all 16 desktop/mobile browser checks, lint, TypeScript/production build, ten scripted topic cases and API smoke checks. No Tavily/Gemini requests were made by these checks; saved `.env` remained unchanged.
