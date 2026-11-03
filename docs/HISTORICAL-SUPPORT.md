# Completed end-of-life events and current support

An older publication can establish a dated historical event without establishing today's support state. This policy admits a narrow class of completed end-of-life reports for **dated event assertions**, rather than simply dropping all date checks for lifecycle text.

Example recognized claim:

```text
Acme SDK 2 reached end of life on 2020-01-01.
```

ISO dates and explicit English month/day/year dates such as `January 1, 2020` are accepted with calendar validation. Matching source text must explicitly state that the same product/version **reached** end of life on a full date and contain an upstream/official/core-project scope signal. Those words are a scope heuristic, not verification of domain ownership or source authority. The publication date must be valid, on or after the reported event, and no later than assessment. A missing publication date does not qualify through this exception.

The historical exception overrides only the old-publication warning, not invalid dates, incompatible effective/update metadata, copied reporting, weak excerpts, omitted context or other scope checks. Conditional/planned/scheduled/future wording, attribution, vendor/third-party support, negation, resumed/restarted/reversed support and conflicting completed-event dates require review. The parser conservatively rejects those markers across the excerpt and can abstain even when a fuller article would clarify them. Other event verbs, partial dates and unrecognized languages remain unsupported. Two eligible source groups and validated model evidence relations are still required; the rules do not independently decide truth.

Current-scope retrieval for a recognized dated event uses its full literal claim plus an official-documentation hint, without a publication-date filter. The original event date remains in the claim. Other query behavior and server request budgets are unchanged. For comparison, original quotes and published/retrieved dates stay visible, and `dateReason` explicitly describes the historical-event exception. A supported historical finding has freshness **unknown**, never an automatic current label or numeric freshness score.

For `Acme SDK 2 is currently supported`, a completed historical end-of-life report alone remains context. If recognized, its scope warning explains that today's support and vendor applicability need separate evidence. The exception does not infer a permanent current state from a past event, assume support was never resumed, or equate upstream support with all vendor support. This intentionally does not turn the earlier inconclusive Python live test into a decisive verdict.

The original saved live snippets remain inadequate under this narrow policy: the forum snippet discusses a historical schedule, the vendor snippet is scoped to a platform and lacks a publication date, and the news snippet describes a future consequence while omitting relevant context. No source warning or original live record is rewritten to manufacture success. Synthetic tests demonstrate that clear completed-event evidence can qualify; this is not measured real-world factual accuracy or a successful live historical verdict.

Validation on November 4, 2026 passed all 483 tests across 36 files using one worker, lint, TypeScript, six fixture regressions, production build and API smoke checks. Nineteen historical-policy cases cover completed events, English/ISO calendar dates, plans, negation, vendor scope, resumed support, product/version matching and escaping, publication timing, missing dates, two-group assessment, unknown freshness and retained context/date warnings. After the final ambiguous-subject guard, the two affected suites (35 tests), lint, types and build passed again. The saved live evidence replay remained inconclusive with zero new model/search calls; its separate record is `.local/live-website-check/historical-policy-review.json`. Saved `.env` was unchanged and no Gemini or Tavily requests were made.
