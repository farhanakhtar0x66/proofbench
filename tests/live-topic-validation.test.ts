import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {runLiveTopicBatch} from '../scripts/live-topic-validation-lib';

afterEach(()=>vi.unstubAllEnvs());
function configure(){
 const values={LANGUAGE_MODE:'bifrost',CLAIM_EXTRACTION_MODE:'rules',EVIDENCE_COMPARISON_MODE:'llm',BIFROST_LLM_PROVIDER:'gemini',BIFROST_LLM_MODEL:'gemini/offline-simulation',BIFROST_LLM_ENDPOINT:'http://127.0.0.1:8080',BIFROST_LLM_TIMEOUT_MS:'1000',BIFROST_LLM_VIRTUAL_KEY:'',BIFROST_FREE_TIER_CONFIRMED:'true',BIFROST_LLM_MAX_REQUESTS:'9',ALLOW_PAID_REQUESTS:'true',TAVILY_API_KEY:'synthetic-key',GEMINI_API_KEY:'synthetic-key',TAVILY_MAX_REQUESTS:'9'};
 for(const [key,value] of Object.entries(values))vi.stubEnv(key,value);
}
const cases=[{id:'first',claim:'Acme Pro costs USD 20/month.',expected:'supported' as const},{id:'second',claim:'Acme Pro costs USD 25/month.',expected:'contradicted' as const}];
function simulatedFetch(modelStatus=200,invalid=false):typeof fetch{
 return async(input,init)=>{
  if(String(input)==='https://api.tavily.com/search')return Response.json({results:[0,1].map(index=>({url:`https://source${index}.example/notice`,title:'SIMULATED',content:`Acme Pro costs USD 20/month. Source notice ${index}.`,published_date:new Date(Date.now()-86400000).toISOString()}))});
  expect(String(input)).toBe('http://127.0.0.1:8080/v1/chat/completions');
  if(modelStatus!==200)return Response.json({error:'Do not expose this provider message'},{status:modelStatus});
  const body=JSON.parse(String(init?.body));const context=JSON.parse(JSON.parse(body.messages[1].content).untrustedText);
  return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:invalid?'{}':JSON.stringify({assessments:context.sources.map((source:{sourceId:string;excerpt:string})=>({sourceId:source.sourceId,relation:context.claim===cases[0].claim?'supports':'contradicts',quote:source.excerpt})),correction:null})}}]});
 };
}
async function run(fetcher:typeof fetch,limits={tavily:9,model:9},captureSearch?:(payload:unknown,attempt:number)=>Promise<void>){
 configure();const directory=await mkdtemp(join(tmpdir(),'b05-topic-test-'));const checkpoints:unknown[]=[];
 try{return {report:await runLiveTopicBatch({cases,dataDir:directory,endpoint:'http://127.0.0.1:8080',limits,fetcher,captureSearch,checkpoint:async report=>{checkpoints.push(report);}}),checkpoints};}
 finally{await rm(directory,{recursive:true,force:true});}
}
it('runs the combined API with injected evidence, journals attempts and restores fetch',async()=>{
 const original=globalThis.fetch;
 const {report,checkpoints}=await run(simulatedFetch());
 expect(report.status).toBe('completed');expect(report.summary).toMatchObject({completed:2,exactMatches:2,wrongDecisive:0,notRun:0});
 expect(report.attempts.model).toBe(2);expect(report.attempts.tavily).toBeLessThanOrEqual(2);
 expect(checkpoints.length).toBeGreaterThan(3);expect(globalThis.fetch).toBe(original);
},20000);
it('stops on a provider rate limit, preserves the partial report, and never retries',async()=>{
 const {report}=await run(simulatedFetch(429));
 expect(report.status).toBe('stopped');expect(report.attempts.model).toBe(1);
 expect(report.summary).toMatchObject({completed:1,notRun:1,inconclusiveKnownFacts:1});
 expect(report.stopReason).toContain('429');expect(JSON.stringify(report)).not.toContain('Do not expose this provider message');
});
it('also stops when HTTP 200 contains an invalid model comparison',async()=>{
 const {report}=await run(simulatedFetch(200,true));
 expect(report.status).toBe('stopped');expect(report.attempts.model).toBe(1);
 expect(report.stopReason).toContain('validated comparison');expect(report.results[1].status).toBe('not_run');
});
it('enforces the additional fetch attempt ceiling before an upstream request',async()=>{
 const upstream=vi.fn(simulatedFetch());
 const {report}=await run(upstream,{tavily:9,model:1});
 expect(report.status).toBe('stopped');expect(report.attempts.model).toBe(1);
 expect(upstream.mock.calls.filter(([url])=>String(url).includes('/chat/completions'))).toHaveLength(1);
});
it('captures successful search payloads from a clone without consuming the verifier response or adding requests',async()=>{
 const capture=vi.fn(async(_payload:unknown,_attempt:number)=>{});const upstream=vi.fn(simulatedFetch());
 const {report}=await run(upstream,{tavily:9,model:9},capture);
 expect(report.status).toBe('completed');expect(capture).toHaveBeenCalledTimes(report.attempts.tavily);
 expect(capture.mock.calls[0][0]).toMatchObject({results:expect.any(Array)});
 expect(upstream.mock.calls.length).toBe(report.attempts.tavily+report.attempts.model);
});
