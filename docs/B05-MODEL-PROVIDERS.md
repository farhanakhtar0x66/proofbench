# B05 model providers: Gemini primary, Groq optional

TypeScript/Fastify, Tavily retrieval and deterministic verdicts stay in place. The optional language interpreter uses Bifrost, with Gemini as the primary hosted choice and Groq as an explicitly selected alternative. Ollama/llama.cpp setup and hardware benchmarking are deferred. Rules-only stays the default and needs no model key or gateway. This consumer integration does not establish completion of a Bifrost challenge; that contribution remains separate research. A04 Contract Guard and the overall project decision are separate.

## Configuration and cost controls

Keep real credentials only in ignored `.env`. Never use `VITE_` for secrets. Do not copy the example over an existing `.env` containing keys.

```env
LANGUAGE_MODE=rules
BIFROST_LLM_PROVIDER=gemini
BIFROST_LLM_MODEL=
BIFROST_LLM_ENDPOINT=http://127.0.0.1:8080
BIFROST_FREE_TIER_CONFIRMED=false
BIFROST_LLM_MAX_REQUESTS=0
GEMINI_API_KEY=
GROQ_API_KEY=
TAVILY_MODE=mock
ALLOW_PAID_REQUESTS=false
TAVILY_MAX_REQUESTS=0
```

`BIFROST_LLM_PROVIDER` selects `gemini` or `groq`. `BIFROST_LLM_MODEL` must include the same prefix, such as `gemini/<account-verified-model-id>` or `groq/<account-verified-model-id>`. There is deliberately no guessed default model. Local Ollama routes remain compatible but are deferred. Unknown providers and mismatched routes are rejected as configuration errors.

