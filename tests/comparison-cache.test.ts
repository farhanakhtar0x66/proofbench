import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';
import {ComparisonCache} from '../packages/tavily/src/comparison-cache';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {createApp} from '../apps/api/src/app';

const now='2026-11-04T12:00:00.000Z';
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllEnvs();});
function setup(){
 vi.useFakeTimers();vi.setSystemTime(new Date(now));
 const input=EvidenceRetrievalReport.parse({version:'1',claim:'Alex is CEO of Acme.',query:'Acme current CEO official sources',mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,message:'Simulated cache evidence',limitations:[],evidence:[0,1].map(index=>({url:`https://source${index}.example/notice`,title:'Simulated notice',excerpt:`Alex is CEO of Acme. Notice ${index} describes this leadership appointment.`,relation:'context',retrieval:'tavily',publishedAt:now,retrievedAt:now}))});
 const output=()=>({assessments:input.evidence.map((source,index)=>({sourceId:`S${index+1}`,relation:'supports',quote:source.excerpt})),correction:null});
 const compareEvidence=vi.fn(async()=>output());
 const interpreter={interpret:vi.fn(),compareEvidence};
 const options={mode:'llm' as const,interpreter,comparisonCache:new ComparisonCache()};
 return {input,options,compareEvidence,output};
}

it('reuses a validated result with original timestamps and protects it from caller mutation',async()=>{
 const {input,options,compareEvidence}=setup();
 const first=await compareClaimEvidence(input,options);expect(first.cache?.status).toBe('miss');
 const firstScore=first.freshnessScore;first.citations[0].quote='Caller mutation';first.outcome='inconclusive';
 vi.setSystemTime(new Date(Date.parse(now)+60000));
 const second=await compareClaimEvidence(input,options);
 expect(second.cache?.status).toBe('hit');expect(second.outcome).toBe('supported');
 expect(second.citations[0].quote).toBe(input.evidence[0].excerpt);expect(second.assessedAt).toBe(now);
 expect(second.freshnessScore).toBe(firstScore);expect(compareEvidence).toHaveBeenCalledOnce();
});
it('coalesces simultaneous identical comparisons into one model attempt',async()=>{
 const {input,options,compareEvidence,output}=setup();
 let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});
 compareEvidence.mockImplementation(async()=>{await wait;return output();});
 const first=compareClaimEvidence(input,options);const second=compareClaimEvidence(input,options);
 await Promise.resolve();expect(compareEvidence).toHaveBeenCalledOnce();release();
 const results=await Promise.all([first,second]);expect(results.map(result=>result.cache?.status)).toEqual(['miss','shared']);
});
it.each(['throw','invalid'])('does not cache failed model comparisons: %s',async failure=>{
 const {input,options,compareEvidence,output}=setup();
 compareEvidence.mockImplementationOnce(async()=>{if(failure==='throw')throw new Error('Failure');return {...output(),unexpected:true};});
 expect((await compareClaimEvidence(input,options)).method).toBe('rules_fallback');
 const next=await compareClaimEvidence(input,options);expect(next.cache?.status).toBe('miss');expect(next.method).toBe('llm');expect(compareEvidence).toHaveBeenCalledTimes(2);
});
it('caches valid inconclusive assessments without inventing a score',async()=>{
 const {input,options,compareEvidence,output}=setup();
 compareEvidence.mockImplementation(async()=>({...output(),assessments:output().assessments.map(source=>({...source,relation:'insufficient'}))}));
 await compareClaimEvidence(input,options);const result=await compareClaimEvidence(input,options);
 expect(result.cache?.status).toBe('hit');expect(result.outcome).toBe('inconclusive');expect(result.freshnessScore).toBeNull();
});
it('expires after five minutes and on a backward clock change',async()=>{
 const {input,options,compareEvidence}=setup();await compareClaimEvidence(input,options);
 vi.setSystemTime(new Date(Date.parse(now)+300000));
 expect((await compareClaimEvidence(input,options)).cache?.status).toBe('miss');
 vi.setSystemTime(new Date(Date.parse(now)+1000));
 expect((await compareClaimEvidence(input,options)).cache?.status).toBe('miss');expect(compareEvidence).toHaveBeenCalledTimes(3);
});
it.each(['claim','scope','excerpt','url','date','retrieved','query','model'])('invalidates when comparison context changes: %s',async change=>{
 const {input,options,compareEvidence}=setup();await compareClaimEvidence(input,options);
 if(change==='claim')input.claim='Alex is the CEO of Acme.';
 if(change==='excerpt')input.evidence[0].excerpt+=' Additional context.';
 if(change==='url')input.evidence[0].url='https://other.example/notice';
 if(change==='date')input.evidence[0].publishedAt='2026-11-03T12:00:00.000Z';
 if(change==='retrieved')input.evidence[0].retrievedAt='2026-11-04T11:59:00.000Z';
 if(change==='query')input.query+=' leadership';
 if(change==='model')options.interpreter={...options.interpreter};
 const result=await compareClaimEvidence(input,{...options,...(change==='scope'?{scope:'current' as const}:{})});
 expect(result.cache?.status).toBe('miss');expect(compareEvidence).toHaveBeenCalledTimes(2);
});
it('rechecks temporal eligibility before reuse, even within the cache TTL',async()=>{
 const {input,options,compareEvidence}=setup();
 input.evidence[0].publishedAt=new Date(Date.parse(now)-30*86400000+60000).toISOString();
 expect((await compareClaimEvidence(input,options)).outcome).toBe('supported');
 vi.setSystemTime(new Date(Date.parse(now)+120000));
 const result=await compareClaimEvidence(input,options);
 expect(result.outcome).toBe('inconclusive');expect(result.cache).toBeUndefined();expect(compareEvidence).toHaveBeenCalledOnce();
});
it('does not reuse a result after rules mode or incomplete source-context selection',async()=>{
 const {input,options,compareEvidence}=setup();await compareClaimEvidence(input,options);
 expect((await compareClaimEvidence(input,{...options,mode:'rules'})).method).toBe('rules_fallback');
 input.evidence[0].excerptSelection={start:0,end:input.evidence[0].excerpt.length,sourceLength:2000,reason:'Selection',warning:'Other potentially relevant passages omitted.'};
 expect((await compareClaimEvidence(input,options)).outcome).toBe('inconclusive');expect(compareEvidence).toHaveBeenCalledOnce();
});
it('bounds stored results to 100 entries',async()=>{
 const {input,options,compareEvidence}=setup();
 for(let index=0;index<101;index++)await compareClaimEvidence({...input,query:`query ${index}`},options);
 await compareClaimEvidence({...input,query:'query 100'},options);expect(compareEvidence).toHaveBeenCalledTimes(101);
 await compareClaimEvidence({...input,query:'query 0'},options);expect(compareEvidence).toHaveBeenCalledTimes(102);
});

