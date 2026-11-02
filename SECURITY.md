# Security and budgets

Never commit API keys, OAuth tokens, subscription sessions, .env, private logs, local snapshots or unreviewed benchmark data. `.local/` and env files are ignored. Report vulnerabilities privately to the repository owner through GitHub; do not paste sensitive reproductions in public issues.

Offline tests are deterministic and do not consume paid credits. No paid provider requests, overages or automatic fallbacks are authorized. Live Tavily is deliberately unavailable. Mohit's later integration must require explicit live enablement, explicit budget authorization, request caps, timeout/abort, per-run accounting and server-side credentials. A ChatGPT Plus subscription is not API credit.

Retrieved pages are untrusted data, not instructions. Don't execute their content or let page text change tool policies. Do not equate search similarity with verification. Restrict outbound extraction URLs to public HTTP(S) resources and defend against redirects/private network access before adding retrieval. No current API endpoint fetches a user URL.

Prototype binds localhost. Before deploying beyond a trusted demo, review access controls, rate limits, redaction, retention, task workspace boundaries and persistence. Native execution is disabled until Farhan reviews command policies, isolation, cancellation and evidence collection. Keep sensitive logs out of GitHub artifacts.
