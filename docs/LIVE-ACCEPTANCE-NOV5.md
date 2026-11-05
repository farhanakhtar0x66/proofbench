# General verification checks — November 5, 2026

These are development checks, not an independent accuracy estimate or a claim that arbitrary statements can be reliably verified. The gateway was Bifrost with explicitly selected Groq `groq/openai/gpt-oss-20b`; extraction used rules and comparison used the model. Each fresh case went through Fastify `/api/analysis`, Tavily Basic retrieval and the backend evidence gates. No paid fallback or automatic provider retries were used.

## Frozen initial checks

Before changing the policy, five baseline inputs were frozen: Rust as a programming language, SQLite requiring a separate server process, Sydney as Australia's capital, TypeScript converting to JavaScript, and an ambiguous price statement. All returned inconclusive; only the deliberately ambiguous statement matched its expected label. The search date filter, passage exclusions and inadequate matching evidence caused the misses. This batch used five Tavily attempts and three model comparisons.

Five different claims were frozen for the next batch, and the implementation stayed unchanged during that batch:

| Claim | Expected | Fresh result | Approximate request latency |
| --- | --- | --- | --- |
| Mercury is the closest planet to the Sun. | supported | supported | 5.4 s |
| Venus is the closest planet to the Sun. | contradicted | inconclusive: one matching source group | 4.1 s |
| CSS is used to style web pages. | supported | supported | 5.4 s |
| HTML stands for HyperText Transfer Protocol. | contradicted | inconclusive: Tavily timeout | 10.0 s |
| The latest stable release of Python is Python 99. | contradicted | inconclusive: incomplete source context | 5.5 s |

The result was 2/5 exact matches, three inconclusive results, and no wrong decisive verdicts in this small batch. The timeout was not retried. It is a transport failure, not a correct factual verdict. These observations do not establish broad coverage.

## Subsequent fixes and separate checks

Declarative-statement ranking recovered matching evidence for Venus in the recorded search response. A real Groq comparison of that saved evidence returned contradicted in about 0.9 s, and a saved Mercury control remained supported in about 1.5 s. These checks used no new Tavily searches and were not fresh end-to-end checks.

A separately approved two-search fresh check then produced:

| Claim | Fresh result | Approximate request latency |
| --- | --- | --- |
| Venus is the closest planet to the Sun. | inconclusive: one eligible matching source group | 6.4 s |
| JSON stands for JavaScript Object Notation. | supported | 5.5 s |

The Venus search returned relevant material, but an unrecognized numeric page-update label and long-paragraph selection prevented one source from qualifying. General update-date parsing and sentence-boundary selection were then fixed. The final real Groq comparison of **those saved fresh-search excerpts** returned contradicted in about 1.2 s with original source quotes and retrieval dates retained. This was a staged search/comparison check, not another fresh `/api/analysis` submission. The post-fix fresh end-to-end negative case, HTML timeout recovery, Python latest-release coverage and broader unseen inputs remain unconfirmed. Do not describe these as all passing.

## Usage and reproduction

The combined approved ceiling was 12 Tavily Basic attempts and 12 gateway comparison attempts. The guarded counters reached both ceilings. One gateway attempt failed to connect locally and never reached Groq; eleven model comparisons returned validated responses. One Tavily attempt timed out; do not assume its credit was refunded. Provider model-catalog requests during gateway startup were separate and were not included in inference counts. This is application-side accounting, not a billing audit.

Inputs, per-request results, counters and raw Tavily receipts are retained only in ignored `.local/live-acceptance-v1/`. No keys, raw local reports or personal paths are committed. Temporary test gateways were stopped; saved `.env` remained unchanged. Running the website still requires the local Bifrost service and explicitly enabled, bounded live backend settings.

`npm test` reproduces the offline policy, protocol, passage, date and diagnostic regressions. `npm run lint`, `npm run build` and `npm run evaluate` check integration without provider calls. The existing `verify:check:live` command can check a separately approved fresh claim with matching temporary caps; inspect its documented configuration first. Offline fixtures and recorded-source comparisons must not be reported as fresh live accuracy.

Final local validation passed: 778 tests across 64 files, lint, TypeScript/build and 6/6 offline evaluation fixtures. The test count is a regression-check count, not 778 independently fact-checked live statements.
