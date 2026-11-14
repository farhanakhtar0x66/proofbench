import { Tabs } from '@base-ui/react/tabs';
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Check, FileCheck2, GitCompareArrows, ListTree, ScanLine } from 'lucide-react';
import { EncryptedText } from './EncryptedText';
import { FeatureArt, PortalArt, useViewportEntry } from './PresentationArt';
import { WorkspaceLink } from './WorkspaceNavigation';
import { ProofStrip } from './ProofStrip';
import './overview.css';

type Navigation = { navigate: (href: string) => void };

const workspaces = [
  { id: 'benchmarks', name: 'Benchmarks', subtitle: 'Compare the work', icon: GitCompareArrows, art: 'route',
    title: 'Same task. Different agents. Visible proof.',
    description: 'Compare coding agents on shared C++ repair tasks. Open a verdict to see the grader checks, source changes, and recorded model calls behind it.',
    details: ['Shared tasks and test seeds', 'Independent acceptance checks', 'Usage shown when reported'],
    href: '/benchmarks', action: 'Open Graph Repair', secondary: '/benchmarks/routing', secondaryLabel: 'Explore model routing',
    caption: 'COMPARE / INSPECT / UNDERSTAND', tags: ['SHARED INPUT', 'AGENT A / AGENT B', 'INDEPENDENT CHECKS'] },
  { id: 'execution', name: 'Execution', subtitle: 'Follow every step', icon: ListTree, art: 'trace',
    title: 'Follow the decisions behind the result.',
    description: 'Run a coding task and follow its execution map. Inspect routing decisions, model calls, acceptance checks, and the evidence preserved in the run ledger.',
    details: ['Step-by-step execution traces', 'Recorded acceptance evidence', 'Saved runs and offline fixtures'],
    href: '/execution', action: 'Open execution lab', secondary: '/execution/runs', secondaryLabel: 'Browse the run ledger',
    caption: 'TASK / ROUTE / CHECK / RECORD', tags: ['CODING TASK', 'EXECUTION TRACE', 'ACCEPTANCE EVIDENCE'] },
  { id: 'verifier', name: 'Verifier', subtitle: 'Look closer at claims', icon: FileCheck2, art: 'sources',
    title: 'An answer is a starting point. Check its sources.',
    description: 'Review claims against the available source evidence. See dated references, supporting excerpts, and the limitations behind each freshness finding.',
    details: ['Claim-by-claim findings', 'Source excerpts and citations', 'Offline examples to explore'],
    href: '/verify', action: 'Open freshness verifier', secondary: '/guide#workspace-faq', secondaryLabel: 'Understand the verdicts',
    caption: 'CLAIM / SOURCES / FINDINGS', tags: ['ANSWER TEXT', 'DATED SOURCES', 'CLAIM FINDINGS'] },
] as const;

const principles = [
  { icon: GitCompareArrows, title: 'Start with the same question.', description: 'Shared tasks and paired test seeds make Graph Repair comparisons easier to inspect.', tag: '01 / COMPARABLE INPUTS' },
  { icon: ListTree, title: 'Keep the steps in view.', description: 'Move from a result to its checks, trace, and source changes without losing the context.', tag: '02 / INSPECTABLE EVIDENCE' },
  { icon: FileCheck2, title: 'Show the limits, too.', description: 'Failed checks, missing usage, and unavailable sources belong alongside successful results.', tag: '03 / EXPLICIT LIMITATIONS' },
] as const;

