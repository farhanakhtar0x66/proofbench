// API list prices, used to put measured token usage into one unit: dollars.
//
// Ported from NeuroMesh `src/usage/prices.ts` (main branch, features F16
// dollar-budget and F17 live-cost; see docs/REUSE-DISCLOSURE.md). Same source
// and date as the original: NeuroMesh docs/reference/api-pricing-2026-11-11.md.
//
// This is an ESTIMATE of what the same tokens would cost on each provider's
// pay-per-token API. The ProofBench trials ran on a local Qwen model through
// Bifrost and cost nothing per token. Caveats:
// - GPT prices are the short-context tier (requests up to 272K input tokens).
// - Gemini 3.8 Flash prices are promotional until 2026-12-31, then double.
// - Cache discounts are ignored: every input token is priced as uncached, which
//   is what the recorded runs report.

export const PRICES_AS_OF = '2026-11-11';

export interface Price {
  id: string;
  label: string;
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

export const PRICES: readonly Price[] = [
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', input: 0.1, output: 0.5 },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', input: 0.75, output: 3.75 },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', input: 2, output: 10 },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', input: 2, output: 10 },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', input: 4, output: 20 },
];

export interface TokenUsage { input: number; output: number }

/** Estimated API cost in USD of some usage at a listed price. */
export function estimateCost(price: Price, usage: TokenUsage): number {
  return (usage.input * price.input + usage.output * price.output) / 1_000_000;
}

const cents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fine = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumSignificantDigits: 2, maximumSignificantDigits: 2 });

/** Dollars, with two significant digits below one dollar so per-repair figures stay comparable. */
export function formatUsd(value: number): string {
  return value !== 0 && Math.abs(value) < 1 ? fine.format(value) : cents.format(value);
}