Gemini requests omit `temperature`, `top_p` and `top_k` and use model defaults, avoiding sampling overrides rejected by newer models such as Gemini 3.5 Flash-Lite. Groq and the legacy Ollama gateway path retain `temperature: 0`. JSON-schema requests, Zod validation, exact source-span checks and evidence-based verdict rules remain authoritative regardless of sampling settings. This request-format compatibility is checked offline; actual Gemini routing and schema transformation still require the controlled live check. See [Google's API changes](https://ai.google.dev/gemini-api/docs/generate-content/whats-new-gemini-3.6).

Before enabling hosted requests, verify in the selected provider's dashboard that the project/account is on the Free tier and billing is disabled. Confirm that the exact selected model has free inference quota and supports structured outputs. Set `BIFROST_FREE_TIER_CONFIRMED=true` only after this check. This flag is operator confirmation, not an automated billing audit. An API key or model listing cannot establish billing status. Application caps cannot make a paid account free. Do not enable billing, auto-recharge, paid plans, or paid fallback for this experiment.

`BIFROST_LLM_MAX_REQUESTS=0` blocks hosted inference. A positive value caps attempts across one adapter instance (normally the lifetime of the API process or benchmark). Restarting resets this cap; it is not a persistent account-wide quota. Existing four-attempt verification limits also apply. Gateway provider retries are zero. After a failed response, the adapter pauses further attempts for 60 seconds, with no retry or provider switch. Missing model/key, absent free-tier confirmation, exhausted cap, 429, network failure, truncation or malformed output cause conservative rules fallback. Arbitrary statements still may be inconclusive: language interpretation remains limited to supported pricing/CEO/version structures.

## Account setup and model selection

1. Add the selected provider key to `.env` locally. Do not send it in chat or commit it.
2. Run `npm run bifrost:models`. This lists account-visible candidate model IDs. It makes metadata GET requests directly to the selected provider for setup only, never inference. Gemini pagination is bounded; missing keys and failures stop without retry. No verification logic calls Gemini/Groq directly.
3. Cross-check the returned IDs against current provider pricing, deprecations and the account's quota page. Model visibility alone is not proof of free quota. No model has yet been selected or verified in this user's account because its key is not configured. Do not treat documentation examples as account verification.
4. Set the exact prefixed model route, confirm billing-disabled Free tier, and set a small cap. Use `1` for the initial schema check. Enable `LANGUAGE_MODE=bifrost` when ready to use the interpreter through the API; the explicit check/benchmark commands test the selected gateway regardless of this mode.
5. Run `npm run bifrost:prepare`. It creates `.local/b05-bifrost-gemini/config.json` or `.local/b05-bifrost-groq/config.json`. There is only one provider, one model allowlist, no alternate route, no retries, and metadata logging with content logging disabled. Keys are stored as `env.GEMINI_API_KEY` / `env.GROQ_API_KEY`, never literal values. A different existing config is preserved and must be reviewed manually.
6. Stop the previous local gateway in its owning terminal before reusing port 8080. Run `npm run bifrost:start` in a separate terminal. It loads `.env`, verifies the selected local config matches the generated config, and starts the installed v2.4.0 binary. Keep the terminal running; Ctrl+C stops it. The old Ollama gateway app directory is left untouched.
7. Run `npm run bifrost:check`. This checks configuration readiness and gateway health without inference. It does not prove that the running gateway has loaded the key or can route the selected model.
8. Run `npm run bifrost:schema`. This attempts exactly one synthetic interpretation through Bifrost with an explicit strict JSON schema. The returned envelope and object pass Zod, then source-span and expected-meaning validation. Success writes `.local/bifrost-benchmark/schema-gemini.json` (or Groq). Failure stops without retry. This checks one observed response, not universal schema preservation. Review gateway metadata for routing. Never silently downgrade schema mode when a model rejects it; choose a compatible model deliberately.
9. For a paired development benchmark, set the per-process cap to `10` and run `npm run benchmark:bifrost`. This compares the selected hosted interpreter with rules-only using identical injected evidence, plus an unavailable simulation. No real Tavily calls occur. Results are saved as `.local/bifrost-benchmark/real-gemini.json` or `real-groq.json`. Run each provider separately if comparing both; there is no automatic failover. This new process has its own request cap.

The native binary is an ignored local installation, not shipped in Git. For a fresh machine, upstream documents the runner `npx -y @maximhq/bifrost --transport-version v2.4.0`. Start it with the selected provider's app directory and loopback binding, supplying key environment variables securely. The `bifrost:start` script expects the existing `.local/bifrost-bin/v2.4.0/bifrost-http` installation. Do not run a second gateway on the same port. Do not put keys in command-line arguments.

Switching to Groq means changing the provider, route, key and free-tier confirmation, preparing its config and restarting Bifrost with that directory. Switching back to rules-only is `LANGUAGE_MODE=rules`; restore the cap to zero after experiments. These are backend environment controls, not a new website model-picker UI.

## Validation and limits

Offline: `npm run benchmark:bifrost:offline` exercises fake gateway responses, `npm test` covers both provider routes, schema contract, invalid output, key/config gates, quotas and failure paths. `npm run check` covers lint, TypeScript, tests, fixture evaluation and build. No offline result demonstrates actual model quality or Bifrost transformation correctness.

Offline validation on November 3, 2026: full check passed with 264 tests, six fixture regressions and a build; API smoke checks also passed. The fake gateway benchmark matched 8/8 expected verdicts versus rules-only 7/8, with zero false decisive verdicts in both arms. Its entity metric was 6/8, and four interpretation attempts failed or were suppressed after validation failure triggered cooldown. There were four fake gateway requests and zero real provider/Tavily requests. These are controlled simulation results, not a measured Gemini or Groq improvement.

Real model selection, account billing/quota review, real gateway schema check and paired inference benchmark are pending. Do not report them as passed until performed. Development fixtures have only eight cases, many expected abstentions, and are not an independent accuracy evaluation. Inspect entity extraction, false decisive verdicts, inconclusive rate, failures, latency and case rows together; aggregate verdict agreement alone is insufficient. `inferenceCalls` counts interpretation attempts, including those blocked locally by a cap/cooldown; `gatewayRequests` counts actual HTTP attempts to the gateway (fake transport in offline runs). Gateway/provider logs are needed to establish upstream calls. Reports label partial failures explicitly; failures are not evidence of model improvement. A failed interpretation leaves existing evidence rules in control. No LLM decides factual truth.

## Primary references

- [Bifrost Gemini conversion and configuration](https://github.com/maximhq/bifrost/blob/dev/docs/providers/supported-providers/gemini.mdx): provider key environment references and response-format conversion. The installed gateway version must be verified with a real schema check; development documentation is not proof of its behavior.
- [Gemini model listing](https://ai.google.dev/api/models), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [billing](https://ai.google.dev/gemini-api/docs/billing): model availability, free-tier eligibility and account billing are separate checks.
- [Groq structured outputs](https://console.groq.com/docs/structured-outputs) and [quickstart](https://console.groq.com/docs/quickstart): schema support depends on the selected model; use a Free account with billing disabled.
