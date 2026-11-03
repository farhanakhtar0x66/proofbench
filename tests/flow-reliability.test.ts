import {afterEach,expect,it,vi} from 'vitest';
import {bifrostSettings,createBifrostInterpreter} from '../packages/tavily/src/bifrost-interpreter';
import {buildBifrostConfig,isTimeoutOnlyRefresh} from '../packages/tavily/src/bifrost-config';
import {interpretationDeadline,interpretationSession} from '../packages/tavily/src/interpretation';
import {extractFactualClaims} from '../packages/tavily/src/claim-extraction';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {evidenceSearchPlan} from '../packages/tavily/src/search-plan';
import {retrieveClaimEvidence} from '../packages/tavily/src/general-retrieval';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';
import {SearchBudget} from '../packages/tavily/src/budget';

const env={BIFROST_LLM_PROVIDER:'gemini',BIFROST_LLM_MODEL:'gemini/offline-test',GEMINI_API_KEY:'fake',BIFROST_FREE_TIER_CONFIRMED:'true',BIFROST_LLM_MAX_REQUESTS:'3',BIFROST_LLM_TIMEOUT_MS:'20000'};
const text='Subscribers pay twenty USD monthly for Acme Pro.';
const fact={entity:'Acme Pro',kind:'price',value:'twenty',currency:'USD',period:'monthly',time:null,region:null,tier:null};
const envelope=(value:unknown)=>Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(value)}}]});
afterEach(()=>vi.useRealTimers());

