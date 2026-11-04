# B05 teammate running guide and deployment checks

This guide describes Mohit's B05 verifier, not the final hackathon project selection. A04 Contract Guard and the separate Bifrost challenge contribution remain separate decisions. Use the existing team checkout/feature branch; no fork, new branch, push or merge is required to run it locally.

## Start the website offline

From the repository root containing `package.json`, use Node 22.12+ and npm:

```sh
node --version
npm ci
```

`npm ci` installs the versions in the lockfile. It needs package-registry access but makes no Gemini/Tavily verification requests. If `.env` does not exist, copy `.env.example` to `.env`. **Do not overwrite an existing `.env`.** Keep these settings for offline work:

```env
BIFROST_IMPLEMENTATION=mock
TAVILY_MODE=mock
ALLOW_PAID_REQUESTS=false
TAVILY_MAX_REQUESTS=0
LANGUAGE_MODE=rules
CLAIM_EXTRACTION_MODE=rules
EVIDENCE_COMPARISON_MODE=rules
BIFROST_FREE_TIER_CONFIRMED=false
BIFROST_LLM_MAX_REQUESTS=0
HOST=127.0.0.1
PORT=3001
DATA_DIR=.local/data
```

Keys are unnecessary for this mode. Existing keys can remain in ignored `.env`; never share that file. Do not prefix secrets with `VITE_`.

```sh
npm run dev
```

This starts the API on `http://127.0.0.1:3001` and website on `http://127.0.0.1:5173`. Keep the terminal open; Ctrl+C stops both. Open the website and choose **Freshness verifier**:

- **General claim analysis:** enter a factual assertion. Offline results should say inconclusive with no live sources. This is expected, not a failed installation. Questions may produce no claims; use statements when testing extraction.
- **Legacy verifier / fixture demo:** enter `Python 2 is currently supported.` to see the canned contradicted result. This result is simulated, not a fresh internet check.

The website calls `POST /api/analysis` for the general flow and retains saved reports under the configured data directory. `GET /api/health` checks API responsiveness; `GET /api/analysis/status` reports configuration and local model allowance, not live gateway health or provider billing status. If ports are occupied, stop your own prior dev process or coordinate different ports; do not kill another teammate's server.

## Check your installation

```sh
npm run smoke:api
npm run demo:verifier
npm run evaluate:general
npm run lint
npm run typecheck
npm test -- --maxWorkers=1
npm run evaluate
npm run build
npm run smoke:deployment
```

The smoke commands verify wiring, the demo shows three simulated verdicts, and evaluation exercises recorded/scripted cases. None establishes accuracy on arbitrary real claims. Tests use fake responses and need no provider keys. `smoke:deployment` starts the compiled API on an automatically selected loopback port with empty provider keys, rules/mock modes and zero caps, without loading `.env`. It checks health, offline analysis and report persistence after restart, then removes its temporary servers/data. Run it again after changing the server bundle. It needs local socket permission but no external service.

Optional browser checks: install Chromium with `npx playwright install chromium` (a download, not a provider request), then run `npm run test:ui -- --workers=1`. If using the ignored local browser installation, set `PLAYWRIGHT_BROWSERS_PATH=.local/playwright` for both install and test. Tests use isolated ports 3011/5181 and explicitly offline API settings.

## Live mode is a separate, bounded experiment

Normal development needs no gateway. For a deliberately enabled live check, follow [provider setup](B05-MODEL-PROVIDERS.md) and [website analysis](WEBSITE-ANALYSIS.md). Gemini and Groq are explicitly selectable server-side; Groq remains untested live. Ollama is deferred and not required.

Before enabling live calls, check the selected provider's actual billing-disabled/free-tier account, exact model eligibility and remaining quota. An environment flag cannot disable provider billing. Tavily pay-as-you-go must remain off. Keep keys only in ignored server configuration. Select the provider/model, prepare and start the matching Bifrost gateway, and assign a small process request cap. Gateway startup can make provider model-catalog metadata requests even before verification.

The general model-backed flow requires `LANGUAGE_MODE=bifrost`, `EVIDENCE_COMPARISON_MODE=llm`, an explicit model route, key, free-tier confirmation and positive model cap. Rules extraction can remain enabled to save requests; optional `CLAIM_EXTRACTION_MODE=llm` adds an extraction attempt. Live evidence additionally needs `TAVILY_MODE=live`, the key, positive search cap and the existing `ALLOW_PAID_REQUESTS=true` consent gate. Despite its name, that gate does not verify pricing or authorize paid usage in this project.

