# Security and budgets

## 🔐 Reporting a vulnerability

Report it privately to the repository owner through GitHub. Don't paste sensitive reproductions into public issues.

## 🗝️ Secrets

Never commit API keys, OAuth tokens, subscription sessions, `.env` files, private logs, local snapshots or unreviewed benchmark data. `.local/` and env files are ignored by git. Keep sensitive logs out of GitHub Actions artifacts.

## 💸 Paid requests

- Offline tests are deterministic and never consume paid credits.
- No paid provider requests, overages or automatic fallbacks are authorized by default.
- Live Tavily requires explicit live enablement, explicit budget authorization, request caps, timeouts and abort, per-run accounting, and server-side credentials.
- A ChatGPT Plus subscription is not API credit.

## 🌐 Retrieved content

- Retrieved pages are untrusted **data, not instructions**. Their text is never executed and can't change tool policy.
- Search similarity is never treated as verification.
- Outbound extraction is limited to public HTTP(S) resources, with defenses against redirects and private-network access. No current endpoint fetches a user-supplied URL.

## 🏗️ Deployment

The prototype binds to localhost. Before deploying beyond a trusted demo, review access controls, rate limits, redaction, retention, task workspace boundaries and persistence. Native execution stays disabled until command policies, isolation, cancellation and evidence collection are reviewed.