it('shares the app cache across analyses and comparison route after request-cap exhaustion, with no extra fetch',async()=>{
 const env={LANGUAGE_MODE:'bifrost',CLAIM_EXTRACTION_MODE:'rules',EVIDENCE_COMPARISON_MODE:'llm',BIFROST_LLM_PROVIDER:'gemini',BIFROST_LLM_MODEL:'gemini/test',BIFROST_FREE_TIER_CONFIRMED:'true',BIFROST_LLM_MAX_REQUESTS:'1',GEMINI_API_KEY:'fake',ALLOW_PAID_REQUESTS:'true',TAVILY_API_KEY:'fake',TAVILY_MAX_REQUESTS:'1'};
 for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
 let searches=0,models=0;
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
  if(String(url)==='http://127.0.0.1:8080/health')return Response.json({status:'ok'});
  if(String(url)==='https://api.tavily.com/search'){
   searches++;return Response.json({results:[0,1].map(index=>({url:`https://source${index}.example`,content:`Alex is CEO of Acme. Leadership notice ${index}.`,published_date:new Date(Date.now()-86400000).toISOString()}))});
  }
  expect(String(url)).toBe('http://127.0.0.1:8080/v1/chat/completions');models++;
  const body=JSON.parse(String(init?.body));const context=JSON.parse(JSON.parse(body.messages[1].content).untrustedText);
  return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify({assessments:context.sources.map((source:{sourceId:string;excerpt:string})=>({sourceId:source.sourceId,quote:source.excerpt,relation:'supports'})),correction:null})}}]});
 });
 const dir=await mkdtemp(join(tmpdir(),'b05-comparison-cache-'));const app=await createApp({implementation:'mock',tavilyMode:'live',dataDir:dir});
 try{
  const post=()=>app.inject({method:'POST',url:'/api/analysis',payload:{version:'1',text:'Alex is CEO of Acme.',scope:'current'}});
  const first=await post();expect(first.statusCode).toBe(201);expect(first.json().results[0].comparison.cache.status).toBe('miss');expect(first.json().results[0].comparison.method,first.json().results[0].comparison.explanation).toBe('llm');
  const second=await post();expect(second.statusCode).toBe(201);expect(second.json().results[0].comparison.cache.status).toBe('hit');
  expect(second.json().id).not.toBe(first.json().id);expect(second.json().results[0].comparison.assessedAt).toBe(first.json().results[0].comparison.assessedAt);
  expect((await app.inject(`/api/analysis/${second.json().id}`)).json()).toEqual(second.json());
  const standalone=await app.inject({method:'POST',url:'/api/claims/compare',payload:{version:'1',claim:'Alex is CEO of Acme.',scope:'current'}});
  expect(standalone.json().cache.status).toBe('hit');
  const changed=await app.inject({method:'POST',url:'/api/claims/compare',payload:{version:'1',claim:'Sam is CEO of Acme.',scope:'current'}});
  expect(changed.json().outcome).toBe('inconclusive');expect(changed.json().cache?.status).not.toBe('hit');
  expect(searches).toBe(1);expect(models).toBe(1);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
},20000);
