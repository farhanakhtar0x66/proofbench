# Track D agent benchmark

Open **Track D** in the Execution Lab. The offline mode grades a known repair and an unchanged starter. Live mode compares the fixed-model ProofBench adapter with OpenCode CLI. Each trial gets the same frozen starter and task instructions. The hidden seed is shared within each pair and recorded after grading.

## Local prerequisites

- Node.js, Python 3, Git and either a local Docker daemon or WSL Ubuntu with bubblewrap and GCC.
- For Docker, pull `gcc:15` before starting. `TRACK_D_GRADER_IMAGE` can point to a pinned image already installed locally. Sessions record the resolved image ID.
- For Windows WSL, start the API with `TRACK_D_WORKER=wsl`. The worker records the compiler version. Set `TRACK_D_PYTHON` if Python is installed under a different executable name.

Open the dashboard with `npm run dev`, choose **Offline fixtures**, and start a benchmark. The grader compares exact file bytes with the organizers’ Python reference at commit `3e4004f74de60ffd0670115ab653aa4d4cd3647d`. The vendored reference retains its MIT notice. The grader checks its SHA-256 before admitting a session. The C++ worker receives the submitted source and test inputs through a read-only mount. The expected outputs stay with the host.

## Live paired run

Use an OpenCode executable that supports `run --format json` and custom OpenAI-compatible providers. Configure Bifrost on loopback with a virtual key restricted to the pinned provider and model. Configure any dollar or input-token limits on that key before enabling a hosted provider. The ProofBench relay enforces a per-trial call cap, per-call output cap and agent deadline. Gateway responses that attest a fallback or a different provider or model fail the comparison check.

Set `TRACK_D_LIVE=true`, `TRACK_D_BIFROST_MODEL`, `BIFROST_VIRTUAL_KEY`, `BIFROST_GATEWAY_URL` and `TRACK_D_OPENCODE` in the API process environment. Use the full provider/model name, such as `ollama/gemma4:12b`. Use an absolute path to the OpenCode executable. The relay keeps the Bifrost key out of the OpenCode process and the exported evidence. Unknown token and cost values remain blank in the dashboard. The OpenCode tool permissions allow edits to the benchmark source and deny shell, network tools and access to external directories.

Model outage injects one HTTP 503 at the shared relay before contacting Bifrost. Grader interruption tests one retry by the harness. Misleading input adds the same unverified comment to both prompts. Fixture results verify the grader and should be kept separate from live agent performance. The fixed-model Track D adapter uses ProofBench’s approval and stagnation controls. The existing Rust adaptive engine remains a separate execution path.

## Team Lex baseline

Run `node --env-file-if-exists=.env --import tsx scripts/track-d-baseline.ts <Team Lex checkout>` with the same worker configuration. The script reads the solver directly from Team Lex commit `45884261ae64e2c6184b534212cb466d730db336`, so local checkout edits do not affect the result. It reports exact-output checks and source provenance. Contest build flags, large-scale performance and memory measurements are separate work.

[Track D specification](https://github.com/hackathon-raptors/speed-demon-2026/blob/3e4004f74de60ffd0670115ab653aa4d4cd3647d/specs/d-traverse.md) · [Pinned Python reference](https://github.com/hackathon-raptors/speed-demon-2026/blob/3e4004f74de60ffd0670115ab653aa4d4cd3647d/reference/d_traverse.py) · [OpenCode provider configuration](https://opencode.ai/docs/providers/)
