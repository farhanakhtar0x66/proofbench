import {randomUUID} from 'node:crypto';
import {ClaimVerification,VerifyRequest,VerificationReport} from '../../contracts/src/index';
import cases from '../../../fixtures/freshness-cases/v1.json';

type TavilyResult={title?:string;url?:string;content?:string;score?:number;published_date?:string};
type TavilyResponse={results?:TavilyResult[]};
type VerifyOptions={mode?:string;allowPaidRequests?:string;maxRequests?:string|number;apiKey?:string;fetch?:typeof fetch};
export class TavilyConfigurationError extends Error {statusCode=400;}

const timeSensitivePattern=/\b(current|latest|today|now|price|pricing|cost|plan|version|release|api|ceo|president|prime minister|minister|law|legal|regulation|policy|supported|support|effective|rate|fee|salary|revenue|population|statistics?)\b/iu;
const wordTokens=(text:string)=>text.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
const meaningfulTokens=(text:string)=>new Set(wordTokens(text).filter(token=>token.length>2&&!['the','and','for','with','from','that','this','are','was','has','have','will','its','not'].includes(token)));
const extractClaims=(text:string)=>text.split(/(?<=[.!?])\s+|\n+/u).map(value=>value.trim()).filter(Boolean).slice(0,50);
const requestLimit=(value:string|number|undefined)=>{
 const parsed=typeof value==='number'?value:Number(value);
 if(!Number.isInteger(parsed)||parsed<1||parsed>50)throw new TavilyConfigurationError('TAVILY_MAX_REQUESTS must be a whole number between 1 and 50 in live mode.');
 return parsed;
};
const overlap=(claim:string,evidence:string)=>{
 const claimTokens=meaningfulTokens(claim);const evidenceTokens=meaningfulTokens(evidence);
 if(claimTokens.size===0)return 0;
 let matches=0;for(const token of claimTokens)if(evidenceTokens.has(token))matches++;
 return matches/claimTokens.size;
};
const explicitValues=(text:string)=>wordTokens(text).filter(token=>/\d/u.test(token)||/^v?\d+(?:\.\d+)+$/u.test(token));
const relationFor=(claim:string,result:TavilyResult):'supports'|'contradicts'|'context'=>{
 const evidence=`${result.title??''} ${result.content??''}`;const score=overlap(claim,evidence);
 if(score>=0.7)return 'supports';
 const claimValues=explicitValues(claim);const evidenceValues=explicitValues(evidence);
 if(score>=0.3&&claimValues.length>0&&evidenceValues.some(value=>!claimValues.includes(value)))return 'contradicts';
 return 'context';
};
const liveEvidence=(claim:string,results:TavilyResult[],retrievedAt:string)=>results.filter((result):result is TavilyResult&{url:string}=>typeof result.url==='string').slice(0,3).map(result=>({url:result.url,title:result.title?.trim()||'Tavily result',retrievedAt,publishedAt:result.published_date,excerpt:result.content?.trim().slice(0,1200)||'No excerpt returned by Tavily.',relation:relationFor(claim,result),retrieval:'tavily' as const}));
async function searchTavily(query:string,apiKey:string,fetcher:typeof fetch):Promise<TavilyResult[]> {
 const response=await fetcher('https://api.tavily.com/search',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({query,search_depth:'basic',max_results:3,include_raw_content:false,include_answer:false})});
 if(!response.ok)throw new Error(`Tavily search failed with HTTP ${response.status}.`);
 const data=await response.json() as TavilyResponse;return Array.isArray(data.results)?data.results:[];
}
function mockVerification(text:string,asOf:string|undefined,now:string){
 const fixture=asOf?undefined:cases.find(candidate=>candidate.statement===text.trim());
 return ClaimVerification.parse({version:'1',id:randomUUID(),text,timeSensitive:fixture?.timeSensitive??(timeSensitivePattern.test(text)?'yes':'unknown'),outcome:fixture?.expectedOutcome??'inconclusive',freshness:fixture?.expectedFreshness??'unknown',asOf:asOf??now,uncertainty:fixture?`Offline fixture, not live Tavily evidence. ${fixture.uncertainty}`:asOf?'Explicit date scope requires temporal evidence; mock cannot verify this date.':'No exact offline fixture. Claim extraction is heuristic; current truth has not been established.',evidence:fixture&&fixture.expectedOutcome!=='inconclusive'?[{url:fixture.source,title:`Offline reference: ${fixture.id}`,retrievedAt:null,recordedAt:'2026-11-02T00:00:00.000Z',excerpt:fixture.reference,relation:fixture.expectedOutcome==='supported'?'supports':'contradicts',retrieval:'fixture'}]:[]});
}
function liveVerification(text:string,asOf:string|undefined,now:string,results:TavilyResult[]){
 if(asOf)return ClaimVerification.parse({version:'1',id:randomUUID(),text,timeSensitive:timeSensitivePattern.test(text)?'yes':'unknown',outcome:'inconclusive',freshness:'unknown',asOf,uncertainty:'Historical verification needs date-scoped retrieval and is not available in the live v1 verifier.',evidence:[]});
 const evidence=liveEvidence(text,results,now);const supports=evidence.filter(item=>item.relation==='supports').length;const contradicts=evidence.filter(item=>item.relation==='contradicts').length;
 const outcome=contradicts>0&&supports===0?'contradicted':supports>0&&contradicts===0?'supported':'inconclusive';const freshness=outcome==='supported'?'current':outcome==='contradicted'?'stale':'unknown';
 const uncertainty=outcome==='inconclusive'?'Live sources did not provide enough direct, unambiguous evidence for a verdict.':outcome==='supported'?'Current Tavily evidence directly overlaps the submitted claim.':'Current Tavily evidence contains a conflicting explicit value; review the cited sources.';
 return ClaimVerification.parse({version:'1',id:randomUUID(),text,timeSensitive:timeSensitivePattern.test(text)?'yes':'unknown',outcome,freshness,asOf:now,uncertainty,evidence});
}
export async function verifyAnswer(input:VerifyRequest,options:VerifyOptions={}):Promise<VerificationReport> {
 const request=VerifyRequest.parse(input);const now=new Date().toISOString();const claims=request.claims??extractClaims(request.text).map(text=>({text,asOf:undefined}));const mode=options.mode??process.env.TAVILY_MODE??'mock';
 if(mode==='mock')return VerificationReport.parse({version:'1',id:randomUUID(),mode:'mock',createdAt:now,text:request.text,claims:claims.map(({text,asOf})=>mockVerification(text,asOf,now))});
 if(mode!=='live')throw new TavilyConfigurationError('TAVILY_MODE must be mock or live.');
 if((options.allowPaidRequests??process.env.ALLOW_PAID_REQUESTS)!=='true')throw new TavilyConfigurationError('Live Tavily is disabled. Set ALLOW_PAID_REQUESTS=true only after approving a request budget.');
 const apiKey=options.apiKey??process.env.TAVILY_API_KEY;if(!apiKey)throw new TavilyConfigurationError('TAVILY_API_KEY is required in live mode.');
 const budget=requestLimit(options.maxRequests??process.env.TAVILY_MAX_REQUESTS);const fetcher=options.fetch??fetch;let requestsUsed=0;const verified=[] as ClaimVerification[];
 for(const claim of claims){
  if(claim.asOf){verified.push(liveVerification(claim.text,claim.asOf,now,[]));continue;}
  if(!timeSensitivePattern.test(claim.text)){verified.push(ClaimVerification.parse({version:'1',id:randomUUID(),text:claim.text,timeSensitive:'unknown',outcome:'inconclusive',freshness:'unknown',asOf:now,uncertainty:'Claim was not identified as time-sensitive, so live retrieval was skipped to conserve the request budget.',evidence:[]}));continue;}
  if(requestsUsed>=budget){verified.push(ClaimVerification.parse({version:'1',id:randomUUID(),text:claim.text,timeSensitive:'yes',outcome:'inconclusive',freshness:'unknown',asOf:now,uncertainty:'Live request budget exhausted before this claim could be checked.',evidence:[]}));continue;}
  requestsUsed++;const results=await searchTavily(`${claim.text} official current`,apiKey,fetcher);verified.push(liveVerification(claim.text,undefined,now,results));
 }
 return VerificationReport.parse({version:'1',id:randomUUID(),mode:'live',createdAt:now,text:request.text,claims:verified});
}
