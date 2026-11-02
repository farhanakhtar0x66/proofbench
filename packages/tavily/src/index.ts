import {randomUUID} from 'node:crypto';
import {ClaimVerification,VerifyRequest,VerificationReport} from '../../contracts/src/index';
import cases from '../../../fixtures/freshness-cases/v1.json';
import {classifyClaim,extractClaims} from './claims';
import {compareEvidence,normalizeSource} from './comparison';

type TavilyResult={title?:string;url?:string;content?:string;score?:number;published_date?:string};
type TavilyResponse={results?:TavilyResult[]};
type VerifyOptions={mode?:string;allowPaidRequests?:string;maxRequests?:string|number;apiKey?:string;fetch?:typeof fetch};
export class TavilyConfigurationError extends Error {statusCode=400;}

const timeSensitivePattern=/\b(current|latest|today|now|price|pricing|cost|plan|version|release|api|ceo|president|prime minister|minister|law|legal|regulation|policy|supported|support|effective|rate|fee|salary|revenue|population|statistics?)\b/iu;
const requestLimit=(value:string|number|undefined)=>{
 const parsed=typeof value==='number'?value:Number(value);
 if(!Number.isInteger(parsed)||parsed<1||parsed>50)throw new TavilyConfigurationError('TAVILY_MAX_REQUESTS must be a whole number between 1 and 50 in live mode.');
 return parsed;
};
const liveEvidence=(claim:string,results:TavilyResult[],retrievedAt:string)=>results.map(normalizeSource).filter((result):result is TavilyResult&{url:string}=>!!result?.url).slice(0,3).map(result=>({url:result.url,title:result.title?.trim()||'Tavily result',retrievedAt,publishedAt:result.published_date,excerpt:result.content?.trim().slice(0,1200)||'No excerpt returned by Tavily.',relation:compareEvidence(claim,result,retrievedAt),retrieval:'tavily' as const}));
async function searchTavily(query:string,apiKey:string,fetcher:typeof fetch):Promise<TavilyResult[]> {
 const response=await fetcher('https://api.tavily.com/search',{signal:AbortSignal.timeout(10000),method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({query,search_depth:'basic',max_results:3,include_raw_content:false,include_answer:false})});
 if(!response.ok)throw new Error(`Tavily search failed with HTTP ${response.status}.`);
 const data=await response.json() as TavilyResponse;return Array.isArray(data.results)?data.results:[];
}
function mockVerification(text:string,asOf:string|undefined,now:string){
 const fixture=asOf?undefined:cases.find(candidate=>candidate.statement===text.trim());
 return ClaimVerification.parse({version:'1',id:randomUUID(),text,timeSensitive:fixture?.timeSensitive??(timeSensitivePattern.test(text)?'yes':'unknown'),outcome:fixture?.expectedOutcome??'inconclusive',freshness:fixture?.expectedFreshness??'unknown',asOf:asOf??now,uncertainty:fixture?`Offline fixture, not live Tavily evidence. ${fixture.uncertainty}`:asOf?'Explicit date scope requires temporal evidence; mock cannot verify this date.':'No exact offline fixture. Claim extraction is heuristic; current truth has not been established.',evidence:fixture&&fixture.expectedOutcome!=='inconclusive'?[{url:fixture.source,title:`Offline reference: ${fixture.id}`,retrievedAt:null,recordedAt:'2026-11-02T00:00:00.000Z',excerpt:fixture.reference,relation:fixture.expectedOutcome==='supported'?'supports':'contradicts',retrieval:'fixture'}]:[]});
}
function liveVerification(text:string,asOf:string|undefined,now:string,results:TavilyResult[]){
 if(asOf)return ClaimVerification.parse({version:'1',id:randomUUID(),text,timeSensitive:timeSensitivePattern.test(text)?'yes':'unknown',outcome:'inconclusive',freshness:'unknown',asOf,uncertainty:'Historical verification needs date-scoped retrieval and is not available in the live v1 verifier.',evidence:[]});
 const evidence=liveEvidence(text,results,now);
 const domains=(relation:string)=>new Set(evidence.filter(item=>item.relation===relation).map(item=>new URL(item.url).hostname.replace(/^www\./u,''))).size;
 const supports=domains('supports');const contradicts=domains('contradicts');
 const outcome=contradicts>=2&&supports===0?'contradicted':supports>=2&&contradicts===0?'supported':'inconclusive';const freshness=outcome==='supported'?'current':outcome==='contradicted'?'stale':'unknown';
 const uncertainty=outcome==='inconclusive'?'Requires a supported claim template and agreeing evidence dated within 30 days from two distinct hostnames, with no conflicting evidence. Search relevance alone is insufficient.':'Two distinct source hostnames provide recent matching entity and scope statements. This is a rule-based assessment; source independence and authority are not established. Review the evidence.';
 return ClaimVerification.parse({version:'1',id:randomUUID(),text,timeSensitive:timeSensitivePattern.test(text)?'yes':'unknown',outcome,freshness,asOf:now,uncertainty,evidence});
}
export async function verifyAnswer(input:VerifyRequest,options:VerifyOptions={}):Promise<VerificationReport> {
 const request=VerifyRequest.parse(input);const now=new Date().toISOString();const claims=request.claims??extractClaims(request.text).map(text=>({text,asOf:undefined}));const mode=options.mode??process.env.TAVILY_MODE??'mock';
 if(mode==='mock')return VerificationReport.parse({version:'1',id:randomUUID(),mode:'mock',createdAt:now,text:request.text,claims:claims.map(({text,asOf})=>mockVerification(text,asOf,now))});
 if(mode!=='live')throw new TavilyConfigurationError('TAVILY_MODE must be mock or live.');
 if((options.allowPaidRequests??process.env.ALLOW_PAID_REQUESTS)!=='true')throw new TavilyConfigurationError('Live Tavily is disabled. Set ALLOW_PAID_REQUESTS=true only after approving a request budget.');
 const apiKey=options.apiKey??process.env.TAVILY_API_KEY;if(!apiKey)throw new TavilyConfigurationError('TAVILY_API_KEY is required in live mode.');
 const budget=requestLimit(options.maxRequests??process.env.TAVILY_MAX_REQUESTS);const fetcher=options.fetch??fetch;let requestsUsed=0;const verified=[] as ClaimVerification[];
 const cache=new Map<string,ClaimVerification>();
 for(const claim of claims){
  const cacheKey=JSON.stringify([claim.text.trim().toLowerCase().replace(/\s+/gu,' '),claim.asOf??null]);
  const cached=cache.get(cacheKey);
  if(cached){verified.push({...cached,id:randomUUID(),text:claim.text});continue;}
  if(claim.asOf){verified.push(liveVerification(claim.text,claim.asOf,now,[]));continue;}
  const classification=classifyClaim(claim.text);
  if(classification.ambiguous||classification.timeSensitive==='unknown'){verified.push(ClaimVerification.parse({version:'1',id:randomUUID(),text:claim.text,timeSensitive:classification.timeSensitive,outcome:'inconclusive',freshness:'unknown',asOf:now,uncertainty:classification.ambiguous?'Claim needs an explicit entity or product before retrieval. No search was made.':'Claim was not identified as time-sensitive, so live retrieval was skipped to conserve the request budget.',evidence:[]}));continue;}
  if(requestsUsed>=budget){verified.push(ClaimVerification.parse({version:'1',id:randomUUID(),text:claim.text,timeSensitive:'yes',outcome:'inconclusive',freshness:'unknown',asOf:now,uncertainty:'Live request budget exhausted before this claim could be checked.',evidence:[]}));continue;}
  requestsUsed++;
  let result:ClaimVerification;
  try {
   const results=await searchTavily(`${claim.text} official current`,apiKey,fetcher);
   result=liveVerification(claim.text,undefined,new Date().toISOString(),results);
  } catch {
   result=ClaimVerification.parse({version:'1',id:randomUUID(),text:claim.text,timeSensitive:'yes',outcome:'inconclusive',freshness:'unknown',asOf:now,uncertainty:'Tavily retrieval failed, timed out, or returned invalid evidence. No retry was made; the attempted request counts toward the budget.',evidence:[]});
  }
  cache.set(cacheKey,result);verified.push(result);
 }
 return VerificationReport.parse({version:'1',id:randomUUID(),mode:'live',createdAt:now,text:request.text,claims:verified});
}
