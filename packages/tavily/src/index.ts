import {readBoundedSearchJson} from './response-json';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ClaimVerification,VerifyRequest,VerificationReport} from '../../contracts/src/index';
import cases from '../../../fixtures/freshness-cases/v1.json';
import {classifyClaim,extractClaims} from './claims';
import {analyzeEvidence,claimFormatLimitation,normalizeSource} from './comparison';
import {rankSources,type SourcePolicy} from './sources';
import {RequestBudgetExhausted,SearchBudget} from './budget';
import {freshnessScore} from './freshness';
import {assessSourceDates} from './dates';
import {TavilyRetrievalError,retrievalFailureMessage} from './retrieval-errors';
import {interpretationSession,type LanguageInterpreter,type InterpretationStats} from './interpretation';
export {SearchBudget} from './budget';
const sharedBudgets=new WeakMap<typeof fetch,SearchBudget>();

export type TavilyResult={title?:string;url?:string;content?:string;raw_content?:string;score?:number;published_date?:string;originalContent?:string};
const TavilyResponse=z.object({results:z.array(z.object({title:z.string().nullish(),url:z.string(),content:z.string().nullish(),raw_content:z.string().nullish(),score:z.number().optional(),published_date:z.string().nullish()}))});
type VerifyOptions={mode?:string;allowLiveRequests?:string;maxRequests?:string|number;apiKey?:string;fetch?:typeof fetch;budget?:SearchBudget;sourcePolicy?:SourcePolicy;interpreter?:LanguageInterpreter;interpretationStats?:InterpretationStats};
export class TavilyConfigurationError extends Error {statusCode=400;}

