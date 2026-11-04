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
