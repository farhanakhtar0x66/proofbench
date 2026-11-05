import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {type Capabilities,type RunRecord,type ExecutionTrace,type EvidenceReport,type TaskSpec,type UsageRecord,type JobRecord} from '../../../packages/contracts/src/index';
import {api,schemas} from './client';
import {demoRun,demoTrace,demoReport} from '../../../packages/contracts/src/examples';
import {Verifier} from './Verifier';
import { Activity, ArrowUpRight, CirclePlay, Radar, ScanLine, Workflow } from 'lucide-react';
import { EvidenceMap } from './EvidenceMap';
import { BenchmarkDetails, BenchmarkOverview, useControlledBenchmark } from './ControlledBenchmark';
import { PortalArt } from './PresentationArt';
import { ApiTerminal, WorkspaceShowcase, type VerifierDestination } from './WorkspaceShowcase';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './style.css';

const ACTIVE_JOB_KEY='proofbench_active_job_id';

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
 const [tab,setTab]=useState<'runs'|'verify'>('runs');const [caps,setCaps]=useState<Capabilities>();
 const [tasks,setTasks]=useState<TaskSpec[]>([]);const [selectedTaskId,setSelectedTaskId]=useState<string>('');
 const [runs,setRuns]=useState<RunRecord[]>([]);
 const [selected,setSelected]=useState<RunRecord>();const [trace,setTrace]=useState<ExecutionTrace>();const [report,setReport]=useState<EvidenceReport>();
 const [answer,setAnswer]=useState('Python 2 is currently supported.');
 const [busy,setBusy]=useState(false);const [progress,setProgress]=useState('');const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const [compare,setCompare]=useState(false);
 const [verifierDestination,setVerifierDestination]=useState<VerifierDestination>();
 const benchmark=useControlledBenchmark(Boolean(caps));

 function openVerifier(destination:VerifierDestination) {
  setReplayRequest(undefined);
  setVerifierDestination(destination);
  setTab('verify');
 }

 useEffect(()=>{
  if(tab!=='verify'||loading||!verifierDestination)return;
  const target=document.getElementById(verifierDestination);
  if(target instanceof HTMLDetailsElement)target.open=true;
  target?.focus({preventScroll:true});
  target?.scrollIntoView({block:'start'});
  setVerifierDestination(undefined);
 },[tab,loading,verifierDestination]);
 const [runFilter,setRunFilter]=useState<'all'|'recorded'|'fixtures'>('all');
 const [replayRequest,setReplayRequest]=useState<{runId:string;sequence:number}>();
 const replaySequence=useRef(0);
 const [activeJobId,setActiveJobId]=useState<string|null>(null);
 const [monitoringPaused,setMonitoringPaused]=useState(false);
 const inspectionRef=useRef(0);
 const pollingRef=useRef<{jobId:string;cancelled:boolean}|null>(null);

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
    if(pollSession.cancelled){
     setProgress('Monitoring stopped by user.');
     return;
    }
    await new Promise(r=>setTimeout(r,1500));
    if(pollSession.cancelled)return;
    iteration++;

    let job:JobRecord;
    try{
     job=await api(`/jobs/${jobId}`,schemas.JobRecord);
     consecutiveErrors=0;
    }catch(err){
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
  }finally{
   if(pollingRef.current===pollSession){
    setBusy(false);
    if(!monitoringPaused)setProgress('');
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

 useEffect(()=>{void connect();},[]);

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
 const mode = isMock ? 'Offline mock' : caps ? `Bifrost ${caps.implementation}` : loading ? 'Connecting' : 'Disconnected';

 return <div className="shell">
  <div className="system-banner"><span>PROOFBENCH / LOCAL WORKSPACE</span><a href="#workspace">OPEN WORKSPACE <ArrowUpRight size={12} aria-hidden="true"/></a></div>
  <header className="masthead">
   <div className="masthead-inner">
    <a className="brand" href="/" aria-label="ProofBench home"><span className="brandmark"><ScanLine size={20} aria-hidden="true"/></span>ProofBench</a>
    <nav aria-label="Workspace">
     <button aria-current={tab==='runs'?'page':undefined} onClick={()=>{setTab('runs');window.scrollTo(0,0);}}><Workflow size={15} aria-hidden="true"/> Execution lab</button>
     <button aria-current={tab==='verify'?'page':undefined} onClick={()=>{setReplayRequest(undefined);setTab('verify');window.scrollTo(0,0);}}><Radar size={15} aria-hidden="true"/> Freshness verifier</button>
     {tab==='runs'&&<><a href="#controlled-benchmark">Benchmarks</a><a href="#workspace-features">Features</a></>}
    </nav>
    <span className="badge"><span className="dot" aria-hidden="true"/>{mode}</span>
   </div>
  </header>
  <main className="content">
   <section className="page-heading">
    <PortalArt key={tab}/>
    <p className="eyebrow hero-kicker">[ {tab==='runs'?'EXECUTION & EVIDENCE':'FRESHNESS VERIFICATION'} ]</p>
    <h1>{tab==='runs'?<>Trust the<br/>evidence.</>:<>Check what<br/>changed.</>}</h1>
    <p className="hero-description">{tab==='runs'?'Trace a coding run from model routing to the final acceptance check.':'Check factual claims against sources you can inspect.'}</p>
    {tab==='runs'&&<div className="task-runner-controls">
     {featuredRun&&<button className="replay-cta" type="button" onClick={replayFeatured} disabled={busy||loading}>
      <CirclePlay size={18} aria-hidden="true"/> Replay recorded run
     </button>}
     {tasks.length>1&&<select className="task-select" value={selectedTaskId} onChange={e=>setSelectedTaskId(e.target.value)} disabled={busy||loading} aria-label="Select task">
      {tasks.map(t=><option key={t.id} value={t.id}>{t.id}: {t.title}</option>)}
     </select>}
     <button className="primary" disabled={busy||loading||!caps?.capabilities.execute||!tasks.length} onClick={()=>void execute()}>
      {busy?<><Activity size={16} aria-hidden="true"/> Running…</>:isMock?'+ Run fixture':'+ Run task'}
     </button>
     {busy&&activeJobId&&<button type="button" className="secondary" onClick={stopMonitoring} title="Stop monitoring without stopping backend execution">Stop monitoring</button>}
     {monitoringPaused&&activeJobId&&<button type="button" className="secondary" onClick={resumeMonitoring} title="Resume monitoring active job">Resume monitoring</button>}
    </div>}
    {tab==='verify'&&<a className="primary hero-link" href="#workspace">Open verifier <ArrowUpRight size={14} aria-hidden="true"/></a>}
    <ApiTerminal key={tab} defaultTab={tab}/>
   </section>
   <div className="workspace-content" id="workspace">
   {tab==='runs'&&progress&&<p className="job-progress" role="status">{progress}</p>}
   {error&&<div className="error" role="alert">{error} <button onClick={()=>void connect()}>Retry connection</button></div>}
   {loading?<p role="status" className="empty">Connecting to workspace…</p>:tab==='runs'?<>
    <p className="section-caption">[ RUN METRICS AT A GLANCE ]</p>
    <section className="metrics" aria-label="Run metrics">
     <article><span>LOCAL RUNS</span><strong>{runs.length.toString().padStart(2,'0')}</strong><small>Records in the ledger</small></article>
     <article><span>ACCEPTANCE</span><strong className={selected?.acceptance.status==='passed'?'mint':selected?.acceptance.status==='failed'?'status-failed':''}>{selected?.acceptance.status??'Unknown'}</strong><small>{selected?.reproducibility.simulated?'Offline exact-output check':'Recorded acceptance status'}</small></article>
     <article><span>INPUT TOKENS</span><strong className="smaller">{selected?metric(selected.usage.inputTokens):'Not reported'}</strong><small>From the selected run</small></article>
     <article><span>ELAPSED TIME</span><strong className="smaller">{selected?metric(selected.usage.duration):'Not reported'}</strong><small>From the selected run</small></article>
    </section>
    <EvidenceMap key={selected?.id??'empty'} run={selected} trace={trace} replayToken={replayRequest?.runId===selected?.id?replayRequest?.sequence:undefined}/>
    <BenchmarkOverview {...benchmark}/>
    <WorkspaceShowcase hasRun={Boolean(selected)} openVerifier={openVerifier}/>
    <section className="panel ledger" id="run-ledger" aria-label="Run ledger">
          <div className="panel-heading ledger-heading">
      <div><p className="eyebrow">ARCHIVE</p><h2>Run ledger <span>{runs.length}</span></h2></div>
      <div className="ledger-actions">
       <div className="ledger-filters" role="group" aria-label="Filter runs">
        <button type="button" aria-pressed={runFilter==='all'} onClick={()=>setRunFilter('all')}>All</button>
        <button type="button" aria-pressed={runFilter==='recorded'} onClick={()=>setRunFilter('recorded')}>Recorded</button>
        <button type="button" aria-pressed={runFilter==='fixtures'} onClick={()=>setRunFilter('fixtures')}>Fixtures</button>
       </div>
       <button className="secondary" onClick={()=>setCompare(!compare)} aria-pressed={compare}>{compare?'Close comparison':'Compare runs'}</button>
      </div>
     </div>
     <div className="table-scroll" tabIndex={0} aria-label="Scrollable run records"><table>
      <thead><tr><th>Task / agent</th><th>Result</th><th>Tokens in / out</th><th>Duration</th><th>Evidence</th></tr></thead>
      <tbody>{visibleRuns.map((r,i)=><tr key={`${r.id}-${i}`} className={selected?.id===r.id?'selected':''}>
       <td><button className="task-link" aria-pressed={selected?.id===r.id} onClick={()=>void inspect(r)}>{r.task.title}</button><small>{r.agent.name}</small>{runBadge(r)}</td>
       <td><span className={`pill ${r.acceptance.status}`}>{r.acceptance.status}</span></td>
       <td>{metric(r.usage.inputTokens)}<small>{metric(r.usage.outputTokens)}</small></td>
       <td>{metric(r.usage.duration)}</td>
       <td><button className="text-button" onClick={()=>{void inspect(r);document.getElementById('run-inspector')?.scrollIntoView({block:'nearest'});}}>Inspect <ArrowUpRight size={14} aria-hidden="true"/></button></td>
      </tr>)}</tbody>
     </table></div>
     {!visibleRuns.length&&<p className="empty">{runs.length?'No runs match this filter.':caps?.capabilities.execute?'Run the selected task to add a record.':'Execution is unavailable in this mode.'}</p>}
    </section>
  {compare&&<BenchmarkDetails {...benchmark}/>}
  {selected&&<div className="detail-grid"><section className="panel" id="execution-trace"><div className="panel-heading"><h2>Execution trace</h2><span className="small">{selected.id==='demo-run'?'DEMO PREVIEW':`${trace?.events.length??0} EVENTS`}</span></div>{trace?<ol className="timeline">{trace.events.map(e=><li key={e.sequence}><span>{String(e.sequence+1).padStart(2,'0')}</span><div><strong>{e.type}</strong><p>{e.message}</p><small>{e.at}</small></div></li>)}</ol>:<p className="empty">{selected.id==='demo-run'?'Run a fixture to inspect its recorded trace.':'Trace unavailable or loading.'}</p>}</section><section className="panel"><div className="panel-heading"><h2>Acceptance & provenance</h2><span className="mint">↗</span></div><div className="provenance">{selected.acceptance.checks.map(c=><div key={c.name}><strong>{c.passed===null?'?':c.passed?'✓':'×'} {c.name}</strong><p>{c.evidence}</p></div>)}<dl><dt>Adapter revision</dt><dd>{selected.reproducibility.adapterRevision}</dd><dt>Fixture / seed</dt><dd>{selected.reproducibility.fixtureRevision} / {selected.reproducibility.seed}</dd><dt>Environment</dt><dd>{selected.reproducibility.environment}</dd><dt>Model</dt><dd>{selected.agent.model??'None · offline fixture'}</dd></dl>{report&&<><p>{report.summary}</p>{report.limitations.map(l=><p key={l}>{l}</p>)}</>}<button className="text-button" onClick={()=>{setAnswer(selected.output);openVerifier('verification-input');}}>Check output freshness →</button></div></section></div>}
  </>:<Verifier initialAnswer={answer} onBusyChange={setBusy}/>}
   </div>
  <section className="workspace-faq" aria-labelledby="workspace-faq-title">
   <header className="showcase-heading"><p className="eyebrow">[ WORKSPACE GUIDE ]</p><h2 id="workspace-faq-title">How ProofBench works</h2></header>
   <details><summary>What is a recorded run?</summary><p>A recorded run stores the task, its execution trace, and the acceptance checks. Offline fixtures exercise the same interface using simulated results.</p></details>
   <details><summary>What does the controlled benchmark compare?</summary><p>It compares routing strategies on the same task with shared tooling. The gauges show governed escalation and direct frontier results from the recorded trials.</p></details>
   <details><summary>What can the verifier check offline?</summary><p>The offline fixture demo can check recognized claims against bundled references. General claim analysis needs live evidence to reach a source-backed verdict.</p></details>
  </section>
  <footer><strong>ProofBench</strong><span>Execution evidence &amp; source verification</span><span className="footer-right">SHARED CONTRACTS / V1</span></footer>
  </main>
 </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);