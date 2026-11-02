# Contracts v1

Canonical runtime schemas and inferred TypeScript types: `packages/contracts/src/index.ts`. Version is literal string `"1"`; incompatible versions are rejected. Payload examples live under `docs/examples/` and `packages/contracts/src/examples.ts`. `npm run test:contracts` validates examples and ambiguity rules. A breaking change requires a new version plus Farhan/Aryan coordination.

Verification claims add optional `freshnessScore: integer (0–100) | null`. New verifier responses always include it; legacy reports may omit it. Current rules emit 100 for corroborated live supported/current claims, 0 for corroborated live contradicted/stale claims, and null for unassessed claims and offline fixtures. This is a coarse validity indicator, not confidence or a calibrated probability. Recency and agreement gate eligibility; intermediate scores are reserved until calibrated. Coordinate this additive shared-contract change with Farhan/Aryan before merge.

| Schema | Purpose |
| --- | --- |
| TaskSpec | Stable task ID, prompt, acceptance requirements, optional fixture |
| AgentDescriptor | Identity, selected implementation, runtime, revision, model or null |
| RunRequest | Version, task, agent ID, optional seed (runtime defaults to zero) |
| RunRecord | Output, completion, acceptance, usage, report linkage, reproducibility |
| ExecutionTrace | Ordered timestamped events with explicit type and evidence |
| UsageRecord | Input/output tokens, duration, cost as individual observations |
| AcceptanceResult | Passed/failed/unknown with per-check evidence; unknown check is null |
| ClaimVerification | Claim text, temporal sensitivity, outcome, freshness, evidence, uncertainty |
| EvidenceReport | Run linkage, acceptance, usage, optional verification, limitations |

A known or estimated quantity includes source, scope and unit. Estimates additionally require method. Missing/incomparable quantities carry a reason and reject a value field. Missing is never zero. Only compare matching tokenizer/provider/accounting scope and measurement methods; do not rank missing observations. Context, cached, reasoning and billed token scopes need explicit normalization before future comparisons.

| Method | Route | Success | Errors |
| --- | --- | --- | --- |
| GET | /api/health | 200 version/status | 500 |
| GET | /api/capabilities | 200 selected agent/capabilities/limitations | startup rejects invalid config |
| POST | /api/verify | 201 VerificationReport | 400 invalid version/input; 413 too large |
| GET | /api/verify/:id | 200 VerificationReport | 404 missing |
| GET | /api/benchmarks | 200 `{version,tasks}` | 501 unavailable |
| POST | /api/runs | 201 RunRecord | 400 unknown agent; 501 unavailable/task unsupported |
| GET | /api/runs/:id | 200 RunRecord | 404 missing |
| GET | /api/runs/:id/trace | 200 ExecutionTrace | 404 missing |
| GET | /api/reports/:id | 200 EvidenceReport | 404 missing |

Invalid identifiers return 400. Internal storage failures return sanitized 500. Error envelopes contain version and error code. All successful stored responses are parsed against runtime schemas. Runs execute synchronously for the small offline fixture; async scheduling/cancellation belongs in the real adapter integration design.

Verification input: `{ "version":"1", "text":"arbitrary answer", "claims":[{"text":"optional explicit claim","asOf":"2026-11-02T00:00:00.000Z"}] }`. Input is limited to 20,000 characters and 50 explicit claims. Mock preserves explicit claim asOf and abstains (inconclusive) because no temporal retrieval is available. Offline evidence uses retrievedAt: null and a separate annotation recordedAt; timestamps never imply a fetch. Mohit must implement date-aware extraction/evaluation. Empty explicit claim arrays return an empty report.
