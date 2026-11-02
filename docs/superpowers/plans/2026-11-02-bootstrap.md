# ProofBench bootstrap implementation plan

Goal: Enable four developers to work independently using stable v1 contracts and offline evidence.
Architecture: npm workspace, React/Vite, Fastify, Zod; isolated Bifrost adapters and reusable verification; local JSON persistence. This implements the owner's detailed November 2 mission directly.
Constraints: private repository; no paid calls; no original NeuroMesh mutation or source publication; only one final Bifrost track; Tavily permanent.

1. Create configuration and behavioral tests for usage ambiguity, unsupported adapters, invalid API input, offline verification, persistence, reports and traces. Observe failure before implementation.
2. Implement packages/contracts (all ten schemas), packages/tavily (conservative offline verifier), packages/agent-adapters and isolated implementations, report-engine and apps/api. Run contract and API tests.
3. Implement responsive accessible apps/web, versioned mock examples, loading/error/empty/partial states, trace comparison and verification form. Run type checks, lint, build and browser smoke checks.
4. Snapshot allowlisted committed NeuroMesh source locally; record path/branch/SHA and exclusions, compare source status before/after.
5. Document integration, reviews, budgets, evaluation; add CI, templates, ownership and reproducible fixtures. Create private remote, labels, milestones and 24 detailed issues; invite verified Aryan.
6. Review source for secrets/provenance; commit and push initial main as explicitly authorized bootstrap. Verify remote privacy, invitations and CI status.

Review focus: missing usage must never become zero; unknown arbitrary claims inconclusive; unsupported implementations 501; persisted schema validation; unavailable API visibly errors. Real Bifrost implementations and live Tavily semantic verification remain future team deliverables.
