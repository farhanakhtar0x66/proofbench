import Fastify from 'fastify';
import {z,ZodError} from 'zod';
import {RunRequest,VerifyRequest,RunRecord,ExecutionTrace,EvidenceReport,VerificationReport,Capabilities,UnsupportedCapability,ClaimExtractionRequest,EvidenceRetrievalRequest} from '../../../packages/contracts/src/index';
import {task} from '../../../packages/contracts/src/examples';
import {selectAdapter} from '../../../packages/agent-adapters/src/index';
import {SearchBudget,TavilyConfigurationError,verifyAnswer} from '../../../packages/tavily/src/index';
import {buildReport} from '../../../packages/report-engine/src/index';
import {JsonStore} from './store';
import {createLanguageInterpreter} from '../../../packages/tavily/src/language-provider';
import {extractFactualClaims} from '../../../packages/tavily/src/claim-extraction';
import {retrieveClaimEvidence} from '../../../packages/tavily/src/general-retrieval';
import {compareClaimEvidence} from '../../../packages/tavily/src/evidence-comparison';
export async function createApp(options:{dataDir?:string;implementation?:string;tavilyMode?:string}={}){
 const adapter=selectAdapter(options.implementation??process.env.BIFROST_IMPLEMENTATION??'mock');
 const tavilyMode=options.tavilyMode??process.env.TAVILY_MODE??'mock';
 if(!['mock','live'].includes(tavilyMode))throw new TavilyConfigurationError('TAVILY_MODE must be mock or live.');
 const store=new JsonStore(options.dataDir??process.env.DATA_DIR??'.local/data');
 const tavilyBudget=new SearchBudget();
 const interpreter=createLanguageInterpreter();
 const extractionMode=z.enum(['rules','llm']).parse(process.env.CLAIM_EXTRACTION_MODE??'rules');
 const comparisonMode=z.enum(['rules','llm']).parse(process.env.EVIDENCE_COMPARISON_MODE??'rules');
 const app=Fastify({logger:false,bodyLimit:128*1024});
 app.setErrorHandler((error,_request,reply)=>{
  if(error instanceof ZodError)return reply.code(400).send({version:'1',error:'invalid_request',message:'Request validation failed. Use version "1", a nonempty text field of at most 20,000 characters, and at most 50 optional claims.',details:error.issues.map(i=>({path:i.path,message:i.message}))});
  if(error instanceof TavilyConfigurationError)return reply.code(error.statusCode).send({version:'1',error:'invalid_request',message:error.message});
  if(error instanceof UnsupportedCapability)return reply.code(501).send({version:'1',error:'unsupported_capability',message:error.message});
  if(error instanceof Error && 'statusCode' in error && typeof error.statusCode==='number' && error.statusCode<500)return reply.code(error.statusCode).send({version:'1',error:'invalid_request',message:error.statusCode===413?'Request body exceeds the 128 KiB limit. Send a smaller answer.':'The request could not be read. Check JSON syntax, Content-Type and request parameters.'});
  return reply.code(500).send({version:'1',error:'internal_error',message:'The server could not complete or save this request. Ask the backend owner to check the server; avoid repeating live requests until the cause is known.'});
 });
 app.get('/api/health',async()=>({version:'1',status:'ok'}));
 app.get('/api/capabilities',async()=>Capabilities.parse({version:'1',implementation:adapter.descriptor.implementation,agent:adapter.descriptor,capabilities:adapter.capabilities,limitations:[tavilyMode==='mock'?'Tavily is offline fixture mode; arbitrary claims are inconclusive.':'Tavily live mode is selected; search still requires explicit spending consent, a key and remaining server budget. Only narrow English templates are evaluated; source authority is not established.','Native execution is not integrated.',...(adapter.descriptor.implementation==='mock'?['Runs are simulated fixture checks, not model measurements.']:['Selected Bifrost implementation is not integrated.'])]}));
 app.get('/api/benchmarks',async()=>{
  if(!adapter.capabilities.benchmarks)throw new UnsupportedCapability('Benchmark catalog not integrated for selected adapter');
  return {version:'1',tasks:[task]};
 });
 app.post('/api/verify',async(request,reply)=>{
  const result=await verifyAnswer(VerifyRequest.parse(request.body),{mode:tavilyMode,budget:tavilyBudget,interpreter});await store.put('verify',result.id,result);return reply.code(201).send(result);
 });
 app.post('/api/claims/extract',async(request)=>{
  const input=ClaimExtractionRequest.parse(request.body);
  return extractFactualClaims(input.text,{mode:extractionMode,interpreter});
 });
 app.post('/api/claims/retrieve',async(request)=>retrieveClaimEvidence(EvidenceRetrievalRequest.parse(request.body),{mode:tavilyMode,budget:tavilyBudget}));
 app.post('/api/claims/compare',async(request)=>{
  const input=EvidenceRetrievalRequest.parse(request.body);
  const available=comparisonMode==='llm'&&!!interpreter?.compareEvidence&&!!interpreter.canRequest?.();
  const reason=comparisonMode!=='llm'?'General comparison is disabled in rules-only mode. No model request was made.':!interpreter?.compareEvidence?'No general evidence-comparison adapter is available.':!available?interpreter.unavailableReason?.()??'The model is temporarily unavailable. No model request was made.':undefined;
  const evidence=await retrieveClaimEvidence(input,{mode:tavilyMode,budget:tavilyBudget,cacheOnly:!available});
  return compareClaimEvidence(evidence,{mode:available?'llm':'rules',interpreter,unavailableReason:reason});
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
