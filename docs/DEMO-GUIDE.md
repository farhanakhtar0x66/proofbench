# Three-minute offline demo

1. Explain the problem: an AI answer may repeat a price, leader or version that changed.
2. Run `npm run demo:verifier`. The command requires no server, key, model or .env. It checks all three expected outcomes and exits unsuccessfully if behavior regresses.
3. Explain the first case: claim USD 20/month and both simulated sources USD 20/month gives supported/current, score 100.
4. Explain the second: same claim but both sources USD 25/month gives contradicted/stale, score 0. Stale here means contradicted now, not proof it was previously true.
5. Explain the third: one source 20 and another 25 gives inconclusive/unknown, score unavailable. Inconclusive does not mean false.
6. Run `npm run practice` if judges suggest a new English example. Enter the claim and two sample source statements. Clearly state that sources and dates are simulated.

The real backend can retrieve Tavily sources when explicitly enabled, but this presentation does not. Do not call simulated evidence live verification. The UI's mock fixtures are a separate demo and give null scores. Numeric scores are coarse validity indicators, not confidence probabilities. Multiple matching webpages do not establish independence or ownership.

Before presenting, run npm run smoke:api, npm run demo:verifier and npm run check. Keep the recorded fixtures and local CLI as a reliable backup for any separately budgeted live demonstration. See API-TESTING.md for curl/Postman examples. Do not enable live mode merely to practice the talk.

Known limits to mention: constrained English patterns, ambiguous currencies, unsupported region/tier/date comparisons, heuristic source identity, and optional Ollama quality not yet measured. The benchmark's recorded interpreter is a simulation, not evidence of a real-model accuracy gain. Reminder for Mohit: local Ollama hardware/model testing remains pending.