For a single claim, budget up to one Tavily search plus one model comparison; optional model extraction adds another model attempt. Some inputs abstain before calls. A general analysis handles at most three distinct claims and four model attempts. Search caching may avoid a repeated search for five minutes; repeated verification can still make a new model request. Caps cover attempts within one API/adapter instance, reset on restart and multiply across processes. Separate check commands have separate counters. Never use a restart as a way around an agreed test budget. No automatic paid or alternate-provider fallback exists.

After an experiment, stop the temporary gateway/API and restore rules/mock modes and zero caps before starting normal development. A browser selection does not enable live mode. Do not retry a timed-out submission blindly: the server may still finish it.

## What deployment currently requires

```sh
npm run build
npm start
```

`build` creates `dist/api/server.js` and `dist/web/`. `start` loads local `.env` if present and runs **only the API**, defaulting to loopback port 3001. Unlike the deployment smoke command, `npm start` uses your real configured modes; review them first. The bundle keeps npm dependencies external, so the runtime also needs installed production dependencies and Node 22.12+. Copying just `dist/` is insufficient. A fresh deployment can install with `npm ci --omit=dev` after building in a full-dependency environment.

For a team-reviewed hosted deployment:

- Serve `dist/web/` through a static host/reverse proxy with SPA fallback to `index.html`; proxy `/api` to Fastify on the same origin. Vite's development proxy is not part of the production bundle. There is no API static-file handler or configured cross-origin API flow.
- Keep the API and gateway behind the proxy/access controls. Default loopback binding is suitable for local use; containers need an explicitly reviewed binding/network configuration. The prototype has no user authentication, per-user quotas or report ownership isolation. Anyone who can reach it can submit work or read a known report ID. Do not expose a live spending-enabled instance publicly as-is.
- Supply server secrets through the host's secret environment. Do not ship a developer `.env`, gateway logs, `.local/` data or keys in frontend files. Bifrost's native binary and generated config are ignored local artifacts; they must be installed/prepared separately using the provider guide if live mode is selected.
- Persist `DATA_DIR` on writable private storage if reports must survive replacement of the server/container. Reports contain submitted text and evidence. Local JSON files are prototype storage; multi-user retention, backups and a production database are not implemented.
- Keep one explicitly budgeted API instance for a limited demo. Autoscaling and restarts reset/multiply in-memory search/model counters and clear search cache. Persistent shared quotas, request authentication and per-user limits are not implemented.
- Align reverse-proxy timeouts with the website's 180-second analysis wait. The backend processes claims sequentially; there is no streaming progress or end-to-end cancellation guarantee. Do not configure automatic proxy retries for verification POSTs.
- Check `/api/health`, `/api/analysis/status`, an offline submission and saved-report lookup after routing changes. Health/status do not prove live inference works. A future live check needs its own bounded request plan and review of actual evidence.

These are implementation/deployment checks, not a hosted deployment or a claim of production readiness. No hosting configuration or credentials are changed by this guide.

## Current validation and teammate message

On November 4, 2026, lint, TypeScript (as part of build), production build, existing offline API smoke and the new compiled deployment smoke all passed. The latter confirmed loopback startup, offline status/analysis, API-only serving and report persistence across restart. Temporary servers/data were removed. This documentation/startup change did not rerun the full unit or browser suites. No Gemini/Tavily requests were made and the developer's `.env` was unchanged. No hosted deployment was performed.

The [historical correction recheck](CORRECTION-RESTATEMENTS.md) passed with a real Gemini call on fixed synthetic evidence. The [real-source demo attempt](LIVE-DEMO-VALIDATION.md) did not produce a validated supported/contradicted pair: weak or incomplete retrieved excerpts kept the tested leadership claims inconclusive. Do not present that attempt as a successful three-verdict live demo. General supported current results now have an [evidence-recency score](EVIDENCE-FRESHNESS.md); other results remain unscored. Comparison-result caching is still pending.

Suggested message to the team:

> B05's website and API are connected. Start with the offline instructions in `docs/TEAM-RUNNING-GUIDE.md`; no keys or LLM are needed. General offline claims return inconclusive, while the legacy/CLI fixtures demonstrate simulated verdicts. Optional Bifrost → Gemini and Tavily calls are integrated, but the latest real-source demo still abstained because source coverage/context was insufficient. Please test offline behavior and review source quality; don't enable live calls or claim arbitrary-statement accuracy from the fixtures. The built API needs separate website hosting/proxying, and public live deployment still needs access and persistent quota controls.
