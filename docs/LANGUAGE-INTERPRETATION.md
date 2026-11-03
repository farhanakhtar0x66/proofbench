# Optional language interpretation

Architecture update: B05's selected hybrid path is LANGUAGE_MODE=bifrost, routing the optional interpreter through Bifrost to Gemini (primary) or explicitly selected Groq. LANGUAGE_MODE=rules remains default. Ollama/llama.cpp setup is deferred; direct Ollama mode below is legacy compatibility only. Follow [B05 provider setup](B05-MODEL-PROVIDERS.md) for cost controls, model selection, schema checks and benchmarks. This decision applies only to Mohit's B05 implementation and does not finalize the team project, A04 Contract Guard, or the separately researched Bifrost challenge contribution.

B05 is a modular research direction, not an assertion of the team's final submission choice. Rules, retrieval, ranking, scoring and API contracts are retained. Unknown wording currently fails strict comparison templates; that is different from missing, stale or conflicting evidence.

The new provider-independent LanguageInterpreter accepts text and returns untrusted structured fields. The Ollama implementation uses local POST /api/chat with JSON mode, bounded tokens/context, no tools, no redirects and Zod validation. See [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md). Nothing is installed or downloaded automatically.

Default LANGUAGE_MODE=rules performs no inference. Optional server settings:

```env
LANGUAGE_MODE=ollama
OLLAMA_ENDPOINT=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
OLLAMA_TIMEOUT_MS=8000
```

Use an existing locally installed Ollama model. A small quantized 1–3B instruction model is a reasonable experimental starting point; plan roughly 4–8 GB available RAM for model plus context/runtime, with more total RAM for the desktop. These are planning estimates, not measured minimum requirements. Smaller models may extract qualifiers poorly; CPU inference can exceed the timeout. Review local model license and hardware requirements before manually installing. Cloud model names and non-loopback endpoints are rejected by this initial adapter; future providers implement the interface separately.

Run `npm run dev:api` for either configuration after setting the local environment. Tavily mode and all existing spending controls are separate: LANGUAGE_MODE alone never enables retrieval. Mock Tavily mode stays fixture-only. No .env changes are made by this work. The existing practice command remains rules-only and offline.

Supported interpretations remain deliberately limited: English price paraphrases with explicit ISO currency and billing period (including number words zero through ninety-nine), CEO wording and latest-version claims. Every extracted string must occur in the input. Residual content must match a conservative vocabulary, so omitted region/date/tier qualifiers cause abstention rather than disappearing. Bare dollars/bucks do not imply USD. Explicit region, historical dates, special tiers, conditionals, multi-sentence passages, injection markers and unsupported units remain outside the hybrid normalization envelope. This is constrained assistance, not general language understanding.

Rules run first. Only unsupported text is offered to the adapter, with at most four calls per verification, cached/deduplicated within that verification. Errors open a circuit for the rest of the request. Timeouts and malformed outputs fall back to original text. No inference retries occur. Custom adapters must honor cancellation/resource limits themselves; the engine also stops waiting after ten seconds but cannot forcibly stop arbitrary provider code.

The engine builds canonical statements only after schema, exact-span and qualifier checks. Recent source statements may use the same adapter, but source URLs, timestamps and original excerpts are preserved. Copy checks use original text. The existing two-source, scope, date, conflict and budget rules determine outcomes, never an LLM verdict. Model attempts are disclosed in uncertainty text. Model extraction remains fallible; span checks are not proof of semantic equivalence. Ambiguous spans and entity association still require independent evaluation.

Benchmarks:

```sh
npm run benchmark:language
npm run benchmark:language -- --ollama
```

The default compares rules, a recorded fake interpreter and simulated unavailability using identical mocked evidence. It writes ignored .local/language-benchmark/report.json. The second command uses the configured local Ollama model, still with zero real Tavily requests; the model must already be installed/running. Reports include verdict correctness, false decisive verdicts, abstention rate, entity extraction correctness, latency, inference overhead and mocked search counts. Entity extraction correctness is a narrow proxy, not full claim extraction accuracy. Cases are development fixtures, not an independent holdout. Ask Khushi to supply a frozen unseen set before making accuracy or improvement claims. The recorded simulation validates wiring and failure behavior, not model quality or performance.

No real Ollama benchmark or model download is part of default validation. Real model accuracy and hardware latency remain unmeasured unless the optional command is run with a working local model. Existing API schemas and response fields are unchanged. The deterministic parser supports explicit region/billing pricing patterns and component/channel version patterns; this optional interpreter still abstains when it cannot preserve those qualifiers. Broader qualifier-aware paraphrase interpretation remains future work.

Recorded development run, November 3, 2026 (eight paired cases):

| Arm | Expected verdict matches | Entity-only extraction matches | False decisive verdicts | Inconclusive | Mocked Tavily calls |
| --- | --- | --- | --- | --- | --- |
| Rules | 7/8 | 3/8 | 0 | 7/8 | 7 |
| Recorded interpreter simulation | 8/8 | 8/8 | 0 | 6/8 | 7 |
| Unavailable interpreter simulation | 7/8 | 3/8 | 0 | 7/8 | 7 |

The recording is designed for these development examples; its higher match count demonstrates the integration path, not a learned model improvement. Local warm-up and simulated calls make latency comparisons unsuitable for performance claims. Per-case latency and inference timings are in the ignored report. All 158 automated tests, six fixture regressions, lint, typecheck and build passed during this run.