const timeSensitivePattern=/\b(current|latest|today|now|price|pricing|cost|plan|version|release|api|ceo|president|prime minister|minister|law|legal|regulation|policy|supported|support|effective|rate|fee|salary|revenue|population|statistics?)\b/iu;
export const requestLimit=(value:string|number|undefined)=>{
 const parsed=typeof value==='number'?value:Number(value);
 if(!Number.isInteger(parsed)||parsed<1||parsed>50)throw new TavilyConfigurationError('TAVILY_MAX_REQUESTS must be a whole number between 1 and 50 in live mode.');
 return parsed;
};
export function tavilyTimeoutMs(value:string|number|undefined=process.env.TAVILY_TIMEOUT_MS){
 if(value===undefined)return 20000;
 const parsed=typeof value==='number'?value:Number(value);
 if(!Number.isInteger(parsed)||parsed<1000||parsed>30000)throw new TavilyConfigurationError('TAVILY_TIMEOUT_MS must be a whole number between 1000 and 30000.');
 return parsed;
}
const liveEvidence=(claim:string,results:TavilyResult[],retrievedAt:string,policy?:SourcePolicy)=>rankSources(claim,results,retrievedAt,policy).map(result=>{
 const dates=assessSourceDates(result,retrievedAt);
 return {url:result.url,title:result.title?.trim()||'Tavily result',retrievedAt,publishedAt:dates.publishedAt,updatedAt:dates.updatedAt,effectiveAt:dates.effectiveAt,dateReason:dates.reason,excerpt:(result.originalContent??result.content)?.trim().slice(0,1200)||'No excerpt returned by Tavily.',relation:result.relation,retrieval:'tavily' as const,sourceTier:result.tier,sourceReason:result.reason,duplicateOf:result.duplicateOf,corroborationGroup:result.group};
});
export async function searchTavily(query:string,apiKey:string,fetcher:typeof fetch,options:{includePublishedDate?:boolean;dateWindow?:{startDate:string;endDate:string};qualityCandidates?:boolean;timeoutMs?:string|number}={}):Promise<TavilyResult[]> {
 const timeoutMs=tavilyTimeoutMs(options.timeoutMs);
 try{
 const response=await fetcher('https://api.tavily.com/search',{signal:AbortSignal.timeout(timeoutMs),method:'POST',redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({query,search_depth:'basic',auto_parameters:false,max_results:options.qualityCandidates?6:3,...(options.qualityCandidates?{exclude_domains:['facebook.com']}:{}),include_raw_content:options.qualityCandidates?'text':false,include_answer:false,...(options.includePublishedDate?{include_published_date:true}:{}),...(options.dateWindow?{start_date:options.dateWindow.startDate,end_date:options.dateWindow.endDate,filter_by_published_date:true}:{})})});
 if(!response.ok){
  const reason=response.status===401||response.status===403?'Tavily rejected server credentials. Ask the backend owner to check the key and permissions.':response.status===429?'Tavily reported a rate or account limit. Check account usage before authorizing more requests.':'Tavily is unavailable or returned an unsuccessful response.';
  throw new TavilyRetrievalError(`${reason} No retry was made; the attempted search counts toward the server budget.`);
 }
 let data:z.infer<typeof TavilyResponse>;
 try{
  data=TavilyResponse.parse(await readBoundedSearchJson(response));
 }catch(error){
  if(error instanceof Error&&['AbortError','TimeoutError'].includes(error.name))throw error;
  throw new TavilyRetrievalError('Tavily returned invalid evidence or an unreadable response. No retry was made; the attempted search counts toward the server budget.');
 }
 return data.results.map(result=>({...result,title:result.title??undefined,content:result.content??undefined,raw_content:result.raw_content??undefined,published_date:result.published_date??undefined}));
 }catch(error){
  if(error instanceof Error&&['AbortError','TimeoutError'].includes(error.name))throw new TavilyRetrievalError(`Tavily retrieval timed out (configured deadline: ${timeoutMs/1000}s). No retry was made; the attempted search counts toward the server budget.`);
  throw error;
 }
}
function mockVerification(text:string,asOf:string|undefined,now:string){
 const fixture=asOf?undefined:cases.find(candidate=>candidate.statement===text.trim());
 return ClaimVerification.parse({version:'1',id:randomUUID(),text,timeSensitive:fixture?.timeSensitive??(timeSensitivePattern.test(text)?'yes':'unknown'),outcome:fixture?.expectedOutcome??'inconclusive',freshness:fixture?.expectedFreshness??'unknown',asOf:asOf??now,uncertainty:fixture?`Offline fixture, not live Tavily evidence. ${fixture.uncertainty}`:asOf?'Explicit date scope requires temporal evidence; mock cannot verify this date.':'No exact offline fixture. Claim extraction is heuristic; current truth has not been established.',evidence:fixture&&fixture.expectedOutcome!=='inconclusive'?[{url:fixture.source,title:`Offline reference: ${fixture.id}`,retrievedAt:null,recordedAt:'2026-11-02T00:00:00.000Z',excerpt:fixture.reference,relation:fixture.expectedOutcome==='supported'?'supports':'contradicts',retrieval:'fixture'}]:[]});
}
function liveVerification(text:string,asOf:string|undefined,now:string,results:TavilyResult[],retrievedAt=now,policy?:SourcePolicy,comparisonText=text){
 if(asOf)return ClaimVerification.parse({version:'1',id:randomUUID(),text,timeSensitive:timeSensitivePattern.test(text)?'yes':'unknown',outcome:'inconclusive',freshness:'unknown',asOf,uncertainty:'Historical verification needs date-scoped retrieval and is not available in the live v1 verifier.',evidence:[]});
 const evidence=liveEvidence(comparisonText,results,now,policy).map(item=>({...item,retrievedAt,excerpt:results.find(source=>source.url===item.url)?.originalContent?.slice(0,1200)??item.excerpt}));
 const domains=(relation:string)=>new Set(evidence.filter(item=>item.relation===relation&&!item.duplicateOf).map(item=>item.corroborationGroup)).size;
 const supports=domains('supports');const contradicts=domains('contradicts');
 const internalConflict=results.map(normalizeSource).filter(source=>!!source).some(source=>analyzeEvidence(comparisonText,source,now).conflicting);
 const outcome=internalConflict?'inconclusive':contradicts>=2&&supports===0?'contradicted':supports>=2&&contradicts===0?'supported':'inconclusive';const freshness=outcome==='supported'?'current':outcome==='contradicted'?'stale':'unknown';
 const dated=evidence.filter(item=>{
  if(!item.publishedAt)return false;
  const age=Date.parse(now)-Date.parse(item.publishedAt);
  return age>=0&&age<=30*86400000;
 });
 let uncertainty='Two distinct source groups provide recent matching entity and scope statements after duplicate checks. This is a rule-based assessment; different groups do not prove independence. Review the evidence.';
 if(outcome==='inconclusive'){
  uncertainty=claimFormatLimitation(comparisonText)??(
   internalConflict?'A source contains both supporting and contradicting statements for the same claim. Review this conflicting evidence before drawing a conclusion.':
   supports>0&&contradicts>0?'Recent sources disagree about this claim. The verifier cannot choose between conflicting statements.':
   evidence.length===0?'No usable source evidence was returned. The claim has not been verified.':
   dated.length===0?'Sources have no valid publication dates within the last 30 days. Retrieval today does not establish that their information is current.':
   results.length>0&&results.every(source=>!assessSourceDates(source,now).eligible)?`Source dates do not establish current evidence: ${assessSourceDates(results[0],now).reason}`:
   supports+contradicts===0?'Recent evidence does not provide a comparable statement with the same entity and scope. It may concern another product, plan, currency, billing period or unsupported wording.':
   'Fewer than two distinct source hostnames provide agreeing, recent statements. Another qualifying source is needed; repeated pages from one hostname do not count twice.');
 }
 const reviewed=evidence.filter(item=>item.sourceTier==='official_direct'||item.sourceTier==='reviewed_secondary').length;
 const likely=evidence.filter(item=>item.sourceTier==='likely_official').length;
 uncertainty+=` Source ranking: ${reviewed} reviewed, ${likely} likely official (unverified), ${evidence.length-reviewed-likely} unreviewed. Heuristic identity and unreviewed agreement do not establish authority; exact-copy detection cannot prove independence.`;
 return ClaimVerification.parse({version:'1',id:randomUUID(),text,timeSensitive:classifyClaim(comparisonText).timeSensitive,outcome,freshness,asOf:now,uncertainty,evidence});
}
export async function verifyAnswer(input:VerifyRequest,options:VerifyOptions={}):Promise<VerificationReport> {
 const request=VerifyRequest.parse(input);const now=new Date().toISOString();const claims=request.claims??extractClaims(request.text).map(text=>({text,asOf:undefined}));const mode=options.mode??process.env.TAVILY_MODE??'mock';
 if(mode==='mock')return VerificationReport.parse({version:'1',id:randomUUID(),mode:'mock',createdAt:now,text:request.text,claims:claims.map(({text,asOf})=>({...mockVerification(text,asOf,now),freshnessScore:null}))});
 if(mode!=='live')throw new TavilyConfigurationError('TAVILY_MODE must be mock or live.');
 if((options.allowLiveRequests??process.env.ALLOW_LIVE_REQUESTS)!=='true')throw new TavilyConfigurationError('Live Tavily is disabled. Set ALLOW_LIVE_REQUESTS=true only after approving a request budget.');
 const apiKey=options.apiKey??process.env.TAVILY_API_KEY;if(!apiKey)throw new TavilyConfigurationError('TAVILY_API_KEY is required in live mode.');
 tavilyTimeoutMs(); // Validate before reserving a search allowance.
 const budget=requestLimit(options.maxRequests??process.env.TAVILY_MAX_REQUESTS);const fetcher=options.fetch??fetch;const verified=[] as ClaimVerification[];
 let shared=options.budget??sharedBudgets.get(fetcher);
 if(!shared){shared=new SearchBudget();sharedBudgets.set(fetcher,shared);}
 const cache=new Map<string,ClaimVerification>();
 const language=interpretationSession(options.interpreter,options.interpretationStats);
 for(const claim of claims){
  const cacheKey=JSON.stringify([claim.text.trim().toLowerCase().replace(/\s+/gu,' '),claim.asOf??null]);
  const cached=cache.get(cacheKey);
  if(cached){verified.push({...cached,id:randomUUID(),text:claim.text});continue;}
  if(claim.asOf){verified.push(liveVerification(claim.text,claim.asOf,now,[]));continue;}
  const comparisonText=await language.normalize(claim.text);
  const classification=classifyClaim(comparisonText);
  if(classification.ambiguous||classification.timeSensitive==='unknown'){verified.push(ClaimVerification.parse({version:'1',id:randomUUID(),text:claim.text,timeSensitive:classification.timeSensitive,outcome:'inconclusive',freshness:'unknown',asOf:now,uncertainty:classification.ambiguous?'Claim needs an explicit entity or product before retrieval. No search was made.':'Claim was not identified as time-sensitive, so live retrieval was skipped to conserve the request budget.',evidence:[]}));continue;}
  let result:ClaimVerification;
  try {
   const query=`${claim.text.trim().toLowerCase().replace(/\s+/gu,' ')} official current`;
   const search=await shared.search(query,apiKey,budget,()=>searchTavily(query,apiKey,fetcher));
   const interpreted:TavilyResult[]=[];
   for(const source of search.value){
    const content=source.content&&assessSourceDates(source,new Date().toISOString()).eligible?await language.normalize(source.content):source.content;
    interpreted.push({...source,content,originalContent:source.content});
   }
   result=liveVerification(claim.text,undefined,new Date().toISOString(),interpreted,search.retrievedAt,options.sourcePolicy,comparisonText);
   if(language.stats.calls>0)result.uncertainty+=` Optional language interpretation was attempted${options.interpreter?.description?` via ${options.interpreter.description}`:''}; only validated text-grounded fields were used. It does not establish truth and can still misinterpret text.`;
  } catch(error) {
   result=ClaimVerification.parse({version:'1',id:randomUUID(),text:claim.text,timeSensitive:'yes',outcome:'inconclusive',freshness:'unknown',asOf:now,uncertainty:error instanceof RequestBudgetExhausted?'Live request budget exhausted for this server lifetime. No search was made. Cached queries can still be served; ask the backend owner before restarting or granting a new budget.':retrievalFailureMessage(error),evidence:[]});
  }
  cache.set(cacheKey,result);verified.push(result);
 }
 return VerificationReport.parse({version:'1',id:randomUUID(),mode:'live',createdAt:now,text:request.text,claims:verified.map(claim=>({...claim,freshnessScore:freshnessScore(claim,'live')}))});
}
