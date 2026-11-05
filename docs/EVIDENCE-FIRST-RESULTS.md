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
