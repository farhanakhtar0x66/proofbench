# Mohit's B05 architecture: Bifrost + optional Ollama

Historical local-stack guide. The current direction is [Bifrost with Gemini primary and Groq optional](B05-MODEL-PROVIDERS.md). Ollama/llama.cpp setup is deferred. Current scripts use provider-specific app directories and explicit model selection; follow the current guide rather than the old commands below.

This selects only the B05 verifier implementation direction. The overall hackathon project remains undecided; A04 Contract Guard is still being evaluated. No Bifrost core patch, hosted-provider integration or complex fallback policy is introduced here.

```text
Client → Fastify → deterministic parsing
                    ├─ supported wording → existing rules
                    └─ unsupported wording → optional interpreter
                                              ↓
                                           Bifrost → local Ollama
                    ↓
               Tavily evidence → scope/date/source/conflict checks → verdict
```

The model extracts source-grounded fields only. It does not vote on truth. The existing rules, original citations, date checks, source ranking and request cap remain authoritative. Invalid, truncated, tool-calling, unavailable or timeout responses cause safe abstention/fallback. Inference is still limited to four attempts per verification, deduplicated within it, with no client retry. Rules-only needs neither service. No successful response or API contract field changed.

## Local configuration

Default `.env.example` keeps LANGUAGE_MODE=rules. For the selected hybrid path, set these only in your ignored local .env:

```env
LANGUAGE_MODE=bifrost
BIFROST_LLM_ENDPOINT=http://127.0.0.1:8080
BIFROST_LLM_MODEL=ollama/qwen2.5:3b
BIFROST_LLM_TIMEOUT_MS=8000
BIFROST_LLM_VIRTUAL_KEY=
OLLAMA_ENDPOINT=http://127.0.0.1:11434
TAVILY_MODE=mock
ALLOW_PAID_REQUESTS=false
TAVILY_MAX_REQUESTS=0
```

Keep Tavily mock settings for startup and gateway benchmarks. A real Tavily experiment needs separate explicit approval. The website's mock fixtures do not invoke a model; the gateway benchmark uses injected evidence to test the interpretation path without retrieval credits. The legacy LANGUAGE_MODE=ollama direct adapter remains for compatibility/debugging, but B05's selected model path is through Bifrost. Future hosted providers can implement the same LanguageInterpreter contract deliberately; this adapter currently rejects non-Ollama and cloud model names.

The real check/prepare/benchmark commands load local .env without printing credentials. The offline protocol benchmark does not load .env. No setup command downloads an Ollama model or embeds keys in source. The gateway endpoint is a loopback HTTP origin; redirects and remote origins are refused. This prevents accidental remote routing from the app, but operators must still inspect the actual gateway provider configuration.

## Reproducing the real stack

Prerequisites: Node 22.12+, a separately installed Ollama server and an already installed local model. If the model is missing, stop and choose/install one explicitly after reviewing RAM/disk needs. No automatic model pull is included.

1. Start your existing Ollama service (or `ollama serve`). Confirm the selected model name with `ollama list`.
2. Run `npm run bifrost:prepare`. It seeds `.local/b05-bifrost/config.json` from the committed template, adjusting the local model/URL from environment. An existing different configuration is preserved and produces an error for manual review.
3. Start Bifrost separately. The upstream setup documentation gives a versioned runner, for example:

```sh
npx -y @maximhq/bifrost --transport-version v2.4.0 -app-dir .local/b05-bifrost -host 127.0.0.1 -port 8080
```

This explicit command may download the gateway executable; it never downloads a model. Gateway v2.4.0 has been started successfully with this configuration on Fedora Linux amd64. Model inference compatibility remains to be tested once Ollama is available.

For the current local installation, the official v2.4.0 native binary is already under ignored `.local/bifrost-bin/v2.4.0/`. Its SHA-256 matched the checksum published beside the binary by the official launcher download service. From the repository root, restart it with:

```sh
.local/bifrost-bin/v2.4.0/bifrost-http -app-dir .local/b05-bifrost -host 127.0.0.1 -port 8080
```

Keep that terminal running; use Ctrl+C in that terminal to stop it. This is a foreground process, not a service that automatically starts after reboot. The binary and local configuration are not included in Git; teammates can use the versioned runner above. The direct download was used because the npm registry timed out during setup.

