import Fastify from 'fastify';
import {z,ZodError} from 'zod';
import {RunRequest,VerifyRequest,RunRecord,ExecutionTrace,EvidenceReport,VerificationReport,Capabilities,UnsupportedCapability} from '../../../packages/contracts/src/index';
import {task} from '../../../packages/contracts/src/examples';
import {selectAdapter} from '../../../packages/agent-adapters/src/index';
import {SearchBudget,TavilyConfigurationError,verifyAnswer} from '../../../packages/tavily/src/index';
import {buildReport} from '../../../packages/report-engine/src/index';
import {JsonStore} from './store';
export async function createApp(options:{dataDir?:string;implementation?:string;tavilyMode?:string}={}){
 const adapter=selectAdapter(options.implementation??process.env.BIFROST_IMPLEMENTATION??'mock');
 const store=new JsonStore(options.dataDir??process.env.DATA_DIR??'.local/data');
 const tavilyBudget=new SearchBudget();
 const app=Fastify({logger:false,bodyLimit:128*1024});
 app.setErrorHandler((error,_request,reply)=>{
  if(error instanceof ZodError)return reply.code(400).send({version:'1',error:'invalid_request',details:error.issues.map(i=>({path:i.path,message:i.message}))});
  if(error instanceof TavilyConfigurationError)return reply.code(error.statusCode).send({version:'1',error:'invalid_request',message:error.message});
  if(error instanceof UnsupportedCapability)return reply.code(501).send({version:'1',error:'unsupported_capability',message:error.message});
  if(error instanceof Error && 'statusCode' in error && typeof error.statusCode==='number' && error.statusCode<500)return reply.code(error.statusCode).send({version:'1',error:'invalid_request'});
  return reply.code(500).send({version:'1',error:'internal_error'});
 });
 app.get('/api/health',async()=>({version:'1',status:'ok'}));
 app.get('/api/capabilities',async()=>Capabilities.parse({version:'1',implementation:adapter.descriptor.implementation,agent:adapter.descriptor,capabilities:adapter.capabilities,limitations:['Tavily is offline fixture mode; arbitrary claims are inconclusive.','Native execution is not integrated.',...(adapter.descriptor.implementation==='mock'?['Runs are simulated fixture checks, not model measurements.']:['Selected Bifrost implementation is not integrated.'])]}));
 app.get('/api/benchmarks',async()=>{
  if(!adapter.capabilities.benchmarks)throw new UnsupportedCapability('Benchmark catalog not integrated for selected adapter');
  return {version:'1',tasks:[task]};
 });
 app.post('/api/verify',async(request,reply)=>{
  const result=await verifyAnswer(VerifyRequest.parse(request.body),{mode:options.tavilyMode,budget:tavilyBudget});await store.put('verify',result.id,result);return reply.code(201).send(result);
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
 const read=<T>(path:string,kind:string,schema:z.ZodType<T>)=>app.get<{Params:{id:string}}>(path,async(req,reply)=>{
  z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).parse(req.params.id);
  const result=await store.get(kind,req.params.id,schema);return result??reply.code(404).send({version:'1',error:'not_found'});
 });
 read('/api/verify/:id','verify',VerificationReport);read('/api/runs/:id','runs',RunRecord);read('/api/runs/:id/trace','trace',ExecutionTrace);read('/api/reports/:id','reports',EvidenceReport);
 return app;
}