export function OverviewPage({ navigate }: Navigation) {
  const { ref, entered } = useViewportEntry<HTMLElement>();
  return <div className="overview-page" id="overview-top" tabIndex={-1}>
    <section className="page-heading overview-hero">
      <PortalArt/>
      <WorkspaceLink className="overview-announcement" href="/#overview-workspaces" navigate={navigate}>
        <span className="overview-indicator" aria-hidden="true"/> One workspace. Follow the evidence. <ArrowDown size={13} aria-hidden="true"/>
      </WorkspaceLink>
      <p className="eyebrow hero-kicker">[ <EncryptedText text="EXECUTION & EVIDENCE"/> ]</p>
      <h1 id="page-title" tabIndex={-1}>Trust the<br/>evidence.</h1>
      <p className="hero-description">A coding agent that spends small-model tokens first, escalates only on evidence, and grades every patch in a sandbox. Then it shows you the receipts.</p>
      <div className="overview-actions">
        <WorkspaceLink href="/benchmarks" navigate={navigate} className="primary">Compare agents <ArrowUpRight size={14} aria-hidden="true"/></WorkspaceLink>
        <WorkspaceLink href="/execution" navigate={navigate} className="secondary">Open execution lab <ArrowRight size={14} aria-hidden="true"/></WorkspaceLink>
      </div>
      <span className="overview-hero-note">LESS GUESSWORK. MORE CONTEXT.</span>
    </section>

    <ProofStrip navigate={navigate}/>

    <div className="overview-capabilities" aria-label="What you can inspect">
      <span><GitCompareArrows size={15} aria-hidden="true"/> Comparable tasks</span>
      <span><ListTree size={15} aria-hidden="true"/> Recorded traces</span>
      <span><FileCheck2 size={15} aria-hidden="true"/> Source evidence</span>
    </div>

    <section className="overview-section overview-workspaces" id="overview-workspaces" tabIndex={-1} aria-labelledby="overview-workspaces-title">
      <header className="overview-section-heading">
        <p className="eyebrow">[ <EncryptedText text="FIND YOUR STARTING POINT"/> ]</p>
        <h2 id="overview-workspaces-title">One question.<br/><span>A clearer way to investigate.</span></h2>
        <p>Pick a workspace. Follow the details that matter.</p>
      </header>
      <Tabs.Root defaultValue="benchmarks" className="overview-products">
        <Tabs.List className="overview-product-tabs" aria-label="Explore ProofBench">
          {workspaces.map(({ id, name, subtitle, icon: Icon }, index) => <Tabs.Tab value={id} key={id}>
            <span className="overview-tab-number">0{index + 1}</span>
            <Icon size={19} aria-hidden="true"/>
            <span><strong>{name}</strong><small>{subtitle}</small></span>
            <ArrowUpRight className="overview-tab-arrow" size={16} aria-hidden="true"/>
          </Tabs.Tab>)}
        </Tabs.List>
        {workspaces.map(workspace => <Tabs.Panel key={workspace.id} value={workspace.id} className="overview-product-panel">
          <div className="overview-product-copy">
            <p className="eyebrow">[ {workspace.name.toUpperCase()} ]</p>
            <h3>{workspace.title}</h3>
            <p>{workspace.description}</p>
            <ul>{workspace.details.map(detail => <li key={detail}><Check size={14} aria-hidden="true"/>{detail}</li>)}</ul>
            <div className="overview-product-actions">
              <WorkspaceLink href={workspace.href} navigate={navigate} className="primary">{workspace.action}<ArrowUpRight size={14} aria-hidden="true"/></WorkspaceLink>
              <WorkspaceLink href={workspace.secondary} navigate={navigate} className="overview-text-link">{workspace.secondaryLabel}<ArrowRight size={14} aria-hidden="true"/></WorkspaceLink>
            </div>
          </div>
          <figure className="overview-product-art" aria-label={`${workspace.name} workflow illustration`}>
            <div className="overview-art-caption"><span className="overview-indicator"/>{workspace.caption}</div>
            <div className="overview-art-stage" aria-hidden="true">
              <span className="overview-art-cross cross-top">+</span>
              <FeatureArt kind={workspace.art}/>
              <span className="overview-art-cross cross-bottom">+</span>
            </div>
            <figcaption>{workspace.tags.map((tag, index) => <span key={tag}><i>0{index + 1}</i>{tag}</span>)}</figcaption>
          </figure>
        </Tabs.Panel>)}
      </Tabs.Root>
    </section>

    <section className="overview-section overview-principles" ref={ref} data-entered={entered} aria-labelledby="overview-principles-title">
      <header className="overview-section-heading overview-heading-split">
        <div><p className="eyebrow">[ <EncryptedText text="BUILT TO BE INSPECTED"/> ]</p><h2 id="overview-principles-title">The result is only<br/>the beginning.</h2></div>
        <p>A score tells you what happened.<br/>The evidence helps you understand why.</p>
      </header>
      <div className="overview-principle-grid">
        {principles.map(({ icon: Icon, title, description, tag }) => <article key={title}>
          <span className="overview-principle-icon"><Icon size={25} strokeWidth={1.3} aria-hidden="true"/></span>
          <p className="eyebrow">{tag}</p><h3>{title}</h3><p>{description}</p>
        </article>)}
      </div>
      <WorkspaceLink href="/guide" navigate={navigate} className="overview-guide-link">Get to know the workspace <span>Read the guide <ArrowUpRight size={15} aria-hidden="true"/></span></WorkspaceLink>
    </section>

    <section className="overview-section overview-questions" aria-labelledby="overview-questions-title">
      <header className="overview-section-heading">
        <p className="eyebrow">[ A LITTLE CONTEXT ]</p><h2 id="overview-questions-title">Before you<br/> start exploring.</h2>
        <WorkspaceLink href="/guide#workspace-faq" navigate={navigate} className="overview-text-link">More in the guide<ArrowUpRight size={14} aria-hidden="true"/></WorkspaceLink>
      </header>
      <div className="overview-accordion">
        <details><summary>Can I explore without a model running?<span aria-hidden="true">+</span></summary><p>Yes. Graph Repair includes offline fixtures, and the verifier offers bundled examples. These are marked as fixtures. Live agent runs and general claim analysis need their configured services.</p></details>
        <details><summary>Where should I start?<span aria-hidden="true">+</span></summary><p>Open Graph Repair to compare repairs, the execution lab to follow a coding task, or the freshness verifier to inspect an answer. Each workspace has its own controls and evidence.</p></details>
        <details><summary>What does a passing result tell me?<span aria-hidden="true">+</span></summary><p>It tells you the recorded acceptance checks passed for that input. Open the underlying checks and limitations before drawing a broader conclusion.</p></details>
      </div>
    </section>
  </div>;
}

