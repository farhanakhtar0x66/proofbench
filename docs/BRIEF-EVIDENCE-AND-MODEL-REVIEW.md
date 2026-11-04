# Brief evidence and model suitability

The backend now adds optional `comparison.evidenceBrief` entries for decisive model-assisted assessments. Each entry contains `sourceId`, `url` and an exact `quote` of at most 360 characters. Up to two eligible source groups are represented. Schema validation binds each preview to a matching full citation. Inconclusive assessments do not get a preview that could imply a factual verdict.

Previews are for display, not a replacement for full evidence. A complete matching sentence can be selected only when other source text does not contain potentially omitted qualifications or dates. Otherwise the complete short quote is used, or the preview is omitted. This lexical guard is conservative, not a proof that a shortened sentence entails the claim. Full citations, model input and evidence gates remain unchanged. No extra inference requests are made. This change does not establish a latency reduction.

Failure messages now start with “Could not verify,” including timeouts, service unavailability, rate limits and invalid responses. Frontend owners should show `verificationStatus`, `shortReason` and a brief source quote/link prominently, with full citations and explanations available separately. The existing UI does not yet render the new preview or short-message fields. No UI files were changed.

## Model review — November 4, 2026

The selected `gemini/gemini-3.5-flash-lite` is a plausible fit, not a measured winner. Google describes it as optimized for low-latency extraction/document parsing and structured tasks. Its documented default thinking level is already minimal. Our adapter does not request a higher thinking level, so lowering thinking cannot be assumed to fix the observed timeouts. The actual upstream configuration and network/provider latency still need a controlled comparison.

`groq/openai/gpt-oss-20b` is an alternative candidate because Groq documents strict JSON-schema support. That establishes format capability, not reasoning accuracy, account access, free quota or latency on this machine. A configuration bug that rejected or truncated namespaced model IDs was fixed and tested offline. No provider/model/key was switched, no hosted fallback was added, and Groq inference remains unverified.

Before calling any provider “best,” compare schema-validity rate, timeout rate, false decisive verdicts, abstentions and end-to-end latency on identical saved evidence, then fresh retrieval. Use a separately authorized small request budget, confirmed free-tier/no-billing accounts, explicit provider selection and no retries. Official specifications alone do not substitute for those measurements. Current manual website reliability remains unconfirmed.

References: [Gemini model information](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite), [thinking defaults](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite), [Groq structured outputs](https://console.groq.com/docs/structured-outputs).
