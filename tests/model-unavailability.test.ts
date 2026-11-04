import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app';
import {createBifrostInterpreter} from '../packages/tavily/src/bifrost-interpreter';
import {SearchBudget,CachedEvidenceUnavailable} from '../packages/tavily/src/budget';

const env={LANGUAGE_MODE:'bifrost',EVIDENCE_COMPARISON_MODE:'llm',CLAIM_EXTRACTION_MODE:'llm',BIFROST_LLM_PROVIDER:'gemini',BIFROST_LLM_MODEL:'gemini/offline-test',GEMINI_API_KEY:'fake',BIFROST_FREE_TIER_CONFIRMED:'true',BIFROST_LLM_MAX_REQUESTS:'2',ALLOW_PAID_REQUESTS:'true',TAVILY_API_KEY:'fake',TAVILY_MAX_REQUESTS:'1'};
const claim='Acme Pro costs USD 20/month.';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.useRealTimers();});

it.each([504,429])('retains cached sources after extraction fails with HTTP %s without another search or inference',async status=>{
 for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
 const now=new Date().toISOString();
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async url=>{
  if(String(url)==='https://api.tavily.com/search')return Response.json({results:['first.example','second.example'].map(host=>({url:`https://${host}/pricing`,content:'Acme Pro costs USD 25/month.',published_date:now}))});
  return Response.json({error:'PRIVATE upstream diagnostic'},{status});
 });
 const dir=await mkdtemp(join(tmpdir(),'b05-unavailable-'));const app=await createApp({implementation:'mock',tavilyMode:'live',dataDir:dir});
 try{
  const extracted=await app.inject({method:'POST',url:'/api/claims/extract',payload:{version:'1',text:claim}});
  expect(extracted.json().method).toBe('rules_fallback');
  const retrieved=await app.inject({method:'POST',url:'/api/claims/retrieve',payload:{version:'1',claim}});
  const compared=await app.inject({method:'POST',url:'/api/claims/compare',payload:{version:'1',claim}});
  const result=compared.json();expect(compared.statusCode).toBe(200);expect(result.outcome).toBe('inconclusive');expect(result.correction).toBeNull();
  expect(result.citations.map((source:{url:string})=>source.url)).toEqual(retrieved.json().evidence.map((source:{url:string})=>source.url));
  expect(result.citations.every((source:{relation:string})=>source.relation==='insufficient')).toBe(true);
  expect(result.explanation).toContain(status===504?'timed out':'rate limit');expect(result.explanation).toContain('cooldown');
  expect(result.explanation).not.toContain('disabled');expect(JSON.stringify(result)).not.toContain('PRIVATE');expect(fetcher).toHaveBeenCalledTimes(2);
  const missing=await app.inject({method:'POST',url:'/api/claims/compare',payload:{version:'1',claim:'A different uncached statement.'}});
  expect(missing.json().citations).toEqual([]);expect(missing.json().explanation).toContain('cooldown');expect(fetcher).toHaveBeenCalledTimes(2);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
},20000);

it('retains retrieved citations when comparison itself times out',async()=>{
 for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
 const now=new Date().toISOString();
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async url=>String(url)==='http://127.0.0.1:8080/health'?Response.json({status:'ok'}):String(url)==='https://api.tavily.com/search'?Response.json({results:['first.example','second.example'].map(host=>({url:`https://${host}`,content:'Acme Pro costs USD 25/month.',published_date:now}))}):Response.json({error:'private'},{status:504}));
 const dir=await mkdtemp(join(tmpdir(),'b05-comparison-timeout-'));const app=await createApp({implementation:'mock',tavilyMode:'live',dataDir:dir});
 try{
  const response=await app.inject({method:'POST',url:'/api/claims/compare',payload:{version:'1',claim}});
  expect(response.json().explanation).toContain('timed out');expect(response.json().citations).toHaveLength(2);expect(response.json().outcome).toBe('inconclusive');expect(fetcher).toHaveBeenCalledTimes(3);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
},20000);

it('reports exhausted model allowance separately from cooldown and configured rules-only mode',async()=>{
 const interpreter=createBifrostInterpreter({...env,BIFROST_LLM_MAX_REQUESTS:'1'},async()=>Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:'{"claims":[]}'}}]}));
 await interpreter.extractClaims!('Test.');expect(interpreter.canRequest!()).toBe(false);expect(interpreter.unavailableReason!()).toContain('budget is exhausted');
 const blocked=createBifrostInterpreter({...env,GEMINI_API_KEY:''},vi.fn());expect(blocked.unavailableReason!()).toContain('API key is missing');
});

it('cache-only reads preserve timestamps, isolate credentials and never spend the remaining search budget',async()=>{
 let now=Date.now();const budget=new SearchBudget(()=>now);const load=vi.fn(async()=>['saved evidence']);
 const saved=await budget.search('query','key',2,load);
 expect(await budget.search('query','key',2,load,true)).toEqual(saved);
 await expect(budget.search('other','key',2,load,true)).rejects.toBeInstanceOf(CachedEvidenceUnavailable);
 await expect(budget.search('query','different-key',2,load,true)).rejects.toBeInstanceOf(CachedEvidenceUnavailable);
 now+=300000;
 await expect(budget.search('query','key',2,load,true)).rejects.toBeInstanceOf(CachedEvidenceUnavailable);
 expect(load).toHaveBeenCalledTimes(1);
 await budget.search('new query','key',2,load);expect(load).toHaveBeenCalledTimes(2);
});
