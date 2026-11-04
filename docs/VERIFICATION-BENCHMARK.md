# Fixed rules/model comparison benchmark

Prepare the dataset and deterministic baseline offline:

```bash
npm run benchmark:verification:prepare
```

This command loads the versioned fictional cases in `fixtures/verification-benchmark/v1.json`, resolves one evidence/date snapshot, runs the existing deterministic verifier and saves a timestamped preparation report under `.local/verification-benchmark/`. `latest.json` points to the newest run and its hashes. Earlier snapshots are preserved. The command does not load `.env`, start a gateway, perform real searches or run model inference.

The fixed set has ten cases: matching pricing, changed pricing, changed leadership, changed API version, ambiguous currency, region mismatch, conflicting sources, a completed historical end-of-life event, missing evidence and a pricing paraphrase. Expected outcomes and reasoning were assigned before any model run. They are development labels authored for these fictional examples, not independent reviewer adjudication or a hidden holdout. Source names, statements, dates and URLs are simulated.

Each report contains a SHA-256 dataset hash and a separate hash of the fully resolved evidence envelopes. Both modes must use the exact same saved claim/excerpts/dates/URLs. The existing deterministic verifier receives those fixtures through an injected fetch; its unsupported-pattern/time-sensitivity rules can skip retrieval. The model arm is explicitly `pending`, with metrics null. There is no scripted substitute presented as model performance.

The planned candidate arm is the current Bifrost-assisted evidence-comparison implementation. Only its claim and source envelope may be sent to the model; expected labels, rationales and baseline outcomes must stay local. The comparison includes different deterministic date/scope policies as well as model assistance, so a measured gap would compare the two implementations and would not isolate the model as the sole cause.

Future results should record case-level expected/actual verdicts, matched-label rate, incorrect decisive verdict count, inconclusive rate, wall-clock/inference latency, attempted model requests, failures and skipped comparisons. The preparation report computes baseline metrics and leaves model metrics pending. Missing/blocked model runs must not be counted as successful inference. The saved snapshot must still satisfy the selected date policy at run time; if it ages out, prepare a new snapshot and rerun both modes together.

Running the model arm later could require up to nine Gemini comparisons, with zero Tavily searches because evidence is fixed. Evidence prechecks may reduce that count. No such requests are authorized or made by preparation. The metered runner below is now implemented; actual execution still requires an explicit allowance. This benchmark is separate from the earlier optional-language benchmark, which used a different eight-case claim-normalization task.

On November 4, 2026, preparation completed with 8/10 expected outcomes matched by the existing deterministic verifier, zero incorrect decisive verdicts and six inconclusive results. The two expected decisive results it missed were the dated historical event and spelled-number pricing paraphrase. This small selected set does not establish an 80% real-world accuracy rate. The Gemini arm has not run, so no model improvement is claimed. TypeScript and the focused no-network benchmark test passed; no real Gemini/Tavily requests were made and `.env` was unchanged.

## Model runner

`npm run benchmark:verification:check` is an offline readiness check. It validates the latest snapshot's dataset/evidence hashes and fixed case labels/content, and rejects a baseline older than 24 hours. It does not load `.env` or contact any gateway/provider. An expired snapshot requires preparing both arms again, not silently updating only model evidence dates.

`npm run benchmark:verification:live` loads ignored `.env` but refuses execution unless temporary process settings explicitly include `RUN_VERIFICATION_BENCHMARK=true`, the exact planned model cap (currently `BIFROST_LLM_MAX_REQUESTS=9`), `TAVILY_MODE=mock`, `ALLOW_PAID_REQUESTS=false`, `TAVILY_MAX_REQUESTS=0`, and an otherwise ready, explicitly confirmed free-tier Gemini/Groq configuration. This flag is a local guard, not proof of provider billing status. No allowance is implied by documenting this command. Prepare/start the selected local Bifrost gateway with the reviewed settings only after the test allowance is agreed.

The runner permits only the selected local Bifrost completion endpoint, reserves each attempt before sending, and never calls Tavily. It sends only the existing claim/source envelope through the comparison adapter. Expected labels, rationale and rules verdicts stay local. Provider/model fallback and automatic retries remain disabled. Bifrost startup catalog metadata requests are separate from this inference count.

