import { useState } from 'react';
import { PRICES, PRICES_AS_OF, estimateCost, formatUsd, type Price } from './pricing';
import './pitch.css';

export type AgentUsage = { id: string; label: string; input: number; output: number; passed: number; total: number };

const volumes = [100, 1_000, 10_000, 100_000] as const;
const count = new Intl.NumberFormat('en-US');

/**
 * Projects measured token usage onto listed API prices (NeuroMesh F17 live-cost).
 * Cost per passing repair includes the spend on failed attempts, like the
 * scorecard's "tokens per passing repair".
 */
export function CostProjection({ agents }: { agents: AgentUsage[] }) {
  const [priceId, setPriceId] = useState<Price['id']>('claude-sonnet-5-5');
  const [volume, setVolume] = useState<typeof volumes[number]>(10_000);
  const price = PRICES.find(item => item.id === priceId) ?? PRICES[0];
  const rows = agents.filter(agent => agent.passed > 0).map(agent => {
    const perRepair = estimateCost(price, agent) / agent.passed;
    return { ...agent, perRepair, monthly: perRepair * volume };
  });
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((left, right) => left.monthly - right.monthly);
  const cheapest = sorted[0];
  const dearest = sorted[sorted.length - 1];
  const max = dearest.monthly || 1;
  const ratio = cheapest.monthly > 0 ? dearest.monthly / cheapest.monthly : null;

  return <section className="cost-projection" aria-labelledby="cost-projection-title">
    <div className="track-block-heading">
      <div><h4 id="cost-projection-title">What these repairs would cost on a paid API</h4>
        <p>The recorded tokens, priced at each provider's list rates. Pick a model and a monthly volume.</p></div>
    </div>
    <div className="cost-controls">
      <div className="track-metric-switch cost-models" role="group" aria-label="Price as">
        {PRICES.map(item => <button type="button" key={item.id} aria-pressed={item.id === price.id} onClick={() => setPriceId(item.id)}>{item.label}</button>)}
      </div>
      <div className="track-metric-switch" role="group" aria-label="Repairs per month">
        {volumes.map(item => <button type="button" key={item} aria-pressed={item === volume} onClick={() => setVolume(item)}>{count.format(item)}/mo</button>)}
      </div>
    </div>
    <ul className="cost-bars">
      {sorted.map(row => <li key={row.id} data-best={row === cheapest}>
        <div className="cost-bar-label"><strong>{row.label}</strong><span>{formatUsd(row.perRepair)} per passing repair</span></div>
        <div className="cost-bar-track"><span style={{ width: `${Math.max(1.5, row.monthly / max * 100)}%` }}/></div>
        <strong className="cost-bar-value">{formatUsd(row.monthly)}<small>/mo</small></strong>
      </li>)}
    </ul>
    {ratio !== null && <p className="cost-callout">
      At {count.format(volume)} repairs a month on {price.label}, <strong>{cheapest.label}</strong> costs <strong>{formatUsd(dearest.monthly - cheapest.monthly)} less</strong>, {ratio.toFixed(1)}× cheaper for the same passing patches.
    </p>}
    <p className="track-comparison-note">Estimate only. The trials ran on a local model at no per-token cost. {price.label}: ${price.input}/M input, ${price.output}/M output, list prices as of {PRICES_AS_OF}, cache discounts ignored. Assumes the same token counts on that model.</p>
  </section>;
}
