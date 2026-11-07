# Track D agent benchmark

Open **Benchmarks → Graph Repair**. This pilot uses the Speed Demon Track D graph-repair task. The offline mode grades a known repair and an unchanged starter. Live mode compares the fixed-model ProofBench adapter with OpenCode CLI. Each trial gets the same frozen starter and task instructions. The hidden seed is shared within each pair and recorded after grading.

## Local prerequisites

- Node.js, Python 3, Git and either a local Docker daemon or WSL Ubuntu with bubblewrap and GCC.
- For Docker, pull `gcc:15` before starting. `TRACK_D_GRADER_IMAGE` can point to a pinned image already installed locally. Sessions record the resolved image ID.
- For Windows WSL, start the API with `TRACK_D_WORKER=wsl`. The worker records the compiler version. Set `TRACK_D_PYTHON` if Python is installed under a different executable name.

Open the dashboard with `npm run dev`, choose **Offline fixtures**, and start a benchmark. The grader compares exact file bytes with the organizers’ Python reference at commit `3e4004f74de60ffd0670115ab653aa4d4cd3647d`. The vendored reference retains its MIT notice. The grader checks its SHA-256 before admitting a session. The C++ worker receives the submitted source and test inputs through a read-only mount. The expected outputs stay with the host.

## Live paired run

Use an OpenCode executable that supports `run --format json` and custom OpenAI-compatible providers. Configure Bifrost on loopback with a virtual key restricted to the pinned provider and model. Configure any dollar or input-token limits on that key before enabling a hosted provider. The ProofBench relay enforces a per-trial call cap, per-call output cap and agent deadline. Gateway responses that attest a fallback or a different provider or model fail the comparison check.

Set `TRACK_D_LIVE=true`, `TRACK_D_BIFROST_MODEL`, `BIFROST_VIRTUAL_KEY`, `BIFROST_GATEWAY_URL` and `TRACK_D_OPENCODE` in the API process environment. Use the full provider/model name, such as `ollama/gemma4:12b`. Use an absolute path to the OpenCode executable. The relay keeps the Bifrost key out of the OpenCode process and the exported evidence. Unknown token and cost values remain blank in the dashboard. The OpenCode tool permissions allow edits to the benchmark source and deny shell, network tools and access to external directories.

