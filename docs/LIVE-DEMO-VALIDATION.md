# Step 2: real-source demo validation

On November 4, 2026, the user requested a small real-source demo set after the historical fix passed its live recheck. This step was bounded to at most two basic Tavily searches and four Gemini comparisons, with rules extraction, shared search caching, no retries, no provider fallback and no saved `.env` edits. The test used the same Fastify `/api/analysis` route as the website via local injection, not a new browser session or simulated search response.

Expected leadership facts were checked independently against [Apple's current CEO profile](https://investor.apple.com/leadership-and-governance/person-details/default.aspx?ItemId=74ee6968-1323-4887-a108-d80ab5c35b02) and [Tesla's executive profile](https://ir.tesla.com/corporate/elon-musk). Those references establish why the test selected its expected labels. Their text was not inserted into Tavily results or sent to the model as extra evidence. Actual verdicts used only the real returned search excerpts and existing source/date/scope policies.

| Input | Expected demo outcome | Actual outcome |
| --- | --- | --- |
| Acme Pro costs $20/month. | inconclusive | inconclusive, deterministic ambiguity guard; zero requests |
| John Ternus is CEO of Apple. | supported | inconclusive |
| Tim Cook is CEO of Apple. | contradicted | inconclusive |
| Elon Musk is CEO of Tesla. | supported | inconclusive |
| Tim Cook is CEO of Tesla. | contradicted | inconclusive |

Each company's positive/negative pair reused one neutral-query search result, so two actual Tavily searches covered four leadership inputs. The Apple pair made two model comparisons. Both returned valid inconclusive results because fewer than two qualifying groups agreed. The Tesla pair was stopped before inference by source-context checks. The ambiguity input made no search or model call.

## Evidence review

The Apple search returned a recent New York Post report explicitly discussing the current CEO, a CNBC Facebook video page whose excerpt was mostly login/navigation and unrelated material, and a TIME Facebook post whose excerpt was mostly encoded SVG. The model labelled the New York Post excerpt as supporting the positive claim, CNBC's as insufficient, and the encoded-SVG source as supporting despite lacking direct readable claim evidence. The deterministic role-relevance check made that SVG source ineligible, preventing its model label from counting toward a verdict. Different posts on the same Facebook hostname would not establish separate source groups in any event.

The Tesla search returned Britannica and Yahoo excerpts. One selected passage described a historical company leader; another was mostly an image caption. Both had warnings that other potentially relevant passages were omitted by the excerpt limit. Comparison therefore abstained before a model request instead of treating partial context as complete current-role evidence.

The validation demonstrates real retrieval, cache reuse, successful model transport where invoked, source retention and conservative abstention. It does **not** establish a working three-verdict live demo. The required supported/contradicted demonstrations are still unvalidated. Source selection/coverage, social login/markup filtering and context availability remain concrete blockers; lowering corroboration or context requirements to obtain a pass would be unjustified.

## Usage and saved records

Actual verification usage was **two Tavily basic-search attempts and two Gemini comparisons**, below the four-model cap. Expected Tavily usage is two credits, not an account billing audit. Startup catalog metadata requests are separate from model-generation counts. No additional queries, inference retries or synthesized replacement evidence were used. The temporary gateway was stopped. Saved `.env` remained unchanged.

The exclusive ignored report is `.local/live-demo-validation/result.json`; individual API reports are retained in that directory's `data/` subdirectory. No production code changed in this step. The source-quality gap is recorded explicitly for the team handoff. Step 2 has been tested but has not passed; proceeding to the guide or addressing coverage first requires the user's next-step choice.

## Source-quality recheck: passed on November 4, 2026

After commit `4166a5c`, the user authorized a live recheck with at most two Basic Tavily searches and four Gemini comparisons, no retries or paid fallback. The original failed report above was preserved. The new test used the same Fastify `/api/analysis` route as the website through local injection, rules extraction, current scope and a temporary Bifrost gateway. It did not launch a browser or inject reference-page text into model evidence.

| Claim | Result | Assessment |
| --- | --- | --- |
| Acme Pro costs $20/month. | inconclusive | Currency ambiguity guard; no search or model call |
| John Ternus is CEO of Apple. | supported | Three eligible source groups assessed as supporting |
| Tim Cook is CEO of Apple. | contradicted | Same retrieved excerpts; three groups assessed as contradicting |

Apple's [current CEO profile](https://investor.apple.com/leadership-and-governance/person-details/default.aspx?ItemId=74ee6968-1323-4887-a108-d80ab5c35b02) was checked independently again for expected labels. It was not supplied as extra model evidence. Actual retained sources were [New York Post](https://nypost.com/2026/11/02/business/apple-beats-revenue-expectations-in-first-earnings-report-under-new-ceo-john-ternus), [TechCrunch](https://techcrunch.com/2026/10/31/apple-ceo-says-the-company-doesnt-want-to-ship-ai-for-ais-sake) and [The Verge](https://www.theverge.com/news/1008279/apple-tim-cook-not-meddling-john-ternus-ceo). Their returned excerpts explicitly described the leadership transition/current role and passed existing date, scope, duplication and readability gates. Publication estimates were November 3, October 31 and October 8 respectively. They remained unreviewed sources; different hostnames do not prove independence.

Both live comparisons completed through Bifrost/Gemini with HTTP 200 and valid schemas/quotes. Recorded gateway durations were about 8.62 seconds and 1.36 seconds. The positive claim received a recency score of 11/100 because the oldest qualifying publication was nearly 27 days old; this is not low truth confidence. The contradicted claim retained unknown freshness and no score. Neither returned a correction; the exact shared-sentence correction rule was not relaxed to synthesize one. Both comparisons were cache misses because the claims differ; only the Tavily search was reused. Real comparison-cache savings were not measured in this run.

Actual verification usage: **one Tavily Basic search attempt and two Gemini comparisons**. Expected Tavily usage is one credit under documented Basic pricing, not an account billing audit. Gateway startup catalog metadata requests are separate from model-generation counts. The unused search/model allowance was not spent, and the Tesla contingency cases were skipped after the Apple pair passed. The inconclusive example tests an input guard, not live-source insufficiency. This confirms the three selected demo outcomes, not a broad accuracy evaluation or all possible inconclusive paths.

The exclusive new artifact is `.local/live-demo-quality-recheck/result.json`, with individual reports in its `data/` subdirectory. The temporary gateway was stopped and `.env` matched its pre-test checksum, retaining rules/mock modes and zero saved request caps. No production code changed during this recheck. The result supplies a successful small real-source supported/contradicted demonstration after the earlier failure; broader topic coverage and independent evaluation remain necessary.
