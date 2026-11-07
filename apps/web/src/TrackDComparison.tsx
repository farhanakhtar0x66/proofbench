import { useRef, useState } from 'react';
import { ArrowDown, ArrowDownUp, ArrowUp, ArrowUpRight } from 'lucide-react';
import { trackDAgentLabels, trackDAgentsByMode, trackDGatewayAttempts, type TrackDAgent, type TrackDRun, type TrackDSession, type TrackDTask } from '../../../packages/contracts/src/track-d';
import { TrackDRunEvidence, verdictClass } from './TrackDRunEvidence';
import { EncryptedText } from './EncryptedText';

export const trackDTaskLabels: Record<TrackDTask, string> = {
  'distance-width': 'Long-distance overflow',
  'directed-edges': 'Directed reachability',
};

const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const valueText = (value: number | null, unit = '') => value === null ? 'Unavailable' : `${format.format(value)}${unit}`;

type TrialRow = { task: TrackDTask; repeat: number; seed?: number; entries: Map<TrackDAgent, TrackDRun> };

function trialRows(session: TrackDSession, tasks: TrackDTask[], agents: readonly TrackDAgent[]): TrialRow[] {
  return tasks.flatMap(task => Array.from({ length: session.request.repeats }, (_, index) => {
    const repeat = index + 1;
    const groups = new Map<number, TrialRow>();
    for (const run of session.runs) {
      if (run.task !== task || run.repeat !== repeat) continue;
      const agent = run.agentId ?? agents.find(id => trackDAgentLabels[id] === run.agent);
      if (!agent || !agents.includes(agent)) continue;
      const row = groups.get(run.seed) ?? { task, repeat, seed: run.seed, entries: new Map() };
      row.entries.set(agent, run);
      groups.set(run.seed, row);
    }
    return groups.size ? [...groups.values()] : [{ task, repeat, entries: new Map() }];
  }).flat());
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function measurements(id: TrackDAgent, runs: TrackDRun[]) {
  const passed = runs.filter(run => run.verdict === 'passed').length;
  const unavailable = runs.filter(run => run.verdict === 'unavailable').length;
  const tokens = runs.flatMap(run => run.inputTokens === null || run.outputTokens === null ? [] : [run.inputTokens + run.outputTokens]);
  const tools = runs.flatMap(run => run.toolCalls === null ? [] : [run.toolCalls]);
  return {
    id, passed, unavailable, total: runs.length, passRate: runs.length ? passed / runs.length * 100 : null,
    latency: median(runs.map(run => run.agentMs / 1000)),
    tools: median(tools), toolsMeasured: tools.length,
    tokens: median(tokens), tokensMeasured: tokens.length,
    tokensPerPass: passed > 0 && tokens.length === runs.length ? tokens.reduce((sum, value) => sum + value, 0) / passed : null,
    modelAttempts: median(runs.map(run => trackDGatewayAttempts(run.receipts))),
  };
}

type AgentStats = ReturnType<typeof measurements>;
const columns = [
  { key: 'passRate', label: 'Correctness' }, { key: 'latency', label: 'Agent latency' },
  { key: 'tools', label: 'Tool calls' }, { key: 'tokens', label: 'Tokens / trial' },
  { key: 'tokensPerPass', label: 'Tokens / passing repair' },
] as const;
type Column = typeof columns[number]['key'];

function Scorecard({ stats, fixture }: { stats: AgentStats[]; fixture: boolean }) {
  const [sort, setSort] = useState<{ key: Column; descending: boolean }>({ key: 'passRate', descending: true });
  const sorted = [...stats].sort((left, right) => {
    const a = left[sort.key];
    const b = right[sort.key];
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return sort.descending ? b - a : a - b;
  });
  return <>
    {!fixture && <p className="track-scroll-hint">Scroll the scorecard for more metrics →</p>}
    <div className="table-scroll track-score-scroll" tabIndex={0} aria-label="Scrollable agent scorecard">
    <table className="track-scorecard" aria-label={fixture ? 'Fixture scorecard' : 'Agent scorecard'}>
      <thead><tr><th scope="col">{fixture ? 'Fixture' : 'Coding agent'}</th>
        {(fixture ? columns.slice(0, 1) : columns).map(({ key, label }) => {
          const Icon = sort.key !== key ? ArrowDownUp : sort.descending ? ArrowDown : ArrowUp;
          return <th scope="col" key={key} aria-sort={sort.key === key ? sort.descending ? 'descending' : 'ascending' : undefined}>
            <button type="button" onClick={() => setSort({ key, descending: sort.key === key ? !sort.descending : key === 'passRate' })}>
              {label}<Icon size={13} aria-hidden="true"/></button></th>;
        })}
      </tr></thead>
      <tbody>{sorted.map(row => <tr key={row.id}>
        <th scope="row">{trackDAgentLabels[row.id]}</th>
        <td><strong>{valueText(row.passRate, '%')}</strong><small>{row.passed}/{row.total} passed · {row.total - row.passed - row.unavailable} failed
          {row.unavailable > 0 && ` · ${row.unavailable} unavailable`}</small></td>
        {!fixture && <>
          <td><strong>{valueText(row.latency, ' s')}</strong><small>median per trial</small></td>
          <td><strong>{valueText(row.tools)}</strong><small>{row.toolsMeasured}/{row.total} measured</small></td>
          <td><strong>{valueText(row.tokens)}</strong><small>{row.tokensMeasured}/{row.total} measured</small></td>
          <td><strong>{row.tokensPerPass === null ? row.passed ? 'Usage incomplete' : 'No passing repairs' : valueText(row.tokensPerPass)}</strong>
            <small>{valueText(row.modelAttempts)} median gateway attempts</small></td>
        </>}
      </tr>)}</tbody>
    </table>
    </div>
  </>;
}

function EfficiencyPlot({ stats }: { stats: AgentStats[] }) {
  const [metric, setMetric] = useState<'tokens' | 'latency'>('tokens');
  const measured = stats.filter(row => row[metric] !== null);
  const max = Math.max(...measured.map(row => row[metric] ?? 0), 1);
  const step = 10 ** Math.floor(Math.log10(max));
  const extent = Math.ceil(max / step) * step;
  const unit = metric === 'latency' ? ' s' : '';
  const axis = metric === 'tokens' ? 'Median tokens per trial' : 'Median agent latency';
  const ticks = [0, 25, 50, 75, 100];
  return <section className="track-efficiency" aria-labelledby="track-efficiency-title">
    <div className="track-block-heading">
      <div><h4 id="track-efficiency-title">Correctness vs. efficiency</h4><p>Higher pass rate and lower resource use appear toward the upper left.</p></div>
      <div className="track-metric-switch" role="group" aria-label="Plot resource">
        <button type="button" aria-pressed={metric === 'tokens'} onClick={() => setMetric('tokens')}>Tokens</button>
        <button type="button" aria-pressed={metric === 'latency'} onClick={() => setMetric('latency')}>Latency</button>
      </div>
    </div>
    {measured.length > 0 ? <div className="track-plot" role="img" aria-label={`Pass rate versus ${axis.toLowerCase()}. Values listed below.`}>
      <span className="track-y-label" aria-hidden="true">Pass rate</span>
      <div className="track-plot-grid" aria-hidden="true">
        {ticks.map(tick => <span className="track-y-tick" key={tick} style={{ bottom: `${tick}%` }}>{tick}%</span>)}
        {ticks.map(tick => <span className="track-x-tick" key={tick} style={{ left: `${tick}%` }}>{compact.format(extent * tick / 100)}{unit}</span>)}
        {stats.map((row, index) => row[metric] === null ? null : <span key={row.id} className="track-point" data-series={index}
          style={{ left: `${row[metric] / extent * 100}%`, bottom: `${row.passRate}%` }}/>) }
      </div>
      <span className="track-x-label" aria-hidden="true">{axis}</span>
    </div> : <p className="track-empty">Token usage was unavailable for these trials. Select Latency to compare recorded time.</p>}
    <ul className="track-plot-legend">{stats.map((row, index) => <li key={row.id}>
      <span className="track-legend-point" data-series={index} aria-hidden="true"/>
      <span>{trackDAgentLabels[row.id]}</span><strong>{valueText(row.passRate, '%')} · {valueText(row[metric], unit)}</strong>
    </li>)}</ul>
  </section>;
}

export function TrackDComparison({ session, onVerify }: { session: TrackDSession; onVerify: (text: string) => void }) {
  const [task, setTask] = useState<TrackDTask | 'all'>('all');
  const [runId, setRunId] = useState<string>();
  const verdictButton = useRef<HTMLButtonElement>(null);
  const agents = session.request.agents ?? trackDAgentsByMode[session.request.mode];
  const tasks = task === 'all' ? session.request.tasks : [task];
  const rows = trialRows(session, tasks, agents);
  const matched = rows.filter(row => row.entries.size === agents.length);
  const stats = agents.map(id => measurements(id, matched.map(row => row.entries.get(id)!)));
  const fixture = session.request.mode === 'fixture';
  const selectedRun = session.runs.find(run => run.id === runId);
  const planned = tasks.length * session.request.repeats;

  return <section className="track-comparison" aria-labelledby="track-comparison-title">
    <header className="track-comparison-heading">
      <div><p className="eyebrow">[ 01 / <EncryptedText text="SCORECARD"/> ]</p><h3 id="track-comparison-title">{fixture ? 'Fixture outcomes' : 'Compare agents'}</h3>
        <p>{matched.length} of {planned} {agents.length > 1 ? 'matched trials per entry' : 'trials recorded'}.
          {agents.length > 1 && ' Each match shares a task, repeat and test seed.'}</p></div>
      {session.request.tasks.length > 1 && <label>Task filter
        <select value={task} onChange={event => { setTask(event.target.value as typeof task); setRunId(undefined); }}>
          <option value="all">All selected tasks</option>
          {session.request.tasks.map(id => <option value={id} key={id}>{trackDTaskLabels[id]}</option>)}
        </select></label>}
    </header>
    {matched.length > 0 ? <>
      <Scorecard stats={stats} fixture={fixture}/>
      <p className="track-comparison-note">{fixture ? 'Fixtures exercise the grader without running an agent or model.'
        : 'Tool counts use each adapter’s own events. Tokens per passing repair include spend on failed attempts and require complete usage.'}</p>
      {!fixture && <EfficiencyPlot stats={stats}/>}
    </> : <p className="track-empty">The scorecard appears when every selected entry has a result for the same trial.</p>}
    <section className="track-matrix" aria-labelledby="track-matrix-title">
      <header className="track-comparison-heading">
        <div><p className="eyebrow">[ 02 / <EncryptedText text="TRIAL MATRIX"/> ]</p><h3 id="track-matrix-title">Task verdicts</h3>
          <p>Open a verdict to inspect the checks, patch, and trace.</p></div>
      </header>
      <div className="track-matrix-body" data-evidence={Boolean(selectedRun)}>
        <div className="table-scroll track-matrix-scroll" tabIndex={0} aria-label="Scrollable task verdicts">
          <table className="track-matrix-table" aria-label="Task verdict matrix">
            <thead><tr><th scope="col">Task / repeat</th>{agents.map(id => <th scope="col" key={id}>{trackDAgentLabels[id]}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={`${row.task}/${row.repeat}/${row.seed ?? 'pending'}`}>
              <th scope="row">{trackDTaskLabels[row.task]}<small>Run {row.repeat}{row.seed !== undefined && ` · Seed ${row.seed}`}</small></th>
              {agents.map(id => {
                const entry = row.entries.get(id);
                return <td key={id}>{entry ? <button type="button" className="track-verdict" aria-pressed={entry.id === runId}
                  aria-label={`${entry.agent}, ${trackDTaskLabels[row.task]}, run ${row.repeat}, ${entry.verdict}`}
                  aria-controls={entry.id === runId ? 'track-run-evidence' : undefined}
                  onClick={event => {
                    verdictButton.current = event.currentTarget;
                    setRunId(entry.id);
                    window.requestAnimationFrame(() => {
                      const evidence = document.getElementById('track-run-evidence');
                      evidence?.focus({ preventScroll: true });
                      if (window.matchMedia('(max-width: 760px)').matches) evidence?.scrollIntoView({ block: 'start' });
                    });
                  }}><span className={verdictClass[entry.verdict]}>{entry.verdict}</span><ArrowUpRight size={13} aria-hidden="true"/></button>
                  : <span className="track-no-verdict">{session.status === 'running' ? 'Pending' : 'No result'}</span>}</td>;
              })}
            </tr>)}</tbody>
          </table>
        </div>
        {selectedRun && <TrackDRunEvidence key={selectedRun.id} run={selectedRun} fixture={fixture} onVerify={onVerify}
          onClose={() => { setRunId(undefined); verdictButton.current?.focus(); }}/>}
      </div>
    </section>
  </section>;
}
