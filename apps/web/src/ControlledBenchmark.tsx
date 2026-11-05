import { useEffect, useState, type CSSProperties } from 'react';
import { z } from 'zod';
import { ControlledPolicySummarySchema } from '../../../packages/contracts/src/index';
import { api } from './client';
import { useViewportEntry } from './PresentationArt';

const policy = ControlledPolicySummarySchema.pick({
  totalTrials: true, passedTrials: true, successRatePercent: true,
  avgTotalTokens: true, avgWallDurationMs: true, avgControllerCpuMs: true,
}).strip();
const controlledBenchmark = z.object({
  taskTitle: z.string(),
  summary: z.object({
    controlled_direct_frontier: policy,
    controlled_escalation_only: policy,
    controlled_bidirectional_adaptive: policy,
    controlled_direct_small: policy,
  }),
});
type Benchmark = z.infer<typeof controlledBenchmark>;
type Policy = z.infer<typeof policy>;

export function useControlledBenchmark(enabled: boolean) {
  const [data, setData] = useState<Benchmark>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    api('/benchmarks/controlled', controlledBenchmark).then(
      result => { if (current) setData(result); },
      () => { if (current) setError(true); },
    );
    return () => { current = false; };
  }, [enabled, attempt]);

  function retry() {
    setError(false);
    setAttempt(previous=>previous+1);
  }
  return { data, error, retry };
}

const format = (value: number | null, suffix = '', decimals = 0) =>
  value === null ? 'Not reported' : `${value.toLocaleString('en-US',{ maximumFractionDigits:decimals })}${suffix}`;

function niceLimit(max: number) {
  if (max <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / step) * step;
}

const tickAngles = Array.from({ length: 81 }, (_, index) => (209 + index * 122 / 80) * Math.PI / 180);
const gaugeMarks = [0, .25, .5, .75, 1];

function Gauge({ label, unit, highlight, baseline, decimals = 0, fixedLimit }: {
  label: string; unit: string; highlight: number | null; baseline: number | null; decimals?: number; fixedLimit?: number;
}) {
  const { ref, entered } = useViewportEntry<HTMLElement>();
  const limit = fixedLimit ?? niceLimit(Math.max(highlight ?? 0, baseline ?? 0));
  const signed = highlight !== null && baseline !== null && baseline !== 0 ? ((highlight - baseline) / baseline) * 100 : null;

  return <article className="gauge-card" ref={ref} data-entered={entered}>
    <header><h3>{label}</h3>{signed!==null&&<span className="gauge-delta">[ {signed===0?'EVEN':`${signed>0?'+':''}${signed.toFixed(1)}%`} ]</span>}</header>
    <div className="gauge-surface">
      <svg viewBox="0 0 360 145" aria-hidden="true" className="gauge-art">
        {[{value:baseline,radius:207,name:'baseline'}, {value:highlight,radius:174,name:'highlight'}].map(({value,radius,name})=>
          <g key={name} className={`gauge-ring ${name}`}>
            {tickAngles.map((angle,index)=>{
              const x = Math.cos(angle);
              const y = Math.sin(angle);
              const filled = value !== null && value > 0 && (index + 1) / tickAngles.length <= value / limit;
              return <line key={index} className={filled?'filled':undefined}
                x1={180+x*radius} y1={243+y*radius} x2={180+x*(radius-24)} y2={243+y*(radius-24)}
                style={{ '--tick-delay': `${index*9}ms` } as CSSProperties}/>;
            })}
          </g>)}
        {gaugeMarks.map(mark=>{
          const angle = tickAngles[Math.round(mark * (tickAngles.length - 1))];
          const x = Math.min(342, Math.max(18, 180 + Math.cos(angle) * 225));
          const y = 243 + Math.sin(angle) * 225 - (mark === 0 || mark === 1 ? 13 : 0);
          return <text key={mark} x={x} y={y} textAnchor="middle">{format(limit * mark, unit, 2)}</text>;
        })}
      </svg>
      <dl className="gauge-values">
        <div><dt>Governed escalation</dt><dd>{format(highlight,unit,decimals)}</dd></div>
        <div><dt>Direct frontier</dt><dd>{format(baseline,unit,decimals)}</dd></div>
      </dl>
    </div>
  </article>;
}