const footerGroups = [
  { title: 'WORKSPACES', links: [['Execution lab', '/execution'], ['Run ledger', '/execution/runs'], ['Freshness verifier', '/verify']] },
  { title: 'BENCHMARKS', links: [['Graph Repair', '/benchmarks'], ['Model routing', '/benchmarks/routing']] },
  { title: 'EXPLORE', links: [['Workspace guide', '/guide'], ['Local API examples', '/guide#guide-api-title'], ['Common questions', '/guide#workspace-faq']] },
] as const;

export function OverviewFooter({ navigate }: Navigation) {
  return <footer className="overview-footer">
    <div className="overview-footer-inner">
      <section className="overview-closing" aria-labelledby="overview-closing-title">
        <div><p className="eyebrow">[ YOUR NEXT QUESTION STARTS HERE ]</p><h2 id="overview-closing-title">Go beyond<br/>the final answer.</h2><p>Open a workspace. Find the evidence behind the result.</p></div>
        <WorkspaceLink href="/benchmarks" navigate={navigate} className="primary">Explore Graph Repair<ArrowUpRight size={16} aria-hidden="true"/></WorkspaceLink>
        <div className="overview-closing-art" aria-hidden="true"><ScanLine strokeWidth={.6}/><span>INPUT → PROCESS → PROOF</span></div>
      </section>
      <div className="overview-footer-navigation">
        <div className="overview-footer-about">
          <WorkspaceLink className="brand" href="/" navigate={navigate}><ScanLine size={22} aria-hidden="true"/>ProofBench</WorkspaceLink>
          <p>A workspace for coding agents,<br/>execution evidence, and source verification.</p>
          <span className="overview-local-label"><span className="overview-indicator" aria-hidden="true"/>LOCAL WORKSPACE</span>
        </div>
        {footerGroups.map(group => <nav key={group.title} aria-label={`Footer ${group.title.toLowerCase()}`}><h3>[ {group.title} ]</h3>{group.links.map(([label, href]) => <WorkspaceLink key={href} href={href} navigate={navigate}>{label}<ArrowUpRight size={12} aria-hidden="true"/></WorkspaceLink>)}</nav>)}
      </div>
      <div className="overview-footer-bottom"><span>© {new Date().getFullYear()} ProofBench</span><span>BUILT FOR QUESTIONS. GROUNDED IN EVIDENCE.</span><WorkspaceLink href="/#overview-top" navigate={navigate}>Back to top<ArrowUp size={13} aria-hidden="true"/></WorkspaceLink></div>
      <div className="overview-footer-wordmark" aria-hidden="true">ProofBench<span>↗</span></div>
    </div>
  </footer>;
}
