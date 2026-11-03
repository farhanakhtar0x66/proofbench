# Local API testing

Run commands from the repository root. The quick path installs nothing, opens no server ports, loads no .env, forces mock retrieval/rules interpretation, and removes temporary reports:

```sh
npm run smoke:api
```

To use curl or Postman, start a local API in a separate terminal with explicit safe process settings (these override .env without editing it):

```sh
LANGUAGE_MODE=rules TAVILY_MODE=mock ALLOW_PAID_REQUESTS=false TAVILY_MAX_REQUESTS=0 npm run dev:api
```

These examples assume the default port 3001. Stop the server with Ctrl+C after testing.

```sh
curl -i http://127.0.0.1:3001/api/health
curl -i http://127.0.0.1:3001/api/capabilities
curl -i -X POST http://127.0.0.1:3001/api/verify -H 'Content-Type: application/json' -d '{"version":"1","text":"Python 2 is currently supported."}'
```

Expected: health 200; verification 201 with mode mock, contradicted/stale and freshnessScore null. This is a saved reference annotation, not live evidence. Copy the returned report id and use GET /api/verify/YOUR_REPORT_ID to retrieve it. These manual server results persist under ignored local data storage.

Explicit claims are also accepted:

```sh
curl -i -X POST http://127.0.0.1:3001/api/verify -H 'Content-Type: application/json' -d '{"version":"1","text":"A supplied answer","claims":[{"text":"Python 2 is currently supported."}]}'
curl -i -X POST http://127.0.0.1:3001/api/verify -H 'Content-Type: application/json' -d '{"version":"1","text":""}'
curl -i -X POST http://127.0.0.1:3001/api/verify -H 'Content-Type: application/json' -d '{invalid'
curl -i http://127.0.0.1:3001/api/verify/missing-demo-report
```

Expected: explicit-claim request 201; empty input and malformed JSON 400 with a useful message; missing report 404. For Postman use the same method/URL, raw JSON body and Content-Type application/json.

| Situation | Response behavior |
| --- | --- |
| Invalid payload/version or malformed JSON | 400, versioned invalid_request with safe message; schema issues include details |
| Body over 128 KiB | 413 with size guidance |
| Disabled spending, missing key or invalid live cap | 400 with configuration guidance; no search |
| Tavily authentication/account/rate failure | Claim stays inconclusive, score null, explanation identifies failure; attempt counts toward cap |
| Timeout/network/service/malformed source response | Claim stays inconclusive with safe reason; no automatic retry |
| Shared budget exhausted | Inconclusive for new queries; cached queries may still work; no new search |
| Saved report missing | 404, not_found |
| Internal processing or persistence failure | Sanitized 500; do not repeat live calls blindly |

Retrieval failures stay inside the existing successful VerificationReport envelope (201) when a report is produced. A 201 is not a promise that every claim was verified. Inspect outcome, score, uncertainty and evidence. No upstream response body, credentials or stack traces are exposed. No error code or successful API schema is changed by these message improvements.

For arbitrary sample claims plus evidence, run npm run practice. For all three offline verdicts, run npm run demo:verifier. Neither command checks web truth or uses models. Live testing requires separately approved spending; it is not part of this guide.
