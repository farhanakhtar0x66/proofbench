# Backend verification and diagnostics

The backend keeps the factual outcome (`supported`, `contradicted`, `inconclusive`) and adds optional fields to each comparison:

```json
{
  "outcome": "inconclusive",
  "verificationStatus": "failed",
  "reasonCode": "model_unavailable",
  "shortReason": "Model service is unavailable. Check Bifrost and provider setup."
}
```

`verificationStatus` is `completed` when the model returned validated assessments, `blocked` when the comparison was prevented by evidence/configuration/budget checks, and `failed` for model connection, rate-limit, timeout or validation failures. A completed assessment can still be inconclusive. `explanation` retains the detailed reason. Old saved reports without these fields remain readable. No UI files were changed; the frontend owner can display these API fields.

Source gate reasons are now computed from the actual eligibility checks, rather than treating every exclusion as missing evidence:

| `reasonCode` | Example `shortReason` |
| --- | --- |
| `source_dates_uncertain` | No sources pass publication or fact-date checks. |
| `source_context_incomplete` | Source text is incomplete or not usable. |
| `source_scope_mismatch` | Sources do not match the claim’s entity, version or scope. |
| `duplicate_sources` | Repeated sources do not provide independent corroboration. |
| `insufficient_sources` | Only one independent source group qualifies; two are required. |
| `insufficient_evidence` | Only one independent source group provides matching evidence; two are required. |

The source gate reports `blocked`; the last example follows a validated model assessment and reports `completed`. Mixed exclusion causes retain a general explanation and individual citation warnings. “Independent source group” refers to the existing conservative hostname/duplicate grouping, not proof of editorial independence. These diagnostics do not change verdicts, eligibility rules or request limits. Frontend integration requires the updated shared API schema; displaying the short fields remains the frontend owner's task.

Before a live search, the Bifrost adapter checks the local gateway health endpoint. An unavailable gateway blocks fresh Tavily retrieval and returns a connection reason. This health request makes no provider inference call and does not prove that provider authentication or quota will succeed. There are no automatic inference retries or provider switches.

## Start the services

Keep credentials in the ignored `.env`. Confirm provider billing is disabled. Use the existing account-verified model and prepared gateway configuration. The following commands use a 30-second model deadline and the existing gateway configuration with a 29-second upstream deadline.

In terminal 1:

```sh
env BIFROST_FREE_TIER_CONFIRMED=true BIFROST_LLM_MAX_REQUESTS=5 BIFROST_LLM_TIMEOUT_MS=30000 npm run bifrost:start
```

Wait until Bifrost reports it has started, then keep that terminal running. In terminal 2, confirm local gateway health without inference:

```sh
env BIFROST_FREE_TIER_CONFIRMED=true BIFROST_LLM_MAX_REQUESTS=5 BIFROST_LLM_TIMEOUT_MS=30000 npm run bifrost:check
```

Then start the app:

```sh
env LANGUAGE_MODE=bifrost CLAIM_EXTRACTION_MODE=rules EVIDENCE_COMPARISON_MODE=llm BIFROST_FREE_TIER_CONFIRMED=true BIFROST_LLM_MAX_REQUESTS=5 BIFROST_LLM_TIMEOUT_MS=30000 TAVILY_MODE=live ALLOW_LIVE_REQUESTS=true TAVILY_MAX_REQUESTS=5 npm run dev
```

Open the Vite project URL, rather than Bifrost's management URL. The five-request limits apply to the API process lifetime; restarting resets them. `ALLOW_LIVE_REQUESTS` is the existing application's live-request consent gate and does not alter provider billing. A source search can consume Tavily credits and model comparison can consume Gemini quota. Shut down the services when finished.

## Observed checks

On November 4, a saved real-source SpaceX comparison returned a validated `supported` result through Bifrost/Gemini. A fresh `/api/analysis` submission for Google's parent company returned HTTP 201 and a validated model assessment, but remained inconclusive because only one source was assessed as supporting the claim. That run used one Tavily search and two model requests in total. These observations establish functioning retrieval and model transport, not broad factual accuracy or decisive coverage for arbitrary claims. The local reports are ignored artifacts.

A separately approved fresh SpaceX submission then returned HTTP 201 with `reasonCode: insufficient_sources` and `verificationStatus: blocked`. It used one additional Tavily search and zero additional model requests: only one source passed the date/corroboration checks. Two other results contained an old census date, and the conservative date policy excluded them. This remains a coverage limitation; the backend changes do not establish that the project is ready to produce decisive verdicts for arbitrary showcase statements. The complete check used two searches and two model requests; the final unused inference slot was not spent.
