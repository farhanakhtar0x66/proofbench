# Local NeuroMesh adaptation review

Verified general checkout: `/Users/farhanakhtar/Projects/neuromesh`, origin `https://github.com/farhanakhtar0x66/neuromesh.git`, branch `phase-2/macos-adaptive-routing`, committed revision `b090e65df319669e5bac716ffdd1d21ff1975d92` (install-terminal documentation commit). Separate `/Users/farhanakhtar/Projects/neuromesh-research` was not used. The general checkout's README documents the existing Rust TUI/runtime and source organization.

Snapshot: `.local/neuromesh-reference/`, allowlisted committed blobs fetched with read-only `git show`, 18 files, SHA-256 manifest in SNAPSHOT.json. It is an isolated partial reference snapshot, not a buildable duplicate of the full app. Excludes every dirty/untracked change, `.git`, auth/credential modules, provider configuration JSON, keys, caches, binaries, databases, histories, logs and research files. Only Rust source, manifests/lock, README and third-party notices are retained. Local credentials and installed state are untouched. Do not publish this snapshot.

| Source module under prototypes/terminal-lab/src | Potential use in either track | Integration cautions |
| --- | --- | --- |
| backend.rs | Provider-neutral Agent, Route, model selection and turn dispatch | Convert runtime-local types to stable contracts; don't expose histories |
| external.rs | CLI invocation, clean environment, bounded pipes, process groups/timeouts | Re-review process-tree lifecycle, trusted executable and workspace policy |
| codex.rs / antigravity.rs | Installed CLI protocol adapters and session IDs | No subscription session copying; login remains developer-local; inspect permissions |
| tools.rs | Workspace/tool boundaries, subprocess control | Safety review before enabling arbitrary tasks; not a security sandbox |
| provider.rs / catalog.rs | Model interfaces, catalog/protocol separation and event updates | Don't copy keys or provider JSON; map actual usage with scope |
| config.rs | Typed configuration | Use portable paths and server environment; no user settings copies |
| store.rs | Journal/event serialization and session recovery | Design independent redacted execution records; never copy session DBs |
| team.rs / artifact.rs | Coordinated execution/checks, artifact/evidence contracts | Separate existing coordination from new benchmark functionality |
| failure.rs | Structured failure provenance | Preserve failure semantics in run status and trace |
| lib.rs / main.rs | Runtime/controller entry points | Prefer a narrow library/NDJSON boundary over TUI coupling |

Rust/TypeScript boundary: optional `crates/neuromesh-bridge` currently reports native execution unavailable. It contains only newly authored code. A future bridge should serialize v1 records through a bounded protocol and explicitly propagate missing tokens, failures, cancellation, model revision and workspace/check evidence. Farhan owns that integration and its licensing/provenance review. No original source is approved for publication by this review.
