import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app';
import {AnalysisReport} from '../packages/contracts/src/index';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
const post=(text:string,extra={})=>({method:'POST' as const,url:'/api/analysis',payload:{version:'1',text,...extra}});

it('supports offline analysis, exact source spans, claim bounds, deduplication and saved-report lookup without network',async()=>{
 vi.stubEnv('LANGUAGE_MODE','rules');vi.stubEnv('CLAIM_EXTRACTION_MODE','rules');vi.stubEnv('EVIDENCE_COMPARISON_MODE','rules');
 const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Network forbidden'));
 const dir=await mkdtemp(join(tmpdir(),'b05-analysis-'));const app=await createApp({implementation:'mock',tavilyMode:'mock',dataDir:dir});
 try{
  const status=await app.inject('/api/analysis/status');expect(status.statusCode).toBe(200);expect(status.json()).toEqual({version:'1',mode:'mock',extractionMode:'rules',comparisonMode:'rules',modelReady:false,modelDescription:null});
  const text='  Acme costs USD 20/month.\nBeta costs USD 30/month.\nAcme costs USD 20/month.\nGamma costs USD 40/month.\nDelta costs USD 50/month.';
  const response=await app.inject(post(text));expect(response.statusCode).toBe(201);
  const report=AnalysisReport.parse(response.json());expect(report.status).toBe('partial');expect(report.results).toHaveLength(3);expect(report.omittedClaims).toBe(1);expect(report.text).toBe(text);
  expect(report.results.every(item=>text.slice(item.claim.start,item.claim.end)===item.claim.text&&item.retrieval.status==='offline'&&item.comparison.outcome==='inconclusive'&&item.comparison.correction===null)).toBe(true);
  expect((await app.inject(`/api/analysis/${report.id}`)).json()).toEqual(report);
  expect((await app.inject(post('Is Alex captain of Acme FC?'))).json().status).toBe('no_claims');
  for(const extra of [{provider:'gemini'},{maxRequests:100},{claims:[]},{scope:'future'}])expect((await app.inject(post('A statement.',extra))).statusCode).toBe(400);
  expect((await app.inject(post('   '))).statusCode).toBe(400);expect((await app.inject('/api/analysis/missing')).statusCode).toBe(404);
  expect(fetcher).not.toHaveBeenCalled();
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
},20000);

it.each([false,true])('orchestrates real-shaped sources and gateway output with shared limits; simulated failure=%s',async fail=>{
 const env={LANGUAGE_MODE:'bifrost',CLAIM_EXTRACTION_MODE:fail?'rules':'llm',EVIDENCE_COMPARISON_MODE:'llm',BIFROST_LLM_PROVIDER:'gemini',BIFROST_LLM_MODEL:'gemini/test',BIFROST_FREE_TIER_CONFIRMED:'true',BIFROST_LLM_MAX_REQUESTS:'10',GEMINI_API_KEY:'fake',ALLOW_PAID_REQUESTS:'true',TAVILY_API_KEY:'fake',TAVILY_MAX_REQUESTS:'3'};
 for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
 const claims=['Acme costs USD 20/month.','Beta costs USD 30/month.','Gamma costs USD 40/month.','Delta costs USD 50/month.'];
 let searches=0;let inferences=0;
 const envelope=(output:unknown)=>Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}]});
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
  if(String(url)==='http://127.0.0.1:8080/health')return Response.json({status:'ok'});
  if(String(url)==='https://api.tavily.com/search'){
   searches++;const body=JSON.parse(String(init?.body));expect(body.search_depth).toBe('basic');
   return Response.json({results:['first.example','second.example'].map((host,index)=>({url:`https://${host}/${searches}`,content:`${body.query} Notice ${index}.`,published_date:new Date().toISOString()}))});
  }
  expect(String(url)).toBe('http://127.0.0.1:8080/v1/chat/completions');inferences++;
  const body=JSON.parse(String(init?.body));
  if(body.response_format.json_schema.name==='claim_extraction')return envelope({claims:claims.slice(0,3).map(text=>({text}))});
  const context=JSON.parse(JSON.parse(body.messages[1].content).untrustedText);
  if(fail&&context.claim===claims[2])return Response.json({error:'private diagnostic'},{status:429});
  return envelope({assessments:context.sources.map((source:{sourceId:string;excerpt:string})=>({sourceId:source.sourceId,quote:source.excerpt,relation:context.claim===claims[1]?'contradicts':'supports'})),correction:null});
 });
 const dir=await mkdtemp(join(tmpdir(),'b05-analysis-flow-'));const app=await createApp({implementation:'mock',tavilyMode:'live',dataDir:dir});
 try{
  const response=await app.inject(post((fail?claims:claims.slice(0,3)).join('\n')));expect(response.statusCode).toBe(201);
  const report=AnalysisReport.parse(response.json());expect(report.results).toHaveLength(3);expect(report.omittedClaims).toBe(fail?1:0);expect(report.status).toBe(fail?'partial':'complete');
  expect(report.results.map(item=>item.comparison.outcome)).toEqual(['supported','contradicted',fail?'inconclusive':'supported']);expect(searches).toBe(3);expect(inferences).toBe(fail?3:4);
  expect(report.results.every(item=>item.comparison.citations.length===2)).toBe(true);
  if(fail){expect(report.results[2].comparison.explanation).toContain('rate limit');expect(JSON.stringify(report)).not.toContain('private diagnostic');}
  const extra=await app.inject({method:'POST',url:'/api/claims/compare',payload:{version:'1',claim:claims[3]}});
  expect(extra.json().outcome).toBe('inconclusive');expect(searches).toBe(3);expect(inferences).toBe(fail?3:4);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
},20000);
