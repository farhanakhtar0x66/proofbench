# Evidence-first live development check

A user-approved batch on November 5, 2026 exercised the real Fastify `/api/analysis` handler with new Tavily Basic searches and Groq comparisons through Bifrost. Extraction used rules. No saved response was substituted for live retrieval. The four inputs and expected labels were selected before execution. They are development cases, not an independent benchmark or evidence of arbitrary-statement reliability.

| Statement | Expected | Fresh result | API processing time |
| --- | --- | --- | --- |
| JSON stands for JavaScript Object Notation. | supported | supported | 4.1 s |
| JSON stands for Java Standard Object Notation. | contradicted | contradicted | 4.9 s |
| Rahul Gandhi is the prime minister of India. | contradicted | contradicted | 6.3 s |
| Python 2 is currently supported upstream. | contradicted | inconclusive | 6.0 s |

Three of four matched the expected verdict, with one coverage miss and no observed wrong decisive verdict in this small set. Every case reached a schema-valid model comparison. All results had unconfirmed publication recency and no invented numeric freshness score. Processing times exclude gateway startup and deliberate pacing between cases. This was real-source API validation, not a browser interaction test.

The software-support query used literal wording because the support parser did not recognize the suffix “supported upstream.” Selected excerpts concerned Python 3 and distribution-level support, so the model correctly refused to infer Python 2 upstream status from them. The parser now recognizes that suffix and “supported by the upstream project” generically. Offline tests verify neutral lifecycle queries without removing the original claim's scope. **The corrected query has not been rechecked live.** The user declined the proposed extra search/comparison; that coverage gap remains open. No successful Python support verdict or full showcase readiness is claimed.

Usage: four Tavily search attempts and four Groq comparison attempts, within the approved ceilings; no retries or paid/provider fallback. Gateway startup model-catalog metadata requests were separate. Per-request data and receipts remain ignored under `.local/evidence-first-check/`. Only a temporary gateway started by the evaluation was stopped; saved `.env` and frontend components were not edited. No push was made.

Reproduction instructions and policy limits: [EVIDENCE-FIRST.md](EVIDENCE-FIRST.md). Real provider testing requires a new explicit allowance; the completed allowance must not be silently reused. Offline tests cover policy separation, current-scope broad retrieval, primary identity boundaries, conflict/date/context guards, structured output and allowance inspection. They do not replace the missing fresh software-support check.

Final offline validation: 784 tests across 65 files passed, along with lint, TypeScript/build and 6/6 fixture evaluation checks. These counts describe regressions, not independently verified live claims.

## Live launcher follow-up

A bounded `dev:live -- --requests N` launcher now validates local configuration, checks gateway health and development ports, and starts the existing backend and website with matching live caps. Its `--check` configuration-only command passed with the selected Groq setup without any network requests. The follow-up passed 804 offline tests across 66 files, lint, build and fixture evaluation. No additional Tavily/Groq calls or browser verification were performed; the software-support fresh-validation gap above remains open.

## Manual software-support follow-up

The user subsequently ran the corrected neutral lifecycle query through the website. It still returned inconclusive: Groq assessed one eligible source as contradicting; the other contradicting source failed historical/as-of scope checks, and the official guide was represented by navigation text and excluded on update/publication metadata. [Support-table handling and publication-estimate separation](SUPPORT-TABLES.md) were then corrected and tested offline. No new Tavily/Groq requests were made for that correction; its fresh app outcome remains unconfirmed.

## Search-timeout follow-up

A later manual country/population claim timed out in retrieval before any model comparison. The client had a fixed 10-second deadline. It now has a validated 20-second default (1–30-second configurable bounds), applies the same deadline through response-body reading, reports the chosen duration, and preserves one-attempt accounting with no retry. Retrieval failures explicitly explain why freshness is unavailable and why no Groq/Gemini call occurred. Tests simulate delayed success and body timeout; no new live Tavily or model calls were used to validate this change, and no successful recheck of that country claim is asserted.

Timeout-change validation passed: 829 offline tests across 68 files, lint, build and 6/6 fixture evaluations. The configuration-only live-launcher check printed a 20-second deadline and made no network requests. These checks do not establish that the original timed-out search would succeed with a longer wait.
