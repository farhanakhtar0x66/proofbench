# Architecture

A small npm workspace owns React/Vite UI and Fastify orchestration. All boundary payloads use strict, versioned Zod schemas under `packages/contracts`. Web imports only contracts/examples; it never imports NeuroMesh, server-only packages, adapters or credentials.

`apps/web → /api → AgentAdapter → implementations/bifrost-01 OR bifrost-02`

`apps/web → /api/verify → packages/tavily` is independent of the selected Bifrost implementation. `packages/report-engine` converts execution records into evidence reports without asserting verification it has not performed.

`BIFROST_IMPLEMENTATION=mock|01|02` selects different modules, descriptors, capabilities and execution functions. Mock runs a deterministic arithmetic fixture; unintegrated production adapters report execute/benchmarks false and reject runs. Invalid configuration fails startup. Capabilities inform the UI; unsupported API operations return 501. A track is never silently substituted.

`apps/api/src/store.ts` uses validated IDs and atomic temporary-file renames, permissions 0700/0600, and revalidates records on read. Separate run, trace, report and verification JSON files persist across restarts. A run is published last after its evidence; interrupted writes can leave orphan evidence. No external database or microservices. API errors omit internal paths and logs. Inputs are bounded; server binds loopback. Add retention, transactional persistence and deployment access controls before internet exposure.

The optional Rust crate is an original capability probe, not a NeuroMesh integration or sandbox. Live native execution is false. Future JSON/NDJSON interoperability must map provider events into v1 traces and preserve unknown usage. Existing NeuroMesh code is local reference only. Real execution must use isolated task workspaces, explicit command policies, time/output budgets, cancellation and reproducible checks before being enabled.

UI: charcoal background, restrained mint, system fonts, keyboard focus, mobile layout, run table, trace, acceptance evidence, version/seed metadata and source links. Connected mode exposes backend failures; explicit frontend fixture mode supports independent UI work. Main history is bootstrapped once; future work uses PRs.
