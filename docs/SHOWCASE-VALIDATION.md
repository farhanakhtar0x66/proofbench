# Showcase validation: failed fresh batch, successful saved-source continuation

On November 4, 2026, the user separately approved at most four Tavily Basic searches and four Gemini comparisons, plus gateway metadata, after offline fixes. No retries or paid/provider fallback were allowed. The allowance covered this search phase and first comparisons on its saved evidence; no previous batch allowance was reused.

## Fresh search phase

The four prepared claims ran through the combined API using implementation `cb1777d`. All four returned inconclusive before inference: four Basic searches, zero model requests. The original report is preserved at ignored `.local/topic-validation/focused-live-zItvmx/result.json`; successful returned search bodies are saved beside it as `search-1.json` through `search-4.json`.

Unlike the preceding artifact, these saved bodies allowed diagnosis without new searches. The context selector could now find relevant facts, but its 1,200-character budget still omitted relevant blocks. Pricing evidence lacked explicit USD. Historical source matching was too literal about `The EU GDPR`, excluding acronym/date-first descriptions even when European Union scope and the completed date were explicit. The original four-case phase remains a failed test; it was not overwritten or retrospectively labelled successful.

## Offline refinement on the same source bodies

Quoted source context was increased to 2,400 characters per source, still bounded by the existing 10,000-character model input and 2 MiB search-response limits. Navigation and unrelated neighboring prose no longer dominate candidate windows; common qualifying/attributed continuations remain attached, and genuinely omitted relevant material still excludes corroboration. Exact repeated windows are deduplicated without dropping unique opposing statements. Quotes remain exact source blocks with visible omissions and validated offsets.

Historical event handling now accepts jurisdiction-bound acronym references and date-first completed wording. A jurisdiction must be explicit; a differently named jurisdiction does not gain an alias match, and publication must still follow the event. Planned/future/undated events are not admitted. Semantic entailment and the final verdict remain model-assisted and subject to corroboration guards. This is a limited English scope interpretation, not a general legal equivalence resolver or proof of source authority.

All source reprocessing was offline, preserving the search phase's original retrieval timestamps. It found three eligible historical source groups: PrivacyEngine, Cooley and gdpr.eu. Current leadership still lacked two eligible matching groups; USD pricing remained uncorroborated. No source or expected answer was inserted into the evidence. The prepared replay at ignored `.local/showcase-continuation/prepared.json` records scripted insufficient assessments used only to inspect eligibility, not as factual results.

## First real comparisons on the recorded evidence

The same three historical sources were compared through Bifrost/Gemini against two distinct claims:

| Assertion | Real model-assisted result | Freshness |
| --- | --- | --- |
| EU GDPR became applicable on May 25, 2018 | supported | unknown; null score |
| EU GDPR became applicable on May 25, 2020 | contradicted | unknown; null score |

Both requests returned HTTP 200 with valid structured responses, exact source references/quotes and eligible corroboration. Gateway durations were about 1.74 and 1.98 seconds. These were the **first** model comparisons on these saved sources, not retries of failed inference. The second assertion is a showcase counterexample, not one of the original four claims. Neither result establishes that a contradicted assertion was once true, and no historical result is advertised as current. No exact shared replacement sentence was required or invented to force a correction.

Actual comparison artifacts are in ignored `.local/showcase-continuation/live.json`. Successful reports were validated and saved into the existing local JSON store for website lookup, with distinct IDs and a limitation explaining that their evidence was retrieved earlier. The original failed four-case report is unchanged. A deterministic currency-ambiguity report from the previous real test batch is also available as an inconclusive example; it used no model/search and is labelled accordingly in the local guide.

**Usage before the fresh confirmation:** four Basic search attempts and two Gemini generation requests. Two comparison slots remained. Gateway startup catalog calls are separate. The original saved `.env` remained offline with zero saved caps, and the temporary gateway was stopped after this phase.

## Separately approved fresh combined-flow confirmation

The user then approved one additional Basic search and the two unused model slots to confirm both historical assertions through fresh `POST /api/analysis` submissions. Temporary process settings enabled rules extraction, live retrieval and comparison; no saved settings were edited. These were new API submissions using real fetch, not injected source responses or a comparison-only continuation.

Both returned HTTP 201 with complete reports. The 2018 assertion was **supported** and the 2020 assertion **contradicted**. Both retained unknown freshness and a null score. The second claim reused the first claim's neutral-query search, so the phase used **one new Basic search and two new Gemini comparisons**, with no retries. PrivacyEngine and Cooley supplied eligible agreeing source assessments; the gdpr-info.eu result was retained but excluded from corroboration. Gateway comparison durations were about 1.87 and 2.52 seconds.

The exclusive ignored report is `.local/showcase-continuation/fresh.json`; the returned search body is `fresh-search.json`. Both full API reports were persisted by the actual analysis route in the normal local data store. The local showcase manifest/guide now selects these freshly verified reports rather than the comparison-only continuation. Browser submission itself was not exercised live: this phase used Fastify injection on the same route the website calls. Browser tests separately verify saved-report loading through the real local API without provider calls.

**Final total for this showcase work:** five Basic search attempts (expected five credits, not a billing audit) and four Gemini generation requests, plus separate gateway startup catalog metadata calls. No retry or paid/provider fallback was used. `.env` matched its original checksum and retained offline settings/zero saved caps. The gateway was stopped after confirmation. Loading the persisted reports incurs no new search/inference request.

## What this establishes

The historical pair demonstrates real evidence-backed supported/contradicted results, a passing fresh combined backend flow for those claims, and working saved-report presentation. It does not make the original four-case run pass, establish fresh browser verification for all topics, or prove reliable arbitrary-statement verification. The saved examples are for a transparent, repeatable showcase. Current leadership, USD pricing and sports source coverage remain limitations.

The generic website loader was tested against real locally stored API reports with zero provider calls, plus automated desktop/mobile browser regressions for loading, editing and missing IDs. No model key or public article body was added to tracked fixtures.

Final offline validation: all 632 automated tests across 53 files, all 20 desktop/mobile browser checks (including four saved-report checks), lint, TypeScript/build, six fixture regressions and API smoke checks passed. The saved-report checks were repeated after the final display-state change. Tests are regressions, not a general accuracy estimate.
