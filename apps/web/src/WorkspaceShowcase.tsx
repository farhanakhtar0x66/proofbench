import { useState } from 'react';
import { Tabs } from '@base-ui/react/tabs';
import { ArrowUpRight, Copy } from 'lucide-react';
import { FeatureArt, useViewportEntry, type Diagram } from './PresentationArt';

const endpoints = {
  runs: { label: 'Runs', path: '/api/runs', description: '// Read the stored run ledger' },
  benchmark: { label: 'Benchmark', path: '/api/benchmarks/controlled', description: '// Read controlled routing results' },
  verify: { label: 'Verifier', path: '/api/analysis/status', description: '// Read the verifier configuration' },
} as const;

export function ApiTerminal({ defaultTab }: { defaultTab: 'runs' | 'verify' }) {
  const [copyFeedback, setCopyFeedback] = useState<{ endpoint: string; message: string }>();
  return <Tabs.Root defaultValue={defaultTab} onValueChange={()=>setCopyFeedback(undefined)} className="terminal-preview" aria-label="Local API examples">
    <Tabs.List className="technical-tabs" aria-label="API examples">
      {Object.entries(endpoints).map(([id, endpoint]) => <Tabs.Tab key={id} value={id}>{endpoint.label}</Tabs.Tab>)}
    </Tabs.List>
    {Object.entries(endpoints).map(([id, endpoint]) => <Tabs.Panel key={id} value={id} className="terminal-panel">
      <span>{endpoint.description}</span>
      <code><b>$</b> curl {window.location.origin}{endpoint.path}</code>
      <button type="button" className="terminal-copy" aria-label="Copy command" onClick={async()=>{
        try {
          await navigator.clipboard.writeText(`curl ${window.location.origin}${endpoint.path}`);
          setCopyFeedback({endpoint:id,message:'Copied'});
        } catch {
          setCopyFeedback({endpoint:id,message:'Select the command to copy it manually.'});
        }
      }}><Copy size={14} aria-hidden="true"/> Copy</button>
      {copyFeedback?.endpoint===id&&<span className="terminal-feedback" role="status">{copyFeedback.message}</span>}
    </Tabs.Panel>)}
  </Tabs.Root>;
}

export type VerifierDestination = 'verification-input' | 'freshness-findings' | 'saved-assessment';
type Feature = { title: string; description: string; art: Diagram; target: string; action: string };
const executionFeatures: Feature[] = [
  { title: 'Model routing', description: 'Follow each recorded decision as a coding task moves through the execution map.', art: 'route', target: 'execution-map', action: 'Explore execution map' },
  { title: 'Execution trace', description: 'Read the event log alongside the checks that determined whether the task passed.', art: 'trace', target: 'execution-trace', action: 'Read execution trace' },
  { title: 'Run ledger', description: 'Switch between recorded runs and offline fixtures to review the evidence for each.', art: 'archive', target: 'run-ledger', action: 'Open run ledger' },
];
const verificationFeatures: (Feature & { target: VerifierDestination })[] = [
  { title: 'Claim review', description: 'Submit an answer for general analysis or load an offline example to try the workflow.', art: 'claim', target: 'verification-input', action: 'Open claim editor' },
  { title: 'Source evidence', description: 'Inspect verdicts, source excerpts, and the limitations behind a freshness assessment.', art: 'sources', target: 'freshness-findings', action: 'Open findings' },
  { title: 'Saved assessments', description: 'Reopen a previous review by its ID and inspect the sources it used.', art: 'review', target: 'saved-assessment', action: 'Open saved assessments' },
];

export function WorkspaceShowcase({ hasRun, openVerifier }: { hasRun: boolean; openVerifier: (target: VerifierDestination) => void }) {
  const { ref, entered } = useViewportEntry<HTMLElement>();
  return <section className="showcase-section" id="workspace-features" ref={ref} data-entered={entered} aria-labelledby="showcase-title">
    <header className="showcase-heading">
      <p className="eyebrow">[ EXPLORE PROOFBENCH ]</p>
      <h2 id="showcase-title">From execution to evidence</h2>
      <p>Open a run, inspect its trace, or verify a claim against the available sources.</p>
    </header>
    <Tabs.Root defaultValue="execution">
      <Tabs.List className="technical-tabs showcase-tabs" aria-label="Workspace features">
        <Tabs.Tab value="execution">Execution tools</Tabs.Tab>
        <Tabs.Tab value="verification">Verification tools</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="execution">
        <div className="feature-grid">
          {executionFeatures.filter(feature=>hasRun||feature.target!=='execution-trace').map((feature,index)=>
            <a className="feature-card" key={feature.title} href={`#${feature.target}`}>
              <div className="feature-figure"><FeatureArt kind={feature.art}/></div>
              <div className="feature-copy">
                <h3><span>0{index+1}</span> {feature.title}</h3><p>{feature.description}</p>
                <span className="feature-action">{feature.action} <ArrowUpRight size={14} aria-hidden="true"/></span>
              </div>
            </a>)}
        </div>
      </Tabs.Panel>
      <Tabs.Panel value="verification">
        <div className="feature-grid">
          {verificationFeatures.map((feature,index)=>
            <button type="button" className="feature-card" key={feature.title} onClick={()=>openVerifier(feature.target)}>
              <span className="feature-figure"><FeatureArt kind={feature.art}/></span>
              <span className="feature-copy">
                <strong className="feature-title"><span>0{index+1}</span> {feature.title}</strong><span className="feature-description">{feature.description}</span>
                <span className="feature-action">{feature.action} <ArrowUpRight size={14} aria-hidden="true"/></span>
              </span>
            </button>)}
        </div>
      </Tabs.Panel>
    </Tabs.Root>
  </section>;
}