4. Run `npm run bifrost:check`. It checks gateway health and local model presence; this alone is not proof of routed inference.
5. Run `npm run benchmark:bifrost`. It compares rules-only with actual Bifrost→Ollama requests on identical mocked evidence and records `.local/bifrost-benchmark/real.json`. No real Tavily requests are made. Failed preflight writes `blocked.json`, exits unsuccessfully and does not pretend to run a model benchmark.
6. Inspect local Bifrost request logs after inference: provider Ollama, selected model, response status, latency and correlation header. Confirm actual routed attempts rather than assuming gateway health proves the path. The committed template enables metadata logging while disabling prompt/response content logging. It uses file-only configuration (`config_store.enabled=false`), which disables configuration management through the dashboard/API. A successful dashboard page response alone does not establish that its log views work; inspect the runtime log store if needed.
7. Run `npm run dev:api` for the actual API. Rules parse supported wording directly. Unsupported wording can invoke Bifrost only when evidence retrieval is explicitly enabled; mock Tavily stays offline. Stop the processes after testing.

The template has one Ollama provider and one model allowlist, zero provider retries, one worker, no configured fallbacks, and a small queue. It does not configure monetary budgets for hosted services because no hosted provider is enabled. Existing application inference caps and Tavily budgets remain separate. A pre-existing/shared gateway with other routing rules may behave differently; use the dedicated local app directory. Do not expose an unauthenticated dashboard publicly. Bifrost logs are local runtime artifacts, never committed.

## Offline reproducibility and benchmark interpretation

```sh
npm run benchmark:bifrost:offline
npm run check
npm run smoke:api
```

The offline benchmark exercises the real Bifrost adapter with a fake chat-completions transport, recorded model output and mocked evidence. It is a protocol/integration simulation, not actual Bifrost execution or model inference. It writes `.local/bifrost-benchmark/protocol-simulation.json` separately from real results. Both benchmark paths report per-case verdicts, entity-only extraction matches, false decisive verdicts, abstention, latency, interpretation failures/overhead and mocked Tavily call counts. These development cases are not an independent holdout and do not establish general model accuracy. CPU warm-up and fake transport timings must not be compared as real inference performance.

Bifrost v2.4.0 is now installed locally and its health endpoint has returned HTTP 200. Ollama is still unavailable and no model was downloaded. Real-model end-to-end verification and the real paired benchmark remain pending until those prerequisites exist. Rules-only and mocked protocol tests are reproducible now. A successfully started model may still return invalid interpretations or time out; inspect the failure counts and individual rows before claiming any gain.

## Upstream references

- [Bifrost Ollama configuration](https://github.com/maximhq/bifrost/blob/dev/docs/providers/supported-providers/ollama.mdx): explicit Ollama URL and provider setup.
- [Gateway setup](https://github.com/maximhq/bifrost/blob/dev/docs/quickstart/gateway/setting-up.mdx): local app directory, versioned runner and chat-completions endpoint.
- [Provider configuration](https://github.com/maximhq/bifrost/blob/dev/docs/quickstart/gateway/provider-configuration.mdx): retry settings and correlation headers.
- [Configuration schema](https://github.com/maximhq/bifrost/blob/dev/transports/config.schema.json): file-only configuration and logging options.

This is a consumer integration with independently validated responses, not proof that Bifrost preserves every structured-output guarantee. It does not settle the A04 research question.

## Implementation validation (November 3, 2026)

The full project check passed with 240 automated tests, six fixture regressions and a build. The API smoke check and all four desktop/mobile browser tests passed. On the eight development cases, rules matched 7/8 expected verdicts, the fake gateway-protocol interpreter matched 8/8, and simulated interpreter unavailability matched 7/8. All three arms had zero false decisive verdicts and seven mocked retrieval calls. The fake gateway arm rejected two simulated outputs (ambiguous/unsupported cases); the inferenceFailures column includes such validation rejections, not only network outages. This is integration simulation, not a measured model gain.

The initial local preflight found Bifrost unavailable; the real benchmark exited with a blocked report rather than running inference. After installing and starting the SHA-256-verified Bifrost v2.4.0 binary, `/health` returned HTTP 200 with `status: ok` and `db_pings: ok`. The project preflight now reaches the gateway and stops at the missing Ollama/model dependency. No Ollama model was downloaded and no real Tavily calls were made. Finish real-model validation after the hardware check and Ollama/model setup, then capture the gateway logs and real benchmark report together. BIFROST_IMPLEMENTATION still controls the separate agent scaffold; BIFROST_LLM_* settings control B05 interpretation, and do not finalize any A04 decision.
