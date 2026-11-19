# Submission: ProofBench Cascade

**Event:** Geek Room Global AI Hackathon 2026
**Track:** Bifrost (priority): PS01 token-efficient coding agent + PS04 a feature the open-source gateway is missing. Combined with the Tavily verifier (PS06), as the rules allow.
**Repository:** https://github.com/farhanakhtar0x66/proofbench (created 2 Nov 2026; Cascade added on branch `feat/cascade`)
**Team:** Aryan Vishwakarma (lead), Farhan Akhtar, Mohit, Khushi Yadav

## Project description

ProofBench Cascade is an OpenAI-compatible router that sits in front of a Bifrost gateway. Any coding agent can use it by changing one base URL. Every session starts on a small, cheap model. Cascade reads the test output that the agent already sends back, and escalates to a large model only when ProofBench's loop breaker shows the small model is stuck. The large model gets a compact autopsy of the failed attempts instead of the whole failed history. Once a fix is verified, the session drops back to the cheap tier.

The demo is a **live race**: three routing strategies (small only, big only, Cascade) fix the same five real bugs at the same time, through Bifrost, with every patch tested in a sandbox. A recorded live run can be replayed when there is no network.

## Problem being solved

Coding agents send every step to the most expensive model they have, even though most steps are routine. Routing on prompt complexity is a guess made before the work starts. The agent's own tests show when a cheap model is actually stuck, but no gateway uses that signal.

## Results (recorded live, details and evidence in the README)

- **Live race, every recorded run (3):** Cascade fixed 15/15, the same as big-only, for **60% less** and in about half the time (257 s against 524 s). Small-only fixed 13/15. Cascade was cheaper in 2 of the 3 races (98% and 82% less) and cost 26% more in one, where its first escalated call hit the output cap; that run is shown on the page as well.
- **Real OpenCode CLI, unmodified, base URL changed only:** both routes fixed every task in all 12 runs. Cascade cost $0.26 in total against $0.79 for the big model alone (67% less): about 95% less on routine bugs and about 54% less at the median on the task that needs escalation. Cascade was faster on every task.
- Caveats are stated on the page and in the README: these are single runs and small samples, and dollars are projected at list prices because the demo's NVIDIA endpoints are free.

## Technologies and tools

- **Bifrost v2.6** (Maxim AI) as the gateway: a custom OpenAI-compatible NVIDIA provider, a governed virtual key that allows only the two tier models with a $5/day budget, and request logs.
- **NVIDIA NIM:** Laguna XS 2.1 (small tier) and Nemotron 3 Ultra 550B with thinking off (large tier).
- **TypeScript:** Fastify API, React and Vite UI, Vitest (996 unit tests) and Playwright (40 browser tests).
- **Node permission model** as the sandbox: no network, no child processes, and no files outside the task folder.
- **OpenCode CLI** as the real third-party agent in the any-agent evaluation.
- **Tavily** for the freshness verifier (ProofBench's PS06 component).

## How AI is used in the solution

1. **LLMs write the patches.** Two tiers are served through Bifrost.
2. **The routing decides which LLM answers each turn.** It is driven by evidence: test outcomes, repeated-failure signatures and patch digests, through the M2 loop breaker.
3. **The M3a failure autopsy** turns failed LLM attempts into an evidence-only handoff for the stronger model, compacted to a 2,000-token budget. It is used only when it is actually smaller than what it replaces.
4. **The Tavily verifier** uses an LLM to compare claims against live, dated sources, and fails closed.

**AI tools in development:** the team used AI coding assistants, including Claude Code, for implementation, tests and documentation.

## Demo

- **Live:** `npm run dev`, open `/race`, then press **Start live race** (needs Bifrost and an NVIDIA key; see the Quick start).
- **Offline:** press **Replay recorded race**.
- **Pitch:** press **P** for the five-minute presentation mode. It starts the race on its own.
