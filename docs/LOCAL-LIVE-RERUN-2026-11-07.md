# Local live rerun: Graph Repair and Tavily, 7 November 2026

This is a second, independent live run on a different machine (Apple M5, 16 GB) with a different model. It does **not** replace the [Graph Repair live pilot](GRAPH-REPAIR-LIVE-PILOT-2026-11-07.md). Both results stand, and they disagree on OpenCode. Raw records are under [`docs/evidence/local-rerun-2026-11-07/`](evidence/local-rerun-2026-11-07/). They were scanned for virtual keys, setup tokens, the Tavily key and local paths.

## Stack

| Part | Value |
| --- | --- |
| Model | `gguf/Qwen3.5-9B-GGUF:Q4_K_M` on llama.cpp `b12110`, runtime context **16,384** tokens (verified with `/props`), `reasoning_effort: none` |
| Gateway | Bifrost v2.5.0 on `127.0.0.1:8089`, with a virtual key allowed only for this model. Receipts show provider `ollama`, but **llama.cpp serves the model**: Bifrost's Ollama provider points at llama.cpp's OpenAI-compatible endpoint. |
| Grader | Docker `gcc:15` `sha256:51d7ef77d4e5…` under Colima, `graph-repair-public-v2`, pinned Speed Demon oracle |
| Agents | `graph-repair-adapters-v2`; OpenCode CLI **1.19.5** (the same version as the pilot; 2.x removed `--pure`, which the adapter needs) |

## Graph Repair results

| Session | What it is | ProofBench | OpenCode | Comparable |
| --- | --- | --- | --- | --- |
| `44e2330e…` | Infrastructure failure. The grader's temp directory was outside Colima's shared mounts. | 0/2 unavailable | 0/2 unavailable | no |
| `38ea1c82…` | Calibration | **2/2** | **2/2** | yes |
| `a7ef2092…` | Matrix: 2 tasks × 3 paired repeats | **5/6** | **5/6** | **no** (see below) |

Matrix usage, both entries on the same model, limits, seeds and alternating order:

| | ProofBench | OpenCode |
| --- | --- | --- |
| Forwarded model calls | 7 | 29 |
| Input / output tokens | 3,579 / 668 | 114,122 / 3,027 |
| Largest input per call | 721 | 4,387 |
| Median agent time | 11.6 s | 37.4 s |

Failures:
- **ProofBench, `distance-width` repeat 3:** the first edit built but failed the public wide-sum check. The next model call got **HTTP 502** from the gateway. The llama.cpp log shows a connection read error; the root cause is not established. The adapter stops on any non-503 error, so it submitted the half-fixed source. This upstream error is why the session is `comparable: false`, and it shows the adapter does not retry transient gateway errors.
- **OpenCode, `distance-width` repeat 1:** it submitted an edit that still returned `-1` for distances above 32 bits.

### What this changes

- The pilot's **OpenCode 0/6 did not reproduce** here (5/6). The pilot's numbers should not be presented as ProofBench outperforming OpenCode.
- The context-truncation explanation is **not confirmed**. Here OpenCode's prompts peaked at 4,387 tokens. That is just over the pilot's 4,096-token runtime context, so truncation may have affected some pilot requests, but model, machine and runtime also differ. Treat the cause as unresolved.
- What holds up on this run: with the same model and limits, ProofBench reached the same pass rate with about **32× fewer input tokens and 4× fewer model calls**, and a lower median agent time. It also had in-loop public feedback that OpenCode did not, so this is an efficiency observation on two short tasks, not a capability ranking.

## Tavily results

The user approved a cap of 5 Tavily requests, and all 5 were used. Nothing in this run is mock or fixture evidence.

| File | Mode | Tavily requests | Result |
| --- | --- | --- | --- |
| `tavily-live-1.json` | rules comparison | 0 | General analysis refuses to search without model comparison (fail-closed). |
| `tavily-verify-2.json` | `/api/verify`, rules | 1 | Real sources; **inconclusive** (rules only issue verdicts for price, CEO and latest-version claims). |
| `tavily-live-2.json` | LLM comparison | 1 | Model **timed out** at 30 s: Qwen reasoning was on. The verifier stopped further searches. |
| `tavily-live-3.json` | LLM, reasoning off | 1 | Model reply **failed schema validation**: a flat object instead of `assessments[]`. Correct inconclusive fallback. |
| `tavily-live-4.json` | LLM, reasoning off, strict `json_schema` | 2 | **Python 2 EOL: supported**, citing InfoQ, docassemble and PEP 373. **Node.js 18 still supported:** correct official sources retrieved, but the model **timed out**, so inconclusive. |

A contradicted verdict has not been demonstrated live on this stack yet. The Node.js 18 claim needs either a faster model or a timeout above the verifier's current 30 s ceiling.

### Verifier changes made for local models

Both are opt-in in `packages/tavily/src/bifrost-interpreter.ts`, and the defaults are unchanged:
- `BIFROST_LLM_REASONING_EFFORT=none` sends `reasoning_effort: none`, matching Track D's `TRACK_D_REASONING_EFFORT`.
- `BIFROST_LLM_RESPONSE_FORMAT=json_schema` gives local providers the strict schema already used for Gemini and Groq. Without it, Qwen3.5-9B returned schema-invalid JSON.

## macOS setup notes

- Colima shares only `$HOME` with its VM. Start the API with `TMPDIR` exported under `$HOME`. Setting it in `.env` has no effect, because Node's `--env-file` does not override variables the shell already defines.
- `app.ts` loads `.env`, so a live `.env` leaks into `npm test`. Move it aside before running tests.
- Bifrost 2.5's Ollama provider needs a non-empty key `value` plus `ollama_key_config.url`. Governance virtual keys need `config_store` enabled and `allow_all_keys: true` in the key's provider config.