it('coordinates provider, client and outer deadlines without adding retries',()=>{
 const settings=bifrostSettings(env);expect(settings.timeoutMs).toBe(20000);
 const config=buildBifrostConfig(env);expect(config.providers.gemini.network_config.default_request_timeout_in_seconds).toBe(19);expect(config.providers.gemini.network_config.max_retries).toBe(0);
 const adapter=createBifrostInterpreter(env);expect(adapter.timeoutMs).toBe(20000);expect(interpretationDeadline(adapter)).toBe(21000);
 expect(interpretationDeadline(undefined)).toBe(10000);expect(interpretationDeadline({interpret:vi.fn(),timeoutMs:Infinity})).toBe(10000);
 expect(()=>bifrostSettings({...env,BIFROST_LLM_TIMEOUT_MS:'30001'})).toThrow();
});
it('permits only the explicit timeout-only gateway refresh and preserves the inspected object',()=>{
 const expected=buildBifrostConfig(env);const old=structuredClone(expected);old.providers.gemini.network_config.default_request_timeout_in_seconds=9;
 expect(isTimeoutOnlyRefresh(old,expected,'gemini')).toBe(true);expect(old.providers.gemini.network_config.default_request_timeout_in_seconds).toBe(9);
 old.providers.gemini.network_config.max_retries=1;expect(isTimeoutOnlyRefresh(old,expected,'gemini')).toBe(false);
 expect(isTimeoutOnlyRefresh({},expected,'gemini')).toBe(false);
 const wrong=structuredClone(expected);wrong.providers.gemini.keys[0].models=['different-model'];expect(isTimeoutOnlyRefresh(wrong,expected,'gemini')).toBe(false);
});
it.each(['interpret','extract','compare'])('allows a 15s model response with the configured 20s bound in %s',async operation=>{
 vi.useFakeTimers();const now=new Date().toISOString();
 const quote='Acme Pro costs USD 20/month.';
 const fetcher=vi.fn<typeof fetch>(async()=>{await new Promise(resolve=>setTimeout(resolve,15000));return envelope(operation==='interpret'?fact:operation==='extract'?{claims:[{text}]}:{assessments:[{sourceId:'S1',relation:'supports',quote},{sourceId:'S2',relation:'supports',quote}],correction:null});});
 const adapter=createBifrostInterpreter(env,fetcher);
 let pending:Promise<unknown>;
 if(operation==='interpret')pending=interpretationSession(adapter).normalize(text);
 else if(operation==='extract')pending=extractFactualClaims(text,{mode:'llm',interpreter:adapter});
 else pending=compareClaimEvidence(EvidenceRetrievalReport.parse({version:'1',claim:quote,query:quote,mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,limitations:[],message:'Simulated',evidence:['first.example','second.example'].map(host=>({url:`https://${host}`,title:'Simulated',excerpt:quote,publishedAt:now,retrievedAt:now,retrieval:'tavily',relation:'context'}))}),{mode:'llm',interpreter:adapter});
 await vi.advanceTimersByTimeAsync(15000);const result=await pending;
 if(operation==='interpret')expect(result).toBe('Acme Pro costs USD 20 per month.');
 else if(operation==='extract')expect(result).toMatchObject({method:'llm'});
 else expect(result).toMatchObject({method:'llm',outcome:'supported'});
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('still bounds a stalled custom extractor and returns fallback without a retry',async()=>{
 vi.useFakeTimers();const extractClaims=vi.fn(()=>new Promise(()=>{}));
 const pending=extractFactualClaims(text,{mode:'llm',interpreter:{interpret:vi.fn(),extractClaims,timeoutMs:20000}});
 await vi.advanceTimersByTimeAsync(20999);let resolved=false;void pending.then(()=>{resolved=true;});await Promise.resolve();expect(resolved).toBe(false);
 await vi.advanceTimersByTimeAsync(1);expect((await pending).method).toBe('rules_fallback');expect(extractClaims).toHaveBeenCalledTimes(1);
});
it('leaves literal historical queries unchanged and adds a date window only for explicit current scope',()=>{
 const claim='Acme did not permit this in India in 2018.';const now=new Date('2026-11-03T18:00:00Z');
 expect(evidenceSearchPlan(claim,undefined,now)).toEqual({query:claim,dateWindow:undefined});
 expect(evidenceSearchPlan(claim,'current',now)).toEqual({query:`${claim} current official sources`,dateWindow:{startDate:'2026-10-04',endDate:'2026-11-04'}});
});
it('uses one capped basic current-evidence search, caches it and preserves the original claim',async()=>{
 const claim='Cristiano Ronaldo is not captain of Real Madrid.';const budget=new SearchBudget();
 const fetcher=vi.fn<typeof fetch>(async(_url,init)=>{
  const body=JSON.parse(String(init?.body));expect(body.query).toBe('Real Madrid current captain official sources');expect(body.filter_by_published_date).toBe(true);expect(body.auto_parameters).toBe(false);expect(body.search_depth).toBe('basic');expect(body.max_results).toBe(3);expect(body.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);return Response.json({results:[]});
 });
 const options={mode:'live',allowPaidRequests:'true',apiKey:'fake',maxRequests:1,budget,fetch:fetcher};
 const first=await retrieveClaimEvidence({version:'1',claim,scope:'current'},options);expect(first.claim).toBe(claim);expect(first.searchScope).toBe('current');expect(first.status).toBe('empty');
 await retrieveClaimEvidence({version:'1',claim,scope:'current'},options);expect(fetcher).toHaveBeenCalledTimes(1);
 const literal=await retrieveClaimEvidence({version:'1',claim},options);expect(literal.status).toBe('budget_exhausted');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects unknown scope before any network request',async()=>{
 const fetcher=vi.fn();await expect(retrieveClaimEvidence({version:'1',claim:'Some statement.',scope:'unlimited'},{mode:'live',fetch:fetcher})).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
});
it('uses a neutral role query without changing the claim or losing object-side qualifiers',()=>{
 const claim='Ada is not the CEO of Acme India in 2026.';
 expect(evidenceSearchPlan(claim).query).toBe(claim);
 expect(evidenceSearchPlan(claim,'current').query).toBe('Acme India in 2026 current CEO official sources');
});
it('keeps unknown role wording literal instead of guessing a company or position',()=>{
 const claim='Ada might lead the Acme division after approval.';
 expect(evidenceSearchPlan(claim,'current').query).toBe(`${claim} current official sources`);
});
