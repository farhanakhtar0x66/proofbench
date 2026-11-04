# Retrieval coverage: page text, relevance and completed events

This follows the [ten-case live batch](LIVE-TOPIC-RESULTS.md), which left six known facts inconclusive. Implementation and validation here were offline; no new Tavily/Gemini requests or saved `.env` edits were made. The same website `/api/analysis` flow uses these improvements.

## Fuller text within one search

General retrieval requests `include_raw_content: "text"` in its existing six-candidate Basic Search. Tavily documents parsed page text with possible extra latency, and assigns Basic Search one credit per request. We do not call Extract, browse result URLs, add a second search or add model inference. Legacy narrow verification still requests snippets. See the [Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search) and [credits](https://docs.tavily.com/documentation/api-credits), reviewed November 4, 2026. Expected credit cost is not a billing audit.

Returned page text takes precedence over a potentially incomplete/caption-only snippet. Missing or empty page text falls back explicitly to the snippet; raw-only results work too. A walled page is not silently replaced with a more convenient positive snippet. Selection metadata names the representation, and offsets/source length refer to it.

The first 20,000 characters are scanned; the retained exact contiguous excerpt remains at most 1,200 characters. Clipping, uninspected text and omitted relevant passages retain exclusion warnings. More page text can still leave insufficient context. Full-page temporal warnings survive when the selected passage omits the date label. Publication age is recomputed at comparison time; retrieval checks dates after the response arrives, avoiding a timestamp race with request start. Search response bodies are bounded to 2 MiB before parsing, and redirects are rejected. Oversized/failed responses use existing safe failure without retries or refunded budget. The existing ten-second search deadline remains.

## Relevance and website hints

Current-scope candidates are ordered by readability/scope quality, entity/topic overlap, date eligibility and website identity hints, before hostname diversity and the three-source retention limit. Captain appointment priority remains; literal `as_stated` preserves provider order.

Existing subject parsers identify the organization/product without using the alleged role holder as a ranking target. Otherwise lexical topic overlap is used. A matching HTTPS brand hostname plus title/text overlap is a website ranking hint, not ownership verification. An impersonator can mimic it. Sources retain `unreviewed`/`context`; titles/URLs never become quote evidence, and no website allowlist is required. Relevance and hostname diversity do not prove authority or independence. Aliases and obscure organizations may be missed.

## Completed historical events

Alongside existing lifecycle/end-of-life handling, a narrow parser recognizes full past dates attached to `became applicable`, `took effect`, `was released`, `was founded` and `was established`. Supported ISO/full English dates undergo calendar validation. Qualified, attributed, invalid and future assertions retain the conservative path.

Recognized completed events use a neutral subject/event/date search without the 30-day retrieval filter or the asserted date in the query. The original claim remains unchanged for comparison. Opposite dates for the same subject/event can therefore share search results.

An old report can qualify only when its excerpt explicitly names the same subject/event and a complete event date, valid publication follows that event, and existing context, duplication, metadata and safety checks pass. A different event date may be assessed as contradictory by the model; the parser never decides truth. Two eligible groups and validated model assessments remain necessary. Historical support has unknown freshness and a null score, even with recent sources. Missing publication dates, schedules, future reports, update conflicts, wrong subjects and clipped context gain no exemption.

This does not make old documents evidence of current leadership, pricing, laws or software support. Undated documents and timeless rules without recognized dated events can still be inconclusive.

## Offline verification and limits

Regressions cover recovery from caption snippets, preserved conditions, missing/raw-only text, bounded offsets, omitted date warnings, relevance/identity ranking, shared caching, response-size rejection and legacy compatibility. Historical cases cover neutral queries, date normalization, old corroboration, contrary dates, unknown freshness and temporal rejection. Scripted model responses test plumbing and policy, not model understanding. Search/comparison cache policy versions changed to avoid reusing old representations/verdicts.

The saved live report contains retained snippets, not missing page bodies or omitted candidates. It cannot demonstrate recovery of unavailable text offline. No synthetic page was inserted into that report, and no improved live pass rate is claimed. A bounded live recheck remains necessary to measure actual coverage.

Validation on November 4, 2026: all 617 automated tests across 51 files, all 16 desktop/mobile browser checks, lint, TypeScript/production build, six existing fixture regressions, ten scripted topic cases and API smoke checks passed. Saved `.env` matched its prior checksum. This work used zero new Tavily/Gemini requests and was committed locally without pushing.
