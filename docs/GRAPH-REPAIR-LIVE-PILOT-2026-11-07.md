# Graph Repair live pilot: 7 November 2026

## Completed clean matrix

Session `b51d6b07-69c4-41ad-9836-e684c22cfbe4` completed all 12 trials with no unavailable trials. Each trial received five final checks. All six pairs used matching grading seeds and the recorded alternating agent order.

- ProofBench passed **6/6**, changed all six source artifacts, and made seven forwarded model requests. Observed usage totaled 5,400 input and 871 output tokens. Median agent time was 18.25 seconds; median time to verdict was 19.63 seconds.
- OpenCode passed **0/6** and submitted the unchanged starter in every trial. Its traces show successful source reads, repeated searches, and some unavailable-tool attempts. It made 34 forwarded model requests, with 104,687 input and 714 output tokens observed. Median agent time was 30.02 seconds; median time to verdict was 31.84 seconds.
- All **41 forwarded requests** returned HTTP 200 with the pinned `ollama/gemma4:12b` identity and request IDs. Four additional local call-limit rejections were not forwarded and consumed zero model tokens. Five OpenCode trials used all six admitted calls; four attempted another call and were stopped by the relay. One trial finished after four calls.
- Cost was unreported for both entries. The session's `comparable: true` describes provider/model receipt consistency under the current rule; it does not establish equivalent feedback or a general performance ranking.

The Docker image fingerprint was `sha256:bb3ea77cb5a74d3248c85fcf94f00e4832555726d9b5213e687aa523b1deda48`. Source fingerprints were captured before this matrix and verified unchanged when exporting it. Earlier calibration snapshots are preserved separately and are not attributed to that source fingerprint.

## Method

This pilot uses `ollama/gemma4:12b`, OpenCode CLI 1.19.5, Ollama 0.33.2, and the restricted Docker GCC worker. The model digest is `4eb23ef187e2c5462566d6a1d3bbbc2f1346d0b4327cbb66d58fffbcc9b2b05c`. Both entries request reasoning effort `none` through the shared Bifrost relay. No hosted inference provider is used.

The clean matrix runs two graph tasks and three paired repeats per task. Both agents receive the same frozen starter, task specification, model, output-token cap, model-call cap, and agent deadline. Each pair shares a generated grading seed; agent order alternates across repeats. The limits are six admitted model calls, up to 3,500 output tokens per call, and 150 seconds per agent.

Public suite `graph-repair-public-v2` has a smoke check and a separate directed/wide-distance regression. Independent edge cases and a seeded graph remain outside the agent's editing feedback. Final acceptance compares exact bytes with the pinned Speed Demon Python oracle. Adapter revision `graph-repair-adapters-v2` establishes an isolated Git worktree for OpenCode's file permissions, preserves buildable ProofBench edits, and stops CLI retries once its shared model-call budget is exhausted.

Local call-limit rejections carry zero tokens and are shown separately from requests forwarded to Bifrost. A local budget rejection does not invalidate model/provider comparability when all forwarded requests have matching receipts. Upstream errors and unavailable trials still prevent comparability. Unknown cost remains unknown.

## Calibration and diagnostic records

- `742267c1-12e3-4025-8edd-1f350ba3daae`: Qwen 1.7B with provider defaults and the legacy public smoke check. ProofBench passed overflow and failed directed reachability. The trace demonstrated compiler-error recovery, but a smoke pass accepted an irrelevant edit.
- `9ff2aa4d-1281-4637-a9d8-697597809616`: Qwen 1.7B with public suite v2 and provider defaults. ProofBench passed one of two tasks. The directed repair failed public and hidden regressions.
- `71bd922f-0803-41f6-94fb-0e980288b76b`: Qwen 1.7B with requested reasoning effort `none`. Both ProofBench repairs failed. These failures were retained when selecting a different installed model.
- `a171e0ef-a066-4a53-a278-4fba30de042a`: Gemma 12B with requested reasoning effort `none`. Both ProofBench repairs passed all final checks, with one model call per repair.
- `5ed61a2f-687e-43d8-adf5-db9b9554ad25`: Diagnostic matrix stopped after six recorded trials when a real-CLI test confirmed that OpenCode could not read the intended source under its previous permission configuration. This session is explicitly failed and non-comparable; it is not performance evidence.
- `f77870ec-0281-49bb-b62f-e737636205d1`: Paired calibration after the worktree fix. ProofBench passed both tasks. OpenCode read the source but failed both tasks while exhausting its model-call budget. This run predates the corrected accounting for local cap rejections and is not used for the final comparison.

## Interpretation limits

This is a small pilot on two short, known C++ defects. It does not establish a general coding-agent ranking. Model selection followed calibration, and failed calibrations remain part of the record.

The agent interfaces differ: ProofBench receives public regression feedback while editing; OpenCode uses its own file tools and receives host grading after editing. Their system prompts and tool-call accounting also differ. Matching model receipts do not establish identical agent workflows.

The runtime reported a 4,096-token Ollama context; the OpenCode adapter advertises 16,384 tokens to its SDK. Investigate that mismatch and baseline tool behavior before making a broader efficiency claim. Latencies include each adapter's host work and come from one local machine. Source, model, and binary fingerprints are retained in the ignored evidence package.

## Reproduce and inspect

Use the [benchmark setup and methodology](TRACK-D-BENCHMARK.md), a live API built from the current source, and a Bifrost virtual key scoped to the selected local model. Run `npm run benchmark:graph:calibrate` for one pair on each task, then explicitly run `npm run benchmark:graph:matrix` for the three-repeat matrix. A failed calibration exits unsuccessfully; the matrix command preserves correctness failures when deliberately measuring a constrained baseline.

Saved records are under `.local/data/track-d-<id>.json`. The local evidence package is `.local/evidence/graph-repair-2026-11-07/`; it contains source/model/binary fingerprints and schema-validated session snapshots. Raw local records are ignored by Git and must be regenerated on a clean checkout. Virtual keys and provider configuration files are excluded from this package.

## Validation for this patch

The 56 focused contracts, API, adapter, relay, Docker worker, and actual-CLI protocol tests passed. All 14 relay/worker tests also passed with the WSL worker, including compiler recovery and both public regressions. The actual-CLI tests verify file permissions and stopping at the call cap using scripted protocol responses, separately from live-model evidence. Twelve affected browser checks passed on desktop and mobile, including separate gateway/cap counters and missing-session recovery. Lint and the production build, including TypeScript checking, passed. The build retains existing dependency directive and bundle-size warnings. Seven exported session snapshots passed a scan for the two configured virtual keys.
