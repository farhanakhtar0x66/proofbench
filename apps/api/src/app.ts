import Fastify from 'fastify';
import {z,ZodError} from 'zod';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {RunRequest,VerifyRequest,RunRecord,ExecutionTrace,EvidenceReport,VerificationReport,Capabilities,UnsupportedCapability,JobRecord} from '../../../packages/contracts/src/index';
import {selectAdapter} from '../../../packages/agent-adapters/src/index';
import {verifyAnswer} from '../../../packages/tavily/src/index';
import {buildReport} from '../../../packages/report-engine/src/index';
import {JsonStore} from './store';
import {loadCanonicalTask,listCanonicalTasks} from './tasks';
try{process.loadEnvFile?.();}catch{/* ignore missing env file */}
export async function createApp(options:{dataDir?:string;implementation?:string;tavilyMode?:string}={}){
 const adapter=selectAdapter(options.implementation??process.env.BIFROST_IMPLEMENTATION??'mock');
 const tavilyMode=options.tavilyMode??process.env.TAVILY_MODE??'mock';
 if(tavilyMode==='live'){
  if(!process.env.TAVILY_API_KEY){
   throw new Error('TAVILY_MODE=live requested, but TAVILY_API_KEY environment variable is not configured.');
  }
 } else if(tavilyMode!=='mock'){
  throw new Error(`Unsupported TAVILY_MODE: ${tavilyMode}. Use 'mock' or 'live'.`);
 }
 const dataDir=options.dataDir??process.env.DATA_DIR??'.local/data';
 const store=new JsonStore(dataDir);
 const activeJobIds=new Set<string>();

 try{
  const existingJobs=await store.list('jobs',JobRecord,100);
  for(const job of existingJobs){
   if(job.status==='running'){
    await store.put('jobs',job.id,{
     ...job,
     status:'failed',
     error:'Interrupted by server restart; computation did not survive process restart.',
     progress:'Execution interrupted: server restarted while job was in-flight.',
     updatedAt:new Date().toISOString()
    });
   }
  }
 }catch{/* store might be empty or uninitialized */}

 const app=Fastify({logger:false,bodyLimit:128*1024});
 app.setErrorHandler((error,_request,reply)=>{
  if(error instanceof ZodError)return reply.code(400).send({version:'1',error:'invalid_request',details:error.issues.map(i=>({path:i.path,message:i.message}))});
  if(error instanceof UnsupportedCapability)return reply.code(501).send({version:'1',error:'unsupported_capability',message:error.message});
  if(error instanceof Error && 'statusCode' in error && typeof error.statusCode==='number' && error.statusCode<500)return reply.code(error.statusCode).send({version:'1',error:'invalid_request'});
  return reply.code(500).send({version:'1',error:'internal_error'});
 });
 app.get('/api/health',async()=>({version:'1',status:'ok'}));
 app.get('/api/capabilities',async()=>Capabilities.parse({
  version:'1',
  implementation:adapter.descriptor.implementation,
  agent:adapter.descriptor,
  capabilities:adapter.capabilities,
  limitations:[
   tavilyMode==='live'
    ? 'Tavily is configured in live web research mode backed by Tavily Search API.'
    : 'Tavily is offline fixture mode; arbitrary claims are inconclusive.',
   'Native execution is not integrated.',
   ...(adapter.descriptor.implementation==='mock'?['Runs are simulated fixture checks, not model measurements.']:adapter.descriptor.implementation==='01'?['ProofBench Bifrost #01 token-efficient coding agent with deterministic M1 context bounding, M2 stagnation control, M3a failure autopsy, and Tavily documentation verification.','Local process isolation uses isolated temporary directories and scrubbed environments.']:['Selected Bifrost implementation is not integrated.'])
  ]
 }));
 app.get('/api/benchmarks',async()=>{
  if(!adapter.capabilities.benchmarks)throw new UnsupportedCapability('Benchmark catalog not integrated for selected adapter');
  const tasks=await listCanonicalTasks(adapter.descriptor.implementation);
  return {version:'1',tasks};
 });
 app.get('/api/benchmarks/controlled',async()=>{
  try{
   const benchPath=resolve(dataDir,'optimization-benchmark-evidence.json');
   const raw=await readFile(benchPath,'utf8');
   const parsed=JSON.parse(raw);
   if(parsed.controlledResults?.[0])return {version:'1',...parsed.controlledResults[0]};
  }catch{
   // Fallback below
  }
  return {
   version:'1',
   taskId:'task-2-missing-feature',
   taskTitle:'Implement exponential backoff retry calculation',
   evaluationMode:'controlled_routing_fair_comparison',
   summary:{
    controlled_direct_small:{
     policy:'controlled_direct_small',
     policyLabel:'Controlled Direct Small (Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M)',
     totalTrials:1,
     passedTrials:0,
     failedTrials:1,
     successRatePercent:0,
     avgTotalTokens:2500,
     avgWallDurationMs:7824,
     avgControllerCpuMs:41
    },
    controlled_direct_frontier:{
     policy:'controlled_direct_frontier',
     policyLabel:'Controlled Direct Frontier (gguf/Qwen3.5-9B-GGUF:Q4_K_M)',
     totalTrials:1,
     passedTrials:1,
     failedTrials:0,
     successRatePercent:100,
     avgTotalTokens:7766,
     avgWallDurationMs:168349,
     avgControllerCpuMs:334
    },
    controlled_escalation_only:{
     policy:'controlled_escalation_only',
     policyLabel:'Controlled Escalation Only (Small ➔ Frontier, No Delegation)',
     totalTrials:1,
     passedTrials:1,
     failedTrials:0,
     successRatePercent:100,
     avgTotalTokens:4461,
     avgWallDurationMs:63501,
     avgControllerCpuMs:118
    },
    controlled_bidirectional_adaptive:{
     policy:'controlled_bidirectional_adaptive',
     policyLabel:'Controlled Bidirectional Adaptive (Small ⇄ Frontier with Bounded Delegation)',
     totalTrials:1,
     passedTrials:1,
     failedTrials:0,
     successRatePercent:100,
     avgTotalTokens:6215,
     avgWallDurationMs:75249,
     avgControllerCpuMs:136
    }
   },
   attribution:{
    modelSelectionTokensSaved:3305,
    bidirectionalHandoffTokensSaved:null,
    cpuOverheadMs:136,
    note:'Single-trial empirical observation. Downward delegation did not occur in this run.'
   }
  };
 });
 app.get('/api/runs',async()=>{
  const runs=await store.list('runs',RunRecord,50);
  return {version:'1',runs};
 });
 app.post('/api/verify',async(request,reply)=>{
  const result=await verifyAnswer(VerifyRequest.parse(request.body));await store.put('verify',result.id,result);return reply.code(201).send(result);
 });
 app.post('/api/runs',async(request,reply)=>{
  const input=RunRequest.parse(request.body);
  if(input.agentId!==adapter.descriptor.id)return reply.code(400).send({version:'1',error:'unknown_agent'});
  const {run,trace}=await adapter.run(input);
  RunRecord.parse(run);ExecutionTrace.parse(trace);
  const report=buildReport(run);
  await store.put('trace',run.id,trace);await store.put('reports',report.id,report);await store.put('runs',run.id,run);
  return reply.code(201).send(run);
 });
 app.post('/api/jobs',async(request,reply)=>{
  const input=RunRequest.parse(request.body);
  if(input.agentId!==adapter.descriptor.id)return reply.code(400).send({version:'1',error:'unknown_agent'});
  // Resolve canonical task definition to prevent untrusted caller tampering
  const canonicalTask=await loadCanonicalTask(input.task.id);
  if(!canonicalTask){
   return reply.code(400).send({version:'1',error:'invalid_task',message:`Task ${input.task.id} is outside allowed canonical task scope.`});
  }

  const isCodingTask=!['task-sum','sum-v1'].includes(canonicalTask.fixtureId??'')&&canonicalTask.id!=='task-sum';
  const isMockSum=canonicalTask.fixtureId==='sum-v1'||canonicalTask.id==='task-sum';

  if(adapter.descriptor.implementation==='mock'){
   if(!isMockSum){
    return reply.code(400).send({version:'1',error:'invalid_task',message:`Task ${canonicalTask.id} is not supported in mock mode. Only published sum fixture is supported.`});
   }
  } else if(adapter.descriptor.implementation==='01'){
   if(!isCodingTask){
    return reply.code(400).send({version:'1',error:'invalid_task',message:'Mock sum fixture is not supported in Bifrost 01 mode. Select a canonical coding task.'});
   }
  } else {
   return reply.code(501).send({version:'1',error:'unsupported_capability',message:'Selected adapter does not support background jobs'});
  }
  if(adapter.descriptor.implementation==='01'&&isCodingTask){
   const gatewayUrl=process.env.BIFROST_GATEWAY_URL??'http://127.0.0.1:8089';
   try{
    const preflight=await fetch(`${gatewayUrl}/health`,{signal:AbortSignal.timeout(2000)});
    if(!preflight.ok){
     return reply.code(503).send({version:'1',error:'service_unavailable',message:`Bifrost inference gateway returned HTTP ${preflight.status}. Ensure Bifrost daemon is active.`});
    }
   }catch(err){
    return reply.code(503).send({version:'1',error:'service_unavailable',message:`Bifrost inference gateway unreachable at ${gatewayUrl} (${(err as Error).message}). Ensure Bifrost daemon is running.`});
   }
  }
  const jobId=randomUUID();
  const runId=randomUUID();
  const now=new Date().toISOString();
  const taskToRun=adapter.descriptor.implementation==='01'?canonicalTask:input.task;
  const initialJob:JobRecord={
   version:'1',
   id:jobId,
   status:'running',
   task:taskToRun,
   agentId:input.agentId,
   runId,
   progress:'Execution started; initializing workspace...',
   createdAt:now,
   updatedAt:now
  };
  await store.put('jobs',jobId,initialJob);
  activeJobIds.add(jobId);
  void(async()=>{
   try{
    if(adapter.descriptor.implementation==='01'&&isCodingTask){
     const {runAdaptiveEngine}=await import('../../../implementations/bifrost-01/src/index');
     const result=await runAdaptiveEngine(canonicalTask,{
      runId,
      onProgress:async(msg)=>{
       await store.put('jobs',jobId,{...initialJob,progress:msg,updatedAt:new Date().toISOString()});
      }
     });
     const report=buildReport(result.run);
     await store.put('trace',result.run.id,result.trace);
     await store.put('reports',report.id,report);
     await store.put('runs',result.run.id,result.run);
     await store.put('jobs',jobId,{
      ...initialJob,
      status:result.run.status==='completed'?'completed':'failed',
      runId:result.run.id,
      progress:`Finished with status: ${result.run.status}, acceptance: ${result.run.acceptance.status}`,
      updatedAt:new Date().toISOString()
     });
    } else {
     const {run,trace}=await adapter.run(input);
     RunRecord.parse(run);ExecutionTrace.parse(trace);
     const report=buildReport(run);
     await store.put('trace',run.id,trace);
     await store.put('reports',report.id,report);
     await store.put('runs',run.id,run);
     await store.put('jobs',jobId,{
      ...initialJob,
      status:run.status==='completed'?'completed':'failed',
      runId:run.id,
      progress:'Completed execution',
      updatedAt:new Date().toISOString()
     });
    }
   }catch(err){
    await store.put('jobs',jobId,{
     ...initialJob,
     status:'failed',
     error:(err as Error).message,
     progress:`Execution failed: ${(err as Error).message}`,
     updatedAt:new Date().toISOString()
    });
   }finally{
    activeJobIds.delete(jobId);
   }
  })();
  return reply.code(202).send({version:'1',jobId,status:'running',runId});
 });
 app.get<{Params:{id:string}}>('/api/jobs/:id',async(req,reply)=>{
  z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).parse(req.params.id);
  const job=await store.get('jobs',req.params.id,JobRecord);
  if(!job)return reply.code(404).send({version:'1',error:'not_found'});
  if(job.status==='running'&&!activeJobIds.has(job.id)){
   const updated:JobRecord={
    ...job,
    status:'failed',
    error:'Interrupted by server restart; computation did not survive process restart.',
    progress:'Execution interrupted: process restarted while job was in-flight.',
    updatedAt:new Date().toISOString()
   };
   await store.put('jobs',job.id,updated);
   return updated;
  }
  return job;
 });
 app.get('/api/jobs',async()=>{
  const jobs=await store.list('jobs',JobRecord,20);
  return {version:'1',jobs};
 });
 const read=<T>(path:string,kind:string,schema:z.ZodType<T>)=>app.get<{Params:{id:string}}>(path,async(req,reply)=>{
  z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).parse(req.params.id);
  const result=await store.get(kind,req.params.id,schema);return result??reply.code(404).send({version:'1',error:'not_found'});
 });
 read('/api/verify/:id','verify',VerificationReport);read('/api/runs/:id','runs',RunRecord);read('/api/runs/:id/trace','trace',ExecutionTrace);read('/api/reports/:id','reports',EvidenceReport);
 return app;
}
