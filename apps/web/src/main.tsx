import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {type Capabilities,type RunRecord,type ExecutionTrace,type VerificationReport,type EvidenceReport,type TaskSpec,type UsageRecord,type JobRecord} from '../../../packages/contracts/src/index';
import {api,schemas,modeLabel} from './client';
import {demoRun,demoTrace,demoReport} from '../../../packages/contracts/src/examples';
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
 const [verification,setVerification]=useState<VerificationReport>();const [answer,setAnswer]=useState('Python 2 is currently supported.');
 const [busy,setBusy]=useState(false);const [progress,setProgress]=useState('');const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const [compare,setCompare]=useState(false);
 const [activeJobId,setActiveJobId]=useState<string|null>(null);
 const [monitoringPaused,setMonitoringPaused]=useState(false);
 const pollingRef=useRef<{jobId:string;cancelled:boolean}|null>(null);

 async function inspect(run:RunRecord){
  setSelected(run);setTrace(undefined);setReport(undefined);setError('');
  if(run.id==='demo-run'){setTrace(demoTrace);setReport(demoReport);return;}
  try{
   const [t,r]=await Promise.all([api(`/runs/${run.id}/trace`,schemas.ExecutionTrace),api(`/reports/${run.reportId}`,schemas.EvidenceReport)]);
   setTrace(t);setReport(r);
  }catch(e){setError((e as Error).message);}
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

 async function verify(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');try{
   setVerification(await api('/verify',schemas.VerificationReport,{version:'1',text:answer}));
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const isTavilyLive=Boolean(caps?.limitations.some(l=>l.includes('live web research')));
 return <div className="shell">
  <aside className="sidebar"><a className="brand" href="/" aria-label="ProofBench home"><span className="brandmark">P/</span>ProofBench<span className="beta">0.1</span></a><div className="workspace"><span className="small">WORKSPACE</span><strong>Global AI Hackathon <span>↗</span></strong><small>Team workspace · November 2026</small></div>
  <nav aria-label="Workspace"><button aria-current={tab==='runs'?'page':undefined} onClick={()=>setTab('runs')}><span>▤</span> Execution lab <small>01</small></button><button aria-current={tab==='verify'?'page':undefined} onClick={()=>setTab('verify')}><span>◎</span> Freshness verifier <small>02</small></button></nav>
  <div className="sidebar-bottom"><span className="dot"/> {modeLabel}<p>One Bifrost track.<br/>Evidence at every step.</p><small>Tavily #01 · Permanent module</small></div></aside>
  <main><header className="topbar"><span>Workspace <span className="slash">/</span> {tab==='runs'?'Execution lab':'Freshness verifier'}</span><span className="badge">{caps?.implementation==='mock'?'OFFLINE MOCK':caps?`BIFROST ${caps.implementation}`:'CONNECTING'}</span></header>
  <div className="content"><div className="eyebrow">{tab==='runs'?'EXECUTION & EVIDENCE':isTavilyLive?'TAVILY #01 / LIVE WEB RESEARCH':'TAVILY #01 / ANSWER VERIFICATION'}</div>
  <div className="page-heading">
   <div><h1>{tab==='runs'?'Trust the evidence.':'Check what changed.'}</h1><p>{tab==='runs'?'Inspect completion, usage, and the work behind every result.':'Separate outdated claims from uncertainty, with sources you can inspect.'}</p></div>
   {tab==='runs'&&<div className="task-runner-controls">
    {tasks.length>1&&<select className="task-select" value={selectedTaskId} onChange={e=>setSelectedTaskId(e.target.value)} disabled={busy||loading} aria-label="Select task">
     {tasks.map(t=><option key={t.id} value={t.id}>{t.id}: {t.title}</option>)}
    </select>}
    <button className="primary" disabled={busy||loading||!caps?.capabilities.execute||!tasks.length} onClick={()=>void execute()}>
     {busy?`Running… ${progress}`:caps?.implementation==='mock'?'+ Run fixture':'+ Run task'}
    </button>
    {busy&&<button type="button" className="secondary" onClick={()=>stopMonitoring()} title="Stop monitoring without stopping backend execution">Stop monitoring</button>}
    {monitoringPaused&&activeJobId&&<button type="button" className="secondary" onClick={()=>resumeMonitoring()} title="Resume monitoring active job">Resume monitoring</button>}
   </div>}
  </div>
  <div className="notice"><span>ⓘ</span><div><strong>{tab==='runs'?(caps?.implementation==='mock'?'Offline Development Workspace':'ProofBench Bifrost #01 Execution Workspace'):(isTavilyLive?'Live Tavily Research Mode':'Offline Verification Fixture Mode')}</strong><p>{tab==='runs'?(caps?.implementation==='mock'?'Offline fixture simulation. Runs are deterministic exact-output checks; token usage remains simulated or unmeasured until executed on a live inference host.':'Live model inference & benchmark telemetry. Distinguishes measured live runs (real model inference & token telemetry), curated validation fixtures (co-designed multi-file AST resolution), and controlled simulation baselines.'):(isTavilyLive?'Tavily Search API active. Verifies claims against live web sources with retrieved timestamps and citations.':'Offline reference corpus. Unrecognized claims return inconclusive without making external network calls.')}</p></div></div>
  {error&&<div className="error" role="alert">{error} <button onClick={()=>void connect()}>Retry connection</button></div>}
  {loading?<p role="status" className="empty">Connecting to workspace…</p>:tab==='runs'?<>
  <section className="metrics" aria-label="Run metrics"><article><span>LOCAL RUNS</span><strong>{runs.length.toString().padStart(2,'0')}</strong><small>Discovered from persistent store</small></article><article><span>SELECTED COMPLETION</span><strong className="mint">{selected?.acceptance.status??'Unknown'}</strong><small>{selected?.reproducibility.simulated?'Offline exact-output check':selected?.acceptance.status==='passed'?'Verified live model acceptance':selected?.acceptance.status==='failed'?'Failed acceptance verification':'Awaiting execution evidence'}</small></article><article><span>INPUT TOKENS</span><strong className="smaller">{selected?metric(selected.usage.inputTokens):'Not reported'}</strong><small>Missing usage is never zero</small></article><article><span>ELAPSED TIME</span><strong className="smaller">{selected?metric(selected.usage.duration):'Not reported'}</strong><small>Deterministic wall & execution timing</small></article></section>
  <section className="panel"><div className="panel-heading"><h2>Run ledger <span>{runs.length}</span></h2><button className="secondary" onClick={()=>setCompare(!compare)} aria-pressed={compare}>{compare?'Close comparison':'Compare runs'}</button></div><div className="table-scroll"><table><thead><tr><th>Task / agent</th><th>Result</th><th>Tokens in / out</th><th>Duration</th><th>Evidence</th></tr></thead><tbody>{runs.map((r,i)=><tr key={`${r.id}-${i}`} className={selected?.id===r.id?'selected':''}><td><button className="task-link" onClick={()=>void inspect(r)}>{r.task.title} <span>↗</span></button><small>{r.agent.name}</small>{runBadge(r)}</td><td><span className="pill">{r.acceptance.status}</span></td><td>{metric(r.usage.inputTokens)}<small>{metric(r.usage.outputTokens)}</small></td><td>{metric(r.usage.duration)}</td><td><button className="text-button" onClick={()=>void inspect(r)}>Inspect →</button></td></tr>)}</tbody></table></div>{!runs.length&&<div className="empty">No runs yet. {caps?.capabilities.execute?'Run the published fixture to get started.':'Farhan’s selected adapter is not integrated; verification remains available.'}</div>}</section>
  {compare&&<section className="panel comparison"><h2>Comparison</h2><p>Compare only observations with matching scope, provider, tokenizer and method. Missing or incomparable telemetry cannot be ranked.</p>
  <div className="bench-card">
  <table className="bench-table"><thead><tr><th>Strategy / Policy</th><th>Success Rate</th><th>Total Tokens</th><th>Wall Time</th><th>Routing Architecture</th></tr></thead>
  <tbody>
  <tr><td><strong>Direct Frontier (Qwen 9B)</strong></td><td><span className="pill">100% (1/1)</span></td><td>7,766 tokens</td><td>168.3s</td><td>Direct frontier inference only</td></tr>
  <tr><td><strong>Governed Escalation Only</strong></td><td><span className="pill mint">100% (1/1)</span></td><td><strong>4,461 tokens</strong></td><td>63.5s</td><td>Small ➔ Frontier M3a autopsy (<span className="mint">-3,305 tokens, -42.5%</span>)</td></tr>
  <tr><td><strong>Bidirectional Adaptive Policy</strong></td><td><span className="pill">100% (1/1)</span></td><td>6,215 tokens</td><td>75.2s</td><td>Small ⇄ Frontier bounded delegation</td></tr>
  <tr><td><strong>Direct Small (Qwen 1.5B)</strong></td><td><span className="pill contradicted">0% (0/1)</span></td><td>2,500 tokens</td><td>7.8s</td><td>Failed (exponential backoff math incorrect)</td></tr>
  </tbody>
  </table>
  <p className="bench-note"><strong>Controlled Routing Benchmark on Frozen Task 2:</strong> Equalized AST tools (Tree-sitter context selector, mechanical transformer, approval engine) across all arms. Model escalation saved 3,305 tokens (42.5%) over direct frontier. Downward delegation was not exercised in this task. Single-trial empirical observation, not a universal ranking.</p>
  </div>
  </section>}
  {selected&&<div className="detail-grid"><section className="panel"><div className="panel-heading"><h2>Execution trace</h2><span className="small">{selected.id==='demo-run'?'DEMO PREVIEW':`${trace?.events.length??0} EVENTS`}</span></div>{trace?<ol className="timeline">{trace.events.map(e=><li key={e.sequence}><span>{String(e.sequence+1).padStart(2,'0')}</span><div><strong>{e.type}</strong><p>{e.message}</p><small>{e.at}</small></div></li>)}</ol>:<p className="empty">{selected.id==='demo-run'?'Run a fixture to inspect its recorded trace.':'Trace unavailable or loading.'}</p>}</section><section className="panel"><div className="panel-heading"><h2>Acceptance & provenance</h2><span className="mint">↗</span></div><div className="provenance">{selected.acceptance.checks.map(c=><div key={c.name}><strong>{c.passed===null?'?':c.passed?'✓':'×'} {c.name}</strong><p>{c.evidence}</p></div>)}<dl><dt>Adapter revision</dt><dd>{selected.reproducibility.adapterRevision}</dd><dt>Fixture / seed</dt><dd>{selected.reproducibility.fixtureRevision} / {selected.reproducibility.seed}</dd><dt>Environment</dt><dd>{selected.reproducibility.environment}</dd><dt>Model</dt><dd>{selected.agent.model??'None · offline fixture'}</dd></dl>{report&&<><p>{report.summary}</p>{report.limitations.map(l=><p key={l}>{l}</p>)}</>}<button className="text-button" onClick={()=>{setAnswer(selected.output);setTab('verify');}}>Check output freshness →</button></div></section></div>}
  </>:<div className="verify-grid"><section className="panel"><div className="panel-heading"><h2>Answer to verify</h2><span className="small">{isTavilyLive?'LIVE RESEARCH':'OFFLINE'}</span></div><form onSubmit={e=>void verify(e)}><label htmlFor="answer">Paste an answer or factual statement</label><textarea id="answer" value={answer} onChange={e=>setAnswer(e.target.value)} maxLength={20000} required rows={8}/><div style={{display:'flex',gap:8,margin:'10px 0'}}><button type="button" className="secondary" onClick={()=>setAnswer('Python 2 is currently supported.')}>Try: Python 2 sunset (stale)</button><button type="button" className="secondary" onClick={()=>setAnswer('Python 2 officially reached end-of-life on January 1, 2020.')}>Try: Python 2 EOL 2020 (current)</button></div><div className="form-footer"><small>{answer.length.toLocaleString()} / 20,000 characters</small><button className="primary" disabled={busy||!answer.trim()}>{busy?'Checking…':'Verify answer →'}</button></div></form></section><section className="panel findings"><div className="panel-heading"><h2>Freshness findings</h2><span className="small">{verification?.claims.length??0} CLAIMS</span></div>{!verification?<p className="empty">Verify an answer to inspect claims, uncertainty, and reference sources.</p>:verification.claims.map(c=><article key={c.id}><div className="finding-status"><span className={`pill ${c.outcome}`}>{c.outcome}</span><span>{c.freshness}</span></div><h3>{c.text}</h3><p>{c.uncertainty}</p>{c.evidence.map(e=><a key={e.url} href={e.url} target="_blank" rel="noreferrer">{e.title} ↗<small>{e.excerpt}</small></a>)}<small>Assessment: {new Date(c.asOf).toLocaleString()} · {verification.mode}</small></article>)}</section></div>}
  <footer>ProofBench <span>/</span> Shared contracts v1 <span>/</span> Bifrost selection pending <span className="footer-right">BUILD WITH RECEIPTS.</span></footer></div></main>
 </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