The first inference failure stops remaining cases immediately; there is no retry or cooldown wait. Partial rows, original comparison reports, request counts and failure status are saved to the snapshot's `model-result.json`. Exclusive file creation prevents accidental rerunning/overwriting a result for that same snapshot. Do not prepare a new baseline merely to bypass a previously agreed allowance. Unexpected exceptions preserve completed rows when storage is available.

The output compares rules and candidate outcomes case by case and includes baseline counts. Completed model comparisons, precheck abstentions, failed calls and unrun cases are counted separately. Failed/unrun cases are excluded from verdict-match rates and explicitly reported; their fallback inconclusive result is not credited as model understanding. Partial rates must not be presented as complete benchmark results. Precheck abstentions can be valid pipeline outcomes, but are not model inferences.

Offline tests exercise hash/label corruption, stale snapshots, expected-label isolation from model input, failure stopping, partial-result retention, incorrect decisive verdict counting and separate precheck/inference accounting. The live-command guard was also checked with confirmation false and refused before gateway/model access. No live benchmark has run yet.

Runner validation on November 4, 2026 passed lint, TypeScript and both affected benchmark suites (four tests). Offline readiness validated the current locked snapshot. The false-confirmation live invocation stopped at its guard without making any request. Saved `.env` was unchanged and zero Gemini/Tavily calls were made in this implementation step.

## First authorized model run

On November 4, 2026, the user authorized the prepared benchmark with at most nine new Gemini model requests, zero Tavily searches and stopping at the first inference failure. The current ten-case snapshot was reused unchanged, with Gemini 3.5 Flash-Lite through Bifrost and a 30-second client deadline. No extraction calls, query generation, model/provider fallback or automatic retry occurred.

Five model requests were made. Pricing support, changed pricing, changed leadership and changed API version all completed and matched their expected verdicts. Those four cases also matched the deterministic baseline, so this portion shows working model comparisons, not improvement over rules. Mean completed-comparison wall-clock latency was about 1.97 seconds. No incorrect decisive verdict occurred among these four validated comparisons.

The ambiguous-currency case reached Gemini successfully at the gateway (HTTP 200) but failed backend correction validation: `The proposed correction was not a complete sentence corroborated by its eligible cited sources.` This message can reflect a correction whose source assessments were not contradicting as required, as well as a missing/rewritten sentence. Raw model content was not retained in the content-disabled gateway log, so the precise offending combination cannot be reconstructed from the saved fallback report. The backend kept both source citations, returned inconclusive and no correction, and the runner marked this as failed with correctness null rather than counting it as successful ambiguity handling.

The runner stopped after that validation failure. Region mismatch, source conflict, the dated historical event, missing evidence and pricing paraphrase were marked not run. Thus four cases were evaluated, one failed and five were unrun. The four-case 100% match rate is a partial-run figure, not a ten-case benchmark score, a model accuracy estimate or proof of a gain over the 8/10 rules baseline. Four of the planned nine model attempts were unused; no continuation or repeat occurred.

The full saved model report, baseline counts, source-bound comparison reports and individual statuses are in `.local/verification-benchmark/2026-11-04T01-05-01-999Z/model-result.json`. Gateway logs show successful transport for all five calls; the fifth was a semantic/validation failure rather than a timeout or HTTP rejection. Actual verification usage was five Gemini comparison attempts and zero Tavily searches; startup catalog metadata requests are separate. The gateway was stopped and saved `.env` settings were unchanged. Next is offline review of correction/ambiguity handling before deciding whether to authorize a revised continuation.

## Currency fix and bounded continuation

The [currency ambiguity guard](CURRENCY-AMBIGUITY.md) resolves the failed currency case deterministically without a new model comparison. `npm run benchmark:verification:check -- --resume` validates the original stopped report, its matching dataset/evidence, case ordering, labels, summed attempt counts and single currency-failure boundary. It performs the currency reassessment offline and selects only the original five unrun cases. The same provider/model is required. The first four completed model results are retained, not repeated.