export function BenchmarkOverview({ data, error, retry }: ReturnType<typeof useControlledBenchmark>) {
  const frontier = data?.summary.controlled_direct_frontier;
  const governed = data?.summary.controlled_escalation_only;

  return <section className="showcase-section benchmark-showcase" id="controlled-benchmark" aria-labelledby="benchmark-title">
    <header className="showcase-heading">
      <p className="eyebrow">[ CONTROLLED BENCHMARK ]</p>
      <h2 id="benchmark-title">Two strategies, one task</h2>
      <p>{data ? `${data.taskTitle}. ${governed?.totalTrials===1&&frontier?.totalTrials===1?'One recorded trial per strategy.':'Recorded trials under the controlled routing benchmark.'}` : 'Recorded results for governed escalation and direct frontier.'}</p>
    </header>
    {governed&&frontier ? <div className="benchmark-body">
      <div className="gauge-grid">
        <Gauge label="Total tokens" unit="" highlight={governed.avgTotalTokens} baseline={frontier.avgTotalTokens}/>
        <Gauge label="Wall time" unit="s" decimals={1}
          highlight={governed.avgWallDurationMs===null?null:governed.avgWallDurationMs/1000}
          baseline={frontier.avgWallDurationMs===null?null:frontier.avgWallDurationMs/1000}/>
        <Gauge label="Controller CPU" unit=" ms" highlight={governed.avgControllerCpuMs??null} baseline={frontier.avgControllerCpuMs??null}/>
        <Gauge label="Acceptance rate" unit="%" decimals={1} fixedLimit={100} highlight={governed.successRatePercent} baseline={frontier.successRatePercent}/>
      </div>
    </div> : <p className="empty benchmark-empty">{error?<>The recorded benchmark is unavailable. <button type="button" className="text-button" onClick={retry}>Retry benchmark</button></>:'Loading recorded benchmark…'}</p>}
  </section>;
}

const rows: { key: keyof Benchmark['summary']; label: string; routing: string }[] = [
  {key:'controlled_direct_frontier',label:'Direct Frontier (Qwen 9B)',routing:'Direct frontier inference'},
  {key:'controlled_escalation_only',label:'Governed Escalation Only',routing:'Small → frontier via M3a autopsy'},
  {key:'controlled_bidirectional_adaptive',label:'Bidirectional Adaptive Policy',routing:'Small ⇄ frontier with bounded delegation'},
  {key:'controlled_direct_small',label:'Direct Small (Qwen 1.5B)',routing:'Direct small-model inference'},
];

function success(result: Policy) {
  return `${format(result.successRatePercent,'%',1)} (${result.passedTrials}/${result.totalTrials})`;
}

export function BenchmarkDetails({ data, error, retry }: ReturnType<typeof useControlledBenchmark>) {
  const frontierTokens = data?.summary.controlled_direct_frontier.avgTotalTokens;
  const escalationTokens = data?.summary.controlled_escalation_only.avgTotalTokens;
  const savings = frontierTokens && escalationTokens != null ? frontierTokens - escalationTokens : 0;
  const delta = savings > 0 && frontierTokens ? `-${format(savings)} tokens, -${(savings / frontierTokens * 100).toFixed(1)}%` : '';

  return <section className="panel comparison" id="comparison">
    <h2>Comparison</h2>
    <p>Compare results with the same task and tooling. Use acceptance alongside token and timing figures.</p>
    {data ? <div className="bench-card">
      <div className="table-scroll" tabIndex={0} aria-label="Scrollable benchmark comparison">
        <table className="bench-table">
          <thead><tr><th>Strategy / Policy</th><th>Success Rate</th><th>Total Tokens</th><th>Wall Time</th><th>Routing Architecture</th></tr></thead>
          <tbody>{rows.map(({key,label,routing})=>{
            const result = data.summary[key];
            return <tr key={key}>
              <td><strong>{label}</strong></td>
              <td><span className={`pill ${result.passedTrials===0?'failed':''}`}>{success(result)}</span></td>
              <td>{format(result.avgTotalTokens,' tokens')}</td>
              <td>{format(result.avgWallDurationMs===null?null:result.avgWallDurationMs/1000,'s',1)}</td>
              <td>{routing}{key==='controlled_escalation_only'&&delta&&<> (<span className="mint">{delta}</span>)</>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <p className="bench-note"><strong>{data.taskTitle}.</strong> The controlled benchmark uses shared tooling. The measured results apply to this task and its recorded trials.</p>
    </div> : <p>{error?<>The recorded benchmark is unavailable. <button type="button" className="text-button" onClick={retry}>Retry benchmark</button></>:'Loading recorded benchmark…'}</p>}
  </section>;
}
