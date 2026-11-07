import React,{useState,useEffect,useLayoutEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {type Capabilities,type RunRecord,type ExecutionTrace,type EvidenceReport,type TaskSpec,type UsageRecord,type JobRecord} from '../../../packages/contracts/src/index';
import {api,schemas} from './client';
import {demoRun,demoTrace,demoReport} from '../../../packages/contracts/src/examples';
import {Verifier} from './Verifier';
import { Activity, ArrowUpRight, CirclePlay, ScanLine } from 'lucide-react';
import { EvidenceMap } from './EvidenceMap';
import { BenchmarkDetails, BenchmarkOverview, useControlledBenchmark } from './ControlledBenchmark';
import { OverviewPage, OverviewFooter } from './OverviewPage';
import { TrackDBench } from './TrackDBench';
import { ApiTerminal, WorkspaceShowcase, type VerifierDestination } from './WorkspaceShowcase';
import { WorkspaceLink, useWorkspaceNavigation, type WorkspacePath } from './WorkspaceNavigation';
import { WorkspaceOpening, type OpeningScene } from './WorkspaceOpening';
import { EncryptedText } from './EncryptedText';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './style.css';

const ACTIVE_JOB_KEY='proofbench_active_job_id';

const destinations = [
 {path:'/',label:'Overview'}, {path:'/execution',label:'Execution'}, {path:'/benchmarks',label:'Benchmarks'},
 {path:'/verify',label:'Verifier'}, {path:'/guide',label:'Guide'},
] as const;

const pageInfo: Record<Exclude<WorkspacePath, '/'>, { scene: OpeningScene; label: string; title: string; description: string }> = {
 '/execution': { scene:'execution', label:'EXECUTION', title:'Execution lab', description:'Run a coding task and follow the decisions, model calls, and checks behind it.' },
 '/execution/runs': { scene:'ledger', label:'EXECUTION ARCHIVE', title:'Run ledger', description:'Browse recorded runs and offline fixtures, then open the evidence for any result.' },
 '/benchmarks': { scene:'graph', label:'BENCHMARKS', title:'Graph Repair', description:'' },
 '/benchmarks/routing': { scene:'routing', label:'BENCHMARKS', title:'Model routing', description:'' },
 '/verify': { scene:'verifier', label:'VERIFICATION', title:'Freshness verifier', description:'Check factual claims against sources you can inspect.' },
 '/guide': { scene:'guide', label:'REFERENCE', title:'Workspace guide', description:'Find the right tool and see how to reach the local API.' },
};

function metric(value:UsageRecord['inputTokens']){
 if(value.status==='missing')return 'Not reported';if(value.status==='incomparable')return 'Incomparable';
 return `${value.status==='estimated'?'≈ ':''}${Number(value.value.toFixed(2)).toLocaleString()} ${value.unit}`;
}
function runBadge(r:RunRecord){
 if(r.reproducibility.simulated)return <span className="badge-sub badge-mock">SIMULATED FIXTURE</span>;
 if(r.id.includes('task-6')||(r.usage.inputTokens.status==='known'&&r.usage.inputTokens.value===0))return <span className="badge-sub badge-zero">ZERO-TOKEN AST FIX</span>;
 if(r.id.includes('task-9'))return <span className="badge-sub badge-escalate">M3A ESCALATION (1.5B ➔ 9B)</span>;
 if(r.id.includes('task-10'))return <span className="badge-sub badge-live">SENSOR FUSION VALIDATION</span>;
 return <span className="badge-sub badge-live">MEASURED LIVE</span>;
}

function App(){
 const {route,navigate}=useWorkspaceNavigation();
 const page=route.path;
 const execution=page==='/execution'||page==='/execution/runs';
 const benchmarking=page==='/benchmarks'||page==='/benchmarks/routing';
 const [caps,setCaps]=useState<Capabilities>();
 const [tasks,setTasks]=useState<TaskSpec[]>([]);const [selectedTaskId,setSelectedTaskId]=useState<string>('');
 const [runs,setRuns]=useState<RunRecord[]>([]);
 const [selected,setSelected]=useState<RunRecord>();const [trace,setTrace]=useState<ExecutionTrace>();const [report,setReport]=useState<EvidenceReport>();
 const [answer,setAnswer]=useState('Python 2 is currently supported.');
 const [busy,setBusy]=useState(false);const [progress,setProgress]=useState('');const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const [verifierVisited,setVerifierVisited]=useState(page==='/verify');
 const [verifierRevision,setVerifierRevision]=useState(0);
 const benchmark=useControlledBenchmark(page==='/benchmarks/routing');
 const lastScroll=useRef<typeof route | undefined>(undefined);

 function openVerifier(destination:VerifierDestination) {
  setReplayRequest(undefined);
  navigate(`/verify#${destination}`);
 }

 function verifyText(text:string) {
  setAnswer(text);
  setVerifierRevision(previous=>previous+1);
  openVerifier('verification-input');
 }

 useEffect(()=>{if(page==='/verify')setVerifierVisited(true);},[page]);
 useLayoutEffect(()=>{
  if(lastScroll.current===route||(execution&&loading&&route.anchor))return;
  const previous=lastScroll.current;
  lastScroll.current=route;
  document.title=page==='/'?'ProofBench — Evidence Lab':`${pageInfo[page].title} · ProofBench`;
  const target=route.anchor?document.getElementById(route.anchor.slice(1)):null;
  if(target instanceof HTMLDetailsElement)target.open=true;
  if(target){target.focus({preventScroll:true});target.scrollIntoView({block:'start'});}
  else{window.scrollTo(0,0);if(previous&&previous.path!==page)document.querySelector<HTMLElement>('main h1')?.focus({preventScroll:true});}
 },[route,page,execution,loading]);
 const [runFilter,setRunFilter]=useState<'all'|'recorded'|'fixtures'>('all');
 const [replayRequest,setReplayRequest]=useState<{runId:string;sequence:number}>();
 const replaySequence=useRef(0);
 const [activeJobId,setActiveJobId]=useState<string|null>(null);
 const [monitoringPaused,setMonitoringPaused]=useState(false);
 const inspectionRef=useRef(0);
 const pollingRef=useRef<{jobId:string;cancelled:boolean}|null>(null);
 const executionConnected=useRef(false);

 async function inspect(run:RunRecord){
  const inspection = ++inspectionRef.current;
  setReplayRequest(undefined);
  setSelected(run);setTrace(undefined);setReport(undefined);setError('');
  if(run.id==='demo-run'){setTrace(demoTrace);setReport(demoReport);return;}
  try{
   const [t,r]=await Promise.all([api(`/runs/${run.id}/trace`,schemas.ExecutionTrace),api(`/reports/${run.reportId}`,schemas.EvidenceReport)]);
   if(inspection===inspectionRef.current){setTrace(t);setReport(r);}
  }catch(e){if(inspection===inspectionRef.current)setError((e as Error).message);}
 }

 async function pollJob(jobId:string){
  setBusy(true);
  setActiveJobId(jobId);
  setMonitoringPaused(false);
  localStorage.setItem(ACTIVE_JOB_KEY,jobId);
  const pollSession={jobId,cancelled:false};
  pollingRef.current=pollSession;
  let targetRunId:string|undefined;
  const maxIterations=300; // ~7.5 minutes (300 * 1.5s)
  let iteration=0;
  let consecutiveErrors=0;

  try{
   while(iteration<maxIterations){
    if(pollSession.cancelled)return;
    await new Promise(r=>setTimeout(r,1500));
    if(pollSession.cancelled)return;
    iteration++;

    let job:JobRecord;
    try{
     job=await api(`/jobs/${jobId}`,schemas.JobRecord);
     if(pollSession.cancelled)return;
     consecutiveErrors=0;
    }catch(err){
     if(pollSession.cancelled)return;
     consecutiveErrors++;
     if(consecutiveErrors>=5){
      throw new Error(`Lost connection to server while monitoring job (${(err as Error).message})`);
     }
     setProgress(`Reconnecting to job monitor (retry ${consecutiveErrors}/5)…`);
     continue;
    }

    if(job.progress)setProgress(job.progress);
    if(job.runId)targetRunId=job.runId;

    if(job.status==='completed'){
     localStorage.removeItem(ACTIVE_JOB_KEY);
     setActiveJobId(null);
     setProgress('Job completed. Loading results…');
     const list=await api('/runs',schemas.RunListResponse);
     setRuns(list.runs);
     const target=(targetRunId?list.runs.find(r=>r.id===targetRunId):undefined)??list.runs[0];
     if(target){setSelected(target);await inspect(target);}
     setProgress('');
     return;
    }

    if(job.status==='failed'){
     localStorage.removeItem(ACTIVE_JOB_KEY);
     setActiveJobId(null);
     throw new Error(job.error||job.progress||'Execution job failed on server.');
    }
   }

   // Max iterations reached without completion: do NOT claim the job failed on backend
   setMonitoringPaused(true);
   setProgress('Monitoring paused (maximum poll duration reached).');
   setError(`Monitoring paused after 7 minutes. The job may still be executing on the server (Job ID: ${jobId}). You can resume monitoring or check status.`);
  }catch(e){
   setError((e as Error).message);
   if(localStorage.getItem(ACTIVE_JOB_KEY)===jobId){
    setMonitoringPaused(true);
    setProgress('Monitoring paused. Resume to check the job again.');
   }else setProgress('');
  }finally{
   if(pollingRef.current===pollSession){
    pollingRef.current=null;
    setBusy(false);
   }
  }
 }

 function stopMonitoring(){
  if(pollingRef.current){
   pollingRef.current.cancelled=true;
  }
  setBusy(false);
  setMonitoringPaused(true);
  setProgress('Monitoring paused by user. Computation continues on server.');
 }

 function resumeMonitoring(){
  if(activeJobId){
   setError('');
   void pollJob(activeJobId);
  }
 }

 async function connect(){
  setLoading(true);setError('');try{
   const c=await api('/capabilities',schemas.Capabilities);setCaps(c);
   let loadedTasks:TaskSpec[]=[];
   if(c.capabilities.benchmarks){
    const bench=await api('/benchmarks',schemas.benchmarks);
    loadedTasks=bench.tasks;
    setTasks(loadedTasks);
    if(loadedTasks.length>0){
     setSelectedTaskId(prev=>prev||loadedTasks[0].id);
    }
   }else{setTasks([]);}

   try{
    const list=await api('/runs',schemas.RunListResponse);
    if(list.runs.length>0){
     setRuns(list.runs);
     setSelected(list.runs[0]);
     void inspect(list.runs[0]);
    } else if(c.implementation==='mock'){
     setRuns([demoRun]);
     setSelected(demoRun);
     void inspect(demoRun);
    }
   }catch{
    if(c.implementation==='mock'){
     setRuns([demoRun]);
     setSelected(demoRun);
     void inspect(demoRun);
    }
   }

   // Recover active or completed job after page reload without creating duplicate executions
   const savedJobId=localStorage.getItem(ACTIVE_JOB_KEY);
   if(savedJobId){
    try{
     const job=await api(`/jobs/${savedJobId}`,schemas.JobRecord);
     if(job.status==='running'){
      setActiveJobId(savedJobId);
      void pollJob(savedJobId);
     }else if(job.status==='completed'){
      localStorage.removeItem(ACTIVE_JOB_KEY);
      if(job.runId){
       const list=await api('/runs',schemas.RunListResponse);
       setRuns(list.runs);
       const target=list.runs.find(r=>r.id===job.runId)??list.runs[0];
       if(target){setSelected(target);void inspect(target);}
      }
     }else if(job.status==='failed'){
      localStorage.removeItem(ACTIVE_JOB_KEY);
      setError(`Prior job (${savedJobId}) ended: ${job.error||job.progress||'Failed'}`);
     }
    }catch{
     localStorage.removeItem(ACTIVE_JOB_KEY);
    }
   }
  }catch(e){setError((e as Error).message);}finally{setLoading(false);}
 }

 useEffect(()=>{
  if(execution&&!executionConnected.current){executionConnected.current=true;void connect();}
 },[execution]);

 async function execute(){
  setBusy(true);setProgress('Submitting execution job…');setError('');setMonitoringPaused(false);
  try{
   const taskToRun=tasks.find(t=>t.id===selectedTaskId)??tasks[0];
   if(!taskToRun)throw new Error('No task selected');

   if(caps?.implementation==='mock'){
    const run=await api('/runs',schemas.RunRecord,{version:'1',task:taskToRun,agentId:caps?.agent.id,seed:0});
    setRuns(previous=>[run,...previous]);
    await inspect(run);
    setBusy(false);setProgress('');
    return;
   }

   const submission=await api('/jobs',schemas.JobSubmissionResponse,{version:'1',task:taskToRun,agentId:caps?.agent.id,seed:0});
   await pollJob(submission.jobId);
  }catch(e){setError((e as Error).message);setBusy(false);setProgress('');}
 }

 const featuredRun = runs.find(run => run.id === 'task-9-live' && !run.reproducibility.simulated)
  ?? runs.find(run => !run.reproducibility.simulated);
 const visibleRuns = runFilter === 'all' ? runs : runs.filter(run => run.reproducibility.simulated === (runFilter === 'fixtures'));

 function replayFeatured() {
  if (!featuredRun) return;
  if (selected?.id !== featuredRun.id || !trace) void inspect(featuredRun);
  setReplayRequest({runId:featuredRun.id,sequence:++replaySequence.current});
  document.getElementById('execution-map')?.scrollIntoView({block:'nearest'});
 }

 const isMock = caps?.implementation === 'mock';
 const mode = isMock ? 'Lab · offline' : caps ? `Lab · Bifrost ${caps.implementation}` : loading ? 'Connecting' : 'Disconnected';

 return <div className="shell">
  {page==='/'&&<div className="system-banner"><span>PROOFBENCH / LOCAL WORKSPACE</span></div>}
  <header className="masthead">
   <div className="masthead-inner">
    <WorkspaceLink className="brand" href="/" navigate={navigate}><span className="brandmark"><ScanLine size={20} aria-hidden="true"/></span>ProofBench</WorkspaceLink>
    <nav aria-label="Workspace">
     {destinations.map(item=><WorkspaceLink key={item.path} href={item.path} navigate={navigate}
      active={item.path==='/execution'?execution:item.path==='/benchmarks'?benchmarking:page===item.path}>{item.label}</WorkspaceLink>)}
    </nav>
    <span className="badge"><span className="dot" aria-hidden="true"/>{execution?mode:'Local workspace'}</span>
   </div>
  </header>
  <main className="content">
   {page==='/'?<OverviewPage navigate={navigate}/>:!benchmarking&&<WorkspaceOpening key={page} {...pageInfo[page]}>
    {page==='/execution'&&<div className="task-runner-controls">
     {featuredRun&&<button className="replay-cta" type="button" onClick={replayFeatured} disabled={busy||loading}>
      <CirclePlay size={18} aria-hidden="true"/> Replay recorded run
     </button>}
     {tasks.length>1&&<select className="task-select" value={selectedTaskId} onChange={e=>setSelectedTaskId(e.target.value)} disabled={busy||loading} aria-label="Select task">
      {tasks.map(t=><option key={t.id} value={t.id}>{t.id}: {t.title}</option>)}
     </select>}
     <button className="primary" disabled={busy||Boolean(activeJobId)||loading||!caps?.capabilities.execute||!tasks.length} onClick={()=>void execute()}>
      {busy?<><Activity size={16} aria-hidden="true"/> Running…</>:isMock?'+ Run fixture':'+ Run task'}
     </button>
     {busy&&activeJobId&&<button type="button" className="secondary" onClick={stopMonitoring} title="Stop monitoring without stopping backend execution">Stop monitoring</button>}
     {monitoringPaused&&activeJobId&&<button type="button" className="secondary" onClick={resumeMonitoring} title="Resume monitoring active job">Resume monitoring</button>}
    </div>}
   {page==='/guide'&&<nav className="guide-jumps" aria-label="On this page">
    <WorkspaceLink href="/guide#workspace-features" navigate={navigate}>Workflows</WorkspaceLink>
    <WorkspaceLink href="/guide#guide-api-title" navigate={navigate}>Local API</WorkspaceLink>
    <WorkspaceLink href="/guide#workspace-faq" navigate={navigate}>FAQ</WorkspaceLink>
   </nav>}
   </WorkspaceOpening>}
   {execution&&<nav className="workspace-subnav" aria-label="Execution views">
    <WorkspaceLink href="/execution" navigate={navigate} active={page==='/execution'}>Run workspace</WorkspaceLink>
    <WorkspaceLink href="/execution/runs" navigate={navigate} active={page==='/execution/runs'}>Run ledger</WorkspaceLink>
   </nav>}
   {benchmarking&&<nav className="workspace-subnav" aria-label="Benchmark views">
    <WorkspaceLink href="/benchmarks" navigate={navigate} active={page==='/benchmarks'}>Graph Repair</WorkspaceLink>
    <WorkspaceLink href="/benchmarks/routing" navigate={navigate} active={page==='/benchmarks/routing'}>Model routing</WorkspaceLink>
   </nav>}
   {page!=='/'&&page!=='/verify'&&<div className="workspace-content focused-workspace" id="workspace">
   {execution&&progress&&<p className="job-progress" role="status">{progress}</p>}
   {execution&&error&&<div className="error" role="alert">{error} <button onClick={()=>void connect()}>Retry connection</button></div>}
   {execution&&loading&&<p role="status" className="empty">Connecting to workspace…</p>}
   {page==='/execution'&&!loading&&<>
    <p className="section-caption">[ <EncryptedText text="RUN METRICS AT A GLANCE"/> ]</p>
    <section className="metrics" aria-label="Run metrics">
     <article><span>LOCAL RUNS</span><strong>{runs.length.toString().padStart(2,'0')}</strong><small>Records in the ledger</small></article>
     <article><span>ACCEPTANCE</span><strong className={selected?.acceptance.status==='passed'?'mint':selected?.acceptance.status==='failed'?'status-failed':''}>{selected?.acceptance.status??'Unknown'}</strong><small>{selected?.reproducibility.simulated?'Offline exact-output check':'Recorded acceptance status'}</small></article>
     <article><span>INPUT TOKENS</span><strong className="smaller">{selected?metric(selected.usage.inputTokens):'Not reported'}</strong><small>From the selected run</small></article>
     <article><span>ELAPSED TIME</span><strong className="smaller">{selected?metric(selected.usage.duration):'Not reported'}</strong><small>From the selected run</small></article>
    </section>
    <EvidenceMap key={selected?.id??'empty'} run={selected} trace={trace} replayToken={replayRequest?.runId===selected?.id?replayRequest?.sequence:undefined}/>
    {selected&&<div className="detail-grid"><section className="panel" id="execution-trace"><div className="panel-heading"><h2>Execution trace</h2><span className="small">{selected.id==='demo-run'?'DEMO PREVIEW':`${trace?.events.length??0} EVENTS`}</span></div>{trace?<ol className="timeline">{trace.events.map(e=><li key={e.sequence}><span>{String(e.sequence+1).padStart(2,'0')}</span><div><strong>{e.type}</strong><p>{e.message}</p><small>{e.at}</small></div></li>)}</ol>:<p className="empty">Trace unavailable or loading.</p>}</section><section className="panel"><div className="panel-heading"><h2>Acceptance &amp; provenance</h2></div><div className="provenance">{selected.acceptance.checks.map(c=><div key={c.name}><strong>{c.passed===null?'?':c.passed?'✓':'×'} {c.name}</strong><p>{c.evidence}</p></div>)}<dl><dt>Adapter revision</dt><dd>{selected.reproducibility.adapterRevision}</dd><dt>Fixture / seed</dt><dd>{selected.reproducibility.fixtureRevision} / {selected.reproducibility.seed}</dd><dt>Environment</dt><dd>{selected.reproducibility.environment}</dd><dt>Model</dt><dd>{selected.agent.model??'None · offline fixture'}</dd></dl>{report&&<><p>{report.summary}</p>{report.limitations.map(l=><p key={l}>{l}</p>)}</>}<button className="text-button" onClick={()=>verifyText(selected.output)}>Check output freshness →</button></div></section></div>}
   </>}
   {page==='/execution/runs'&&!loading&&
    <section className="panel ledger" id="run-ledger" aria-label="Run ledger">
          <div className="panel-heading ledger-heading">
      <div><p className="eyebrow"><EncryptedText text="ARCHIVE"/></p><h2>Saved runs <span>{runs.length}</span></h2></div>
      <div className="ledger-actions">
       <div className="ledger-filters" role="group" aria-label="Filter runs">
        <button type="button" aria-pressed={runFilter==='all'} onClick={()=>setRunFilter('all')}>All</button>
        <button type="button" aria-pressed={runFilter==='recorded'} onClick={()=>setRunFilter('recorded')}>Recorded</button>
        <button type="button" aria-pressed={runFilter==='fixtures'} onClick={()=>setRunFilter('fixtures')}>Fixtures</button>
       </div>
      </div>
     </div>
     <div className="table-scroll" tabIndex={0} aria-label="Scrollable run records"><table>
      <thead><tr><th>Task / agent</th><th>Result</th><th>Tokens in / out</th><th>Duration</th><th>Evidence</th></tr></thead>
      <tbody>{visibleRuns.map((r,i)=><tr key={`${r.id}-${i}`} className={selected?.id===r.id?'selected':''}>
       <td><button className="task-link" onClick={()=>{void inspect(r);navigate('/execution#run-inspector');}}>{r.task.title}</button><small>{r.agent.name}</small>{runBadge(r)}</td>
       <td><span className={`pill ${r.acceptance.status}`}>{r.acceptance.status}</span></td>
       <td>{metric(r.usage.inputTokens)}<small>{metric(r.usage.outputTokens)}</small></td>
       <td>{metric(r.usage.duration)}</td>
       <td><button className="text-button" onClick={()=>{void inspect(r);navigate('/execution#run-inspector');}}>Inspect <ArrowUpRight size={14} aria-hidden="true"/></button></td>
      </tr>)}</tbody>
     </table></div>
     {!visibleRuns.length&&<p className="empty">{runs.length?'No runs match this filter.':caps?.capabilities.execute?'Run the selected task to add a record.':'Execution is unavailable in this mode.'}</p>}
    </section>}
   {page==='/benchmarks'&&<TrackDBench onVerify={verifyText}/>}
   {page==='/benchmarks/routing'&&<><BenchmarkOverview {...benchmark}/><BenchmarkDetails {...benchmark}/></>}
   {page==='/guide'&&<>
    <WorkspaceShowcase navigate={navigate} openVerifier={openVerifier}/>
    <div className="guide-reference">
     <section className="guide-api" aria-labelledby="guide-api-title">
      <header className="showcase-heading"><p className="eyebrow">[ <EncryptedText text="LOCAL ENDPOINTS"/> ]</p><h2 id="guide-api-title" tabIndex={-1}>Local API examples</h2><p>Choose an endpoint and copy its command.</p></header>
      <ApiTerminal/>
     </section>
     <section className="workspace-faq" id="workspace-faq" aria-labelledby="workspace-faq-title">
      <header className="showcase-heading"><p className="eyebrow">[ <EncryptedText text="COMMON QUESTIONS"/> ]</p><h2 id="workspace-faq-title">How ProofBench works</h2></header>
      <details><summary>What is a recorded run?</summary><p>A recorded run stores the task, its execution trace, and the acceptance checks. Offline fixtures exercise the same interface using simulated results.</p></details>
      <details><summary>What does the controlled benchmark compare?</summary><p>It compares routing strategies on the same task with shared tooling. The gauges show governed escalation and direct frontier results from the recorded trials.</p></details>
      <details><summary>What can the verifier check offline?</summary><p>The offline fixture demo can check recognized claims against bundled references. General claim analysis needs live evidence to reach a source-backed verdict.</p></details>
     </section>
    </div>
   </>}
   </div>}
   {(verifierVisited||page==='/verify')&&<div className="workspace-content focused-workspace" hidden={page!=='/verify'}>
    <Verifier key={verifierRevision} initialAnswer={answer}/>
   </div>}
  {page!=='/'&&<footer className="workspace-footer"><strong>ProofBench</strong><span>Execution evidence &amp; source verification</span><span className="footer-right">SHARED CONTRACTS / V1</span></footer>}
  </main>
  {page==='/'&&<OverviewFooter navigate={navigate}/>}
 </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
