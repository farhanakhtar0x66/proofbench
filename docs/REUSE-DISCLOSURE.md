# Reuse disclosure

All committed ProofBench scaffold code was newly authored during this setup, except the third-party benchmark material listed under [Track D Graph Repair](#track-d-graph-repair-third-party-material). **One NeuroMesh file is adapted, listed in the table below** (the API price table behind the Graph Repair cost projection); no other NeuroMesh source is incorporated, linked or pushed. Existing public npm dependencies are recorded in package-lock.json; do not imply they are team inventions.

A private ignored reference snapshot uses the committed general NeuroMesh revision `b090e65df319669e5bac716ffdd1d21ff1975d92`, branch `phase-2/macos-adaptive-routing`. It is not the separate research checkout. Details and file manifest: `.local/neuromesh-reference/SNAPSHOT.json` (local only). Dirty working-tree modifications were excluded. See NEUROMESH-ADAPTATION.md.

Before copying any NeuroMesh source: verify owner/third-party licensing and hackathon reuse eligibility; list each reused file, original revision, copyright/license, purpose and modifications here in the same PR. Separate pre-existing runtime capabilities from newly built contracts, evaluation, verification and UI. A source tree without an explicit redistribution license must not be assumed freely reusable. Existing THIRD_PARTY_NOTICES also needs review. Until rules and provenance are clear, reference only; reusing designs is not evidence of completed runtime integration.

| Original file / revision | Incorporated file | License / approval | Pre-existing behavior | Hackathon changes |
| --- | --- | --- | --- | --- |
| NeuroMesh `src/usage/prices.ts`, branch `main` @ `aa0a40922e61cc67d0f720e0eeac28463939ab56` (features F16 dollar-budget, F17 live-cost) | `apps/web/src/pricing.ts` | PolyForm Shield 1.0.0, © Farhan Akhtar (NeuroMesh author and ProofBench team member). Hackathon reuse eligibility: confirm with the organisers before submission. | Estimates the API list-price cost of recorded token usage (input and output per model, USD per million tokens, prices as of 2026-11-11). | Reduced to five models and input/output only (cache and long-context tiers removed, since the recorded runs report neither); added `formatUsd`. Used only for the UI estimate in `CostProjection.tsx`. Design ideas, not code, also taken from NeuroMesh `main`: the cheap-first worker ladder and animated team graph (F40) inspired `EscalationLadder.tsx`. The dark theme's main colours (`apps/web/src/theme.css`) are values from NeuroMesh's `neuromesh-dark` palette (`src/tui/theme.ts`, F48), not code. The `neuromesh-research` branch was not used. |

## Track D Graph Repair third-party material

The Graph Repair benchmark (PR #30, Aryan Vishwakarma) is based on Speed Demon 2026 Track D by Hackathon Raptors CIC. It is not a ProofBench invention.

| Original file / revision | Incorporated file | License | Use | Hackathon changes |
| --- | --- | --- | --- | --- |
| `hackathon-raptors/speed-demon-2026@3e4004f74de60ffd0670115ab653aa4d4cd3647d`, `reference/d_traverse.py` | `fixtures/track-d/oracle/d_traverse.py` | MIT, © 2026 Hackathon Raptors CIC, notice kept in `fixtures/track-d/oracle/LICENSE` | Independent reference oracle for exact-output grading. It runs on the host, outside the solver sandbox. | None. Byte-identical to upstream after line-ending normalization. `grader.ts` refuses to grade if the SHA-256 differs. |
| Same revision, `LICENSE` | `fixtures/track-d/oracle/LICENSE` | MIT | License notice | None (byte-identical). |
| Speed Demon Track D task contract (graph/query file formats, `SD_DATA`/`SD_OUT` interface) | `implementations/bifrost-02/src/track-d/grader.ts` | MIT (same repository) | Task interface | The C++ starter, its two injected defects, public/hidden cases and the seeded generator were written for ProofBench. Upstream contains no C++ starter. |
| Team Lex Speed Demon solver, commit `45884261ae64e2c6184b534212cb466d730db336`, `track-d/d_traverse.cpp` | Not committed | Not verified | `scripts/track-d-baseline.ts` reads it at runtime from a checkout the user supplies, for an optional correctness baseline | None. Do not commit or redistribute it until its license is confirmed. |