Optionally set `TRACK_D_REASONING_EFFORT=none` for a provider/model that supports it. When configured, the shared relay pins `reasoning_effort: none` for both agents, including OpenCode requests that propose another value, and records `reasoningEffort` in the session. When unset, provider defaults apply to both entries. The receipt attests the model/provider; the reasoning field records the requested policy, not an independent provider attestation. Ollama documents this control in its [OpenAI-compatible API](https://docs.ollama.com/api/openai-compatibility).

Model outage injects one HTTP 503 at the shared relay before contacting Bifrost. Grader interruption tests one retry by the harness. Misleading input adds the same unverified comment to both prompts. Fixture results verify the grader and should be kept separate from live agent performance. The fixed-model Track D adapter uses ProofBench’s approval and stagnation controls. The existing Rust adaptive engine remains a separate execution path.

### Calibration and clean matrix commands

With a live-configured API running, use `npm run benchmark:graph:calibrate` to run both agents once on each graph task: four trials. This command exits unsuccessfully unless all four repairs pass the independent final grade. It does not use canned model replies or replace the agents with fixtures. Inspect the saved evidence before choosing the model for a comparison. The API must expose the current public-suite and adapter revisions; the runner rejects an older server before submitting any work.

After calibration, `npm run benchmark:graph:matrix` runs both live entries on both tasks with three paired repeats: twelve trials. The API assigns one shared seed per pair and alternates agent order across repeats. The CLI prints each completed trial and the final session ID; correctness failures remain in the evidence. A completed matrix does not imply either entry passed.

`PROOFBENCH_API_URL` selects a loopback HTTP API origin, defaulting to `http://127.0.0.1:3001`. For an isolated API, `GRAPH_REPAIR_EXPORT_DIR` can point to the main workspace data directory so the completed session is copied there and opens in the dashboard. Sessions stay in their original API store during polling, including if the CLI disconnects. These commands reuse the configured model, budgets, worker, and existing virtual key; they do not create credentials or choose a different model automatically.

## Repair feedback and submission policy

The fixed-model ProofBench adapter validates each approved proposal with a public build and regression suite before keeping the edit. A non-compiling proposal is discarded, and the next model request includes compiler diagnostics alongside the unchanged, last buildable source. A buildable edit that fails a public check is kept so the agent can continue repairing it. The explanation attached to the final source comes from its last retained edit.

Compiler output is captured inside the restricted worker, with at most 4 KiB returned to the host. The host removes terminal control sequences and the sandbox path prefix, and includes at most 2,000 diagnostic characters plus a truncation notice in feedback and evidence. Compiler and test feedback are treated as data in the agent prompt. Public-check infrastructure failures stop the repair and record the trial as unavailable with `grader-error`; they do not become failed correctness results.

Public suite `graph-repair-public-v2` includes the original smoke case and a separate regression for a directed path with a distance above 32 bits and an unreachable reverse query. Both agents' task instructions describe this public coverage. New sessions and API readiness responses record `publicSuiteRevision`; absent metadata identifies legacy sessions. The CLI checks the API revision before starting so a stale server does not silently run the old suite. Keep results from different suite revisions separate.

Adapter revision `graph-repair-adapters-v2` initializes OpenCode's temporary workspace as a fresh Git repository, with Git templates disabled and an isolated configuration. OpenCode 1 resolves file permissions against its worktree; a directory without a repository can resolve against a global root and deny the intended `main.cpp` rule. The repository boundary makes the original file-only permission work without permitting additional files. Shell, network tools, and external directories remain denied. `tests/track-d-opencode.test.ts` exercises the real CLI against scripted local protocol responses to verify reading/editing the source and denial of an external test file. Enable it with `TRACK_D_TEST_OPENCODE=true` and an executable `TRACK_D_OPENCODE` path. This is a permission regression test, not live-model evidence.

When the shared call budget is exhausted, the relay returns a local HTTP 429 tagged `relayRejection: model-call-limit`, with zero tokens and cost. It does not contact Bifrost. The OpenCode adapter stops subsequent retries and submits its last source artifact for final grading. The dashboard separates these rejections from forwarded gateway attempts; a correctly recorded local rejection preserves observed token totals and does not itself invalidate the provider/model comparison. An upstream HTTP 429 remains a gateway failure with unknown usage and prevents comparability. The real-CLI protocol test also covers stopping at this limit.

Only the two public cases are supplied during editing. Independent hidden edge cases, generated inputs, and their expected outputs are reserved for the final grade. A public-suite pass is not a full correctness verdict. OpenCode currently receives host compilation and grading after editing, while the fixed adapter receives public feedback during editing; this feedback difference remains part of the methodology. Model, call, output-token, write, and time limits are unchanged. Record fresh sessions when comparing this feedback policy with historical pilots.

The [7 November live pilot report](GRAPH-REPAIR-LIVE-PILOT-2026-11-07.md) records a completed three-repeat matrix, retained calibration failures, source/model fingerprints, and interpretation limits. An [independent local rerun](LOCAL-LIVE-RERUN-2026-11-07.md) with Qwen3.5-9B and a 16,384-token context did not reproduce the OpenCode 0/6 result.

The tests in `tests/track-d-agent.test.ts` cover rejected edits, retry prompts, preservation of intermediate edits, and infrastructure failure classification. Enable `TRACK_D_TEST_GRADER=true` when running `tests/track-d.test.ts` to also test real compiler diagnostics and recovery through the restricted worker. The recovery test scripts model replies; it is not a live-model success claim.

## Team Lex baseline

Run `node --env-file-if-exists=.env --import tsx scripts/track-d-baseline.ts <Team Lex checkout>` with the same worker configuration. The script reads the solver directly from Team Lex commit `45884261ae64e2c6184b534212cb466d730db336`, so local checkout edits do not affect the result. It reports exact-output checks and source provenance. Contest build flags, large-scale performance and memory measurements are separate work.

[Track D specification](https://github.com/hackathon-raptors/speed-demon-2026/blob/3e4004f74de60ffd0670115ab653aa4d4cd3647d/specs/d-traverse.md) · [Pinned Python reference](https://github.com/hackathon-raptors/speed-demon-2026/blob/3e4004f74de60ffd0670115ab653aa4d4cd3647d/reference/d_traverse.py) · [OpenCode provider configuration](https://opencode.ai/docs/providers/)