The selected subset can make at most four further model requests; the empty-evidence case needs none. Original five attempts plus at most four new attempts stay within the original nine-request ceiling. Live continuation uses the existing live command with `--resume`, exact process cap four and zero-search settings. It writes `model-continuation.json` exclusively and never changes `model-result.json`. A SHA-256 parent-report hash binds the continuation to the preserved original. New inference failure still stops the run immediately, without retry.

The combined report is explicitly a staged run after an ambiguity-guard change. The currency result is a deterministic precheck, not a successful Gemini response. The original failed model attempt remains in prior/total failure counts, even if the updated final case outcomes all match. Total request counts include the original failed call, while successful source-bound model comparisons and precheck abstentions are counted separately. It must not be described as a clean ten-case single-pass model accuracy evaluation.

## Completed staged execution, November 4, 2026

The user authorized implementing the currency fix, finishing the benchmark, running necessary tests and committing locally without further confirmation. The currency fix was committed as `ec032f6` after all 502 then-current tests and required checks passed. The next run used only the original five unrun cases, with a hard cap of four new model requests and no searches.

Region mismatch and conflicting-source comparison passed. The historical-completed case then reached Gemini but failed the backend correction validator with the same generic uncorroborated/rewritten-correction diagnostic. It returned inconclusive and no correction; this was not credited as a correct supported result or retried. The run stopped at that failure, preserving the original report and writing `model-continuation.json`. It used three new model requests, leaving one request under the original total ceiling.

After reviewing the failure, `--finish` selected only the two still-untouched cases. Its validator checks the original/continuation hash chain, unchanged completed results, case order, failure boundary and cumulative request counts. Missing evidence was assessed offline with no model call. Pricing paraphrase made the final one allowed model call and correctly returned contradicted. No failed case or prior successful inference was repeated. The exclusive `model-final.json` is a third artifact; both earlier reports remain unchanged.

All ten case positions are processed, with zero unrun cases. The final report deliberately retains quality status `incomplete` because a validated historical verdict is still missing, while `executionStatus: all_cases_processed` distinguishes finished execution from a clean pass. The command returns nonzero for that retained validation failure. The final case outcomes comprise seven successful model comparisons, two deterministic precheck abstentions and one failed historical comparison. Nine of the ten expected outcomes matched. There were zero incorrect decisive verdicts, and one final fallback inconclusive where the expected historical verdict was supported. Mean wall-clock time of the seven successful model comparisons was about 1.75 seconds.

| Observation | Deterministic baseline | Revised staged model-assisted pipeline |
| --- | --- | --- |
| Expected case outcomes matched | 8/10 | 9/10, with one failed validation |
| Incorrect decisive verdicts | 0 | 0 |
| Case positions not processed | 0 | 0 |
| Current failed case | none; historical/paraphrase abstained | historical correction validation |

These are selected fictional development cases, not general accuracy rates or an isolated measure of LLM benefit. The model-assisted pipeline changed its ambiguity guard between stages and includes deterministic prechecks. The improvement in this sample is the pricing paraphrase; the historical expected result remains unvalidated. The original currency model call also failed before its deterministic guard was added, so the execution history contains two failed inference attempts even though only one final case remains failed.

This implementation turn used exactly four new Gemini comparison attempts and zero Tavily searches. Cumulative benchmark usage was nine model requests: seven validated comparisons plus the original currency failure and historical failure. Startup catalog metadata requests are separate from these counts. No retries, paid fallback, hosted-provider switch or saved `.env` changes occurred. The temporary gateway was stopped after each controlled stage. The new execution record is `.local/verification-benchmark/2026-11-04T01-05-01-999Z/model-final.json`.

Final validation passed all 503 tests across 41 files using one worker, lint, TypeScript, six fixture regressions, all 14 synthetic pipeline scenarios, production build and API smoke checks. The additional tail-continuation test verifies parent hashes, cumulative eight-plus-one request accounting, retaining the historical failure and selecting only the untouched missing-evidence/paraphrase cases. These offline checks make no additional provider calls. The remaining live quality gap is historical-event correction handling; its strict rejection was preserved rather than relaxed to raise the benchmark score.
