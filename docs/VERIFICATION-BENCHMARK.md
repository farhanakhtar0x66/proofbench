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

Running the model arm later could require up to nine Gemini comparisons, with zero Tavily searches because evidence is fixed. Evidence prechecks may reduce that count. No such requests are authorized or made by preparation. A metered live runner and explicit allowance are separate next steps. This benchmark is separate from the earlier optional-language benchmark, which used a different eight-case claim-normalization task.

On November 4, 2026, preparation completed with 8/10 expected outcomes matched by the existing deterministic verifier, zero incorrect decisive verdicts and six inconclusive results. The two expected decisive results it missed were the dated historical event and spelled-number pricing paraphrase. This small selected set does not establish an 80% real-world accuracy rate. The Gemini arm has not run, so no model improvement is claimed. TypeScript and the focused no-network benchmark test passed; no real Gemini/Tavily requests were made and `.env` was unchanged.
