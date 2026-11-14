# Five-minute demo walkthrough

This replaces the older checklist in `FINAL_PRODUCT_ACCEPTANCE_HANDOFF.md`. It uses Aryan's current UI and Mohit's verifier, and every number comes from a saved live record. **No live model, Tavily request or Docker run is needed during the demo.**

## Before the demo (10 minutes, once)

```bash
git pull origin main
npm ci
mkdir -p .local/data
cp docs/evidence/local-rerun-2026-11-07/graph-repair-94313e39-41f0-497e-b215-f2f43a7196a3.json .local/data/track-d-94313e39-41f0-497e-b215-f2f43a7196a3.json
cp docs/evidence/local-rerun-2026-11-07/tavily-live-8.json .local/data/analysis-994ce642-e336-4273-9ce3-37e8d01c2a52.json
BIFROST_IMPLEMENTATION=mock npm run dev   # API + web; open http://localhost:5173
```

Rehearsal check: Benchmarks → Graph Repair → **Saved sessions** lists several "Live · Nov 7, 2026" entries (pick the latest; its header reads "12 results · Pinned Bifrost model verified"), and Verifier → **Load a saved assessment** with `994ce642-e336-4273-9ce3-37e8d01c2a52` shows **contradicted**. Keep a live `.env` out of the folder unless you plan the optional live step.

## Presentation mode (recommended)

Press **P** anywhere (or the **Present** button, or open `/?present`). It starts on a title card and walks the script below as nine stops; each opens the right page, scrolls to the right part, replays the routing ladder and loads the saved verifier assessment by itself. Nothing is typed on stage.

| Key | Does |
| --- | --- |
| → · Space · PageDown | Next stop (works with a presentation clicker) |
| ← · PageUp | Previous stop |
| N | Cues on the stage screen |
| S | Speaker window for your laptop: cues, next stop, a 5:00 pace clock; it drives the stage |
| D | Light / dark theme (also outside presentation mode) |
| R | Restart the clock · **Home** / **End** first / last stop · **Esc** exit |

On a projector: drag the stage window to the projector, press **S** and keep the speaker window on your laptop. The clock turns amber when you are more than 10 s behind plan and red past 5:00. The saved verifier assessment also opens from a link: `/verify?assessment=994ce642-e336-4273-9ce3-37e8d01c2a52`.

## Script

| Time | Screen and action | Say |
| --- | --- | --- |
| **0:00–0:30** | **Overview.** Scroll just enough to show the four-number **proof strip** under the headline. | "Agents and AI answers make claims. ProofBench makes them show evidence. Four numbers, all from saved live runs: about **20× fewer tokens** per repair trial than OpenCode on the same bugs and model, **42.6% fewer** tokens than going straight to the big model, **12 of 12** patches passing hidden tests in a sandbox, and **two independent sources** before the verifier gives any verdict. Each number is a link to its evidence." |
| **0:30–2:00** | **Benchmarks → Graph Repair.** In **Saved sessions**, pick the **latest** Live 7 Nov entry (session `94313e39`; header shows "12 results · Pinned Bifrost model verified"). Point at the **Compare agents** table, scroll to the note under it, then open **How a patch passes**. | "Two coding agents, ProofBench's own adapter and OpenCode, on the same local Qwen3.5-9B through the same Bifrost gateway, with alternating order. Two C++ graph bugs, three repeats each. Patches build in a Docker sandbox with no network and are checked against public, hidden and seeded cases using a pinned reference oracle from Speed Demon 2026 (MIT, Hackathon Raptors). Both agents passed **6 of 6**, and 'Pinned Bifrost model verified' means every model receipt matched. The difference is cost: about **860 tokens per trial for ProofBench against about 17,400 for OpenCode**, roughly 20× fewer, and 13 seconds against 31 median. Scroll to **What these repairs would cost on a paid API**: at Claude Sonnet 5.5 list prices and 10,000 repairs a month that's about **$49 against $411**, 8.4× cheaper. It's less than 20× because our tokens are output-heavy, and the screen says it's an estimate. It is not a ranking: ProofBench sees public test feedback while editing and OpenCode doesn't, and the screen says so." |
| **2:00–2:45** | **Benchmarks → Model routing.** Scroll to **How the routing works** and press **Replay**. | "Farhan's routing engine on one coding task, one recorded trial per strategy. The 1.5B model alone gets stuck: 0 of 1. The 9B model passes, at full price. ProofBench starts on the 1.5B; when the loop breaker sees repeat failures it sends the 9B a compact autopsy of only the errors and diffs. Starting small and escalating to the 9B model only after a diagnosed failure passed with **4,461 tokens**, against **7,766** for going straight to the larger model: **42.6% fewer**. One trial each, so this is an illustration, not a statistic." |
| **2:45–4:30** | **Verifier.** Open **Load a saved assessment**, enter `994ce642-e336-4273-9ce3-37e8d01c2a52` and click **Load saved assessment**. Point at the 'Saved assessment' banner, then scroll the three sources. | "Mohit's verifier. The claim is 'Steve Ballmer is the current CEO of Microsoft.' Tavily retrieved live sources; the local model compared each one, quoting the full excerpt, and the backend decided. Microsoft's own page and a Detroit Regional Chamber bio both say he retired, so it's **contradicted** by two independent sources. Forbes agreed, but its page date was invalid, so it was **not counted**. It fails closed: one source is not enough, a timeout or malformed model answer is never a verdict, and old pages can't confirm a 'current' claim." |
| **4:30–5:00** | Back to **Graph Repair**, click **Evidence JSON** | "Every number you saw downloads as JSON with model receipts. Our first pilot reported OpenCode 0 of 6; we re-ran it independently, it didn't reproduce, and we publish the rerun instead. That's the point of ProofBench." |

## Optional live step (only if time and setup allow)

Needs the local model, Bifrost, Tavily key and `.env` from [LOCAL-LIVE-RERUN-2026-11-07.md](LOCAL-LIVE-RERUN-2026-11-07.md). In **Verifier**, choose **Current evidence**, paste a claim and run it. A live check takes about 15–60 seconds on a 9B model, and an **inconclusive** result is a correct outcome, not a failure. Don't do this in place of the saved assessment.

## Do not say

- That ProofBench beats OpenCode. Pass rates were equal.
- That the pilot's 6/6 vs 0/6 is a result. It did not reproduce.
- That the routing saving is a benchmark average. It is one trial.
- That a verdict is proof. The UI calls it a model-assisted evidence assessment.
- That the cost projection is money saved. The runs used a local model; it prices the recorded tokens at listed API rates.

## Credits to mention

Graph Repair benchmark and UI: Aryan. Verifier: Mohit. Routing engine and integration: Farhan. Reference oracle: Speed Demon 2026, Hackathon Raptors CIC (MIT).
