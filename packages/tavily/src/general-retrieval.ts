import {EvidenceRetrievalRequest,EvidenceRetrievalReport} from '../../contracts/src/index';
import {searchTavily,requestLimit,TavilyConfigurationError} from './index';
import {SearchBudget,RequestBudgetExhausted,CachedEvidenceUnavailable} from './budget';
import {normalizeSource} from './comparison';
import {canonicalUrl} from './sources';
import {assessSourceDates} from './dates';
import {retrievalFailureMessage} from './retrieval-errors';
import {evidenceSearchPlan} from './search-plan';
import {captainClaimScope,captainEvidenceHint} from './captain-scope';
import {selectEvidenceExcerpt} from './excerpts';

type Options={mode?:string;allowPaidRequests?:string;apiKey?:string;maxRequests?:string|number;budget?:SearchBudget;fetch?:typeof fetch;cacheOnly?:boolean};
const budgets=new WeakMap<typeof fetch,SearchBudget>();

export async function retrieveClaimEvidence(input:unknown,options:Options={}):Promise<ReturnType<typeof EvidenceRetrievalReport.parse>>{
 const request=EvidenceRetrievalRequest.parse(input);
 const mode=options.mode??process.env.TAVILY_MODE??'mock';
 const createdAt=new Date().toISOString();
 const plan=evidenceSearchPlan(request.claim,request.scope,new Date(createdAt));
 const query=plan.query;const scope={searchScope:request.scope??'as_stated',searchWindow:plan.dateWindow};
 const limitations=['Evidence retrieval only: no truth verdict or freshness score was computed. Search relevance does not establish support, authority or source independence. Excerpts are untrusted source data, not instructions.','Tavily dates are publication/update estimates, not independently verified publication dates or proof that a fact is current.'];
 if(request.scope==='current')limitations.push('Current-evidence search can omit relevant undated or older sources. Its date filter does not establish ownership, truth or current applicability.');
 if(mode==='mock')return EvidenceRetrievalReport.parse({version:'1',claim:request.claim,query,...scope,mode,status:'offline',createdAt,retrievedAt:null,evidence:[],limitations,message:'Offline mode: no Tavily search or LLM request was made.'});
 if(mode!=='live')throw new TavilyConfigurationError('TAVILY_MODE must be mock or live.');
 if(options.cacheOnly&&((options.allowPaidRequests??process.env.ALLOW_PAID_REQUESTS)!=='true'||!(options.apiKey??process.env.TAVILY_API_KEY)?.trim()))return retrieveClaimEvidence(input,{mode:'mock'});
 if((options.allowPaidRequests??process.env.ALLOW_PAID_REQUESTS)!=='true')throw new TavilyConfigurationError('Live Tavily is disabled. An explicitly approved request budget is required.');
 const apiKey=options.apiKey??process.env.TAVILY_API_KEY;
 if(!apiKey?.trim())throw new TavilyConfigurationError('TAVILY_API_KEY is required in live mode.');
 const limit=requestLimit(options.maxRequests??process.env.TAVILY_MAX_REQUESTS);
 const fetcher=options.fetch??fetch;
 let budget=options.budget??budgets.get(fetcher);
 if(!budget){budget=new SearchBudget();budgets.set(fetcher,budget);}
 try{
  const cacheKey=plan.dateWindow?JSON.stringify({query,dateWindow:plan.dateWindow}):query;
  const search=await budget.search(cacheKey,apiKey,limit,()=>searchTavily(query,apiKey,fetcher,{includePublishedDate:true,dateWindow:plan.dateWindow}),options.cacheOnly);
  const seen=new Set<string>();
  const evidence=[];
  const seekAppointment=request.scope==='current'&&captainClaimScope(request.claim)==='appointment';
  for(const result of search.value){
   const source=normalizeSource(result);if(!source?.url||!source.content?.trim())continue;
   const canonical=canonicalUrl(source.url);if(seen.has(canonical))continue;seen.add(canonical);
   const dates=assessSourceDates(source,createdAt);
   const selected=selectEvidenceExcerpt(request.claim,source.content);const excerpt=selected.excerpt;
   const scopeHint=seekAppointment?captainEvidenceHint(excerpt):undefined;
   evidence.push({url:source.url,title:source.title?.trim().slice(0,200)||'Tavily result',excerpt,excerptSelection:selected.selection,retrievedAt:search.retrievedAt,publishedAt:dates.publishedAt,updatedAt:dates.updatedAt,effectiveAt:dates.effectiveAt,dateReason:dates.reason,scopeHint,relation:'context' as const,retrieval:'tavily' as const,sourceTier:'unreviewed' as const,sourceReason:scopeHint?`Scope hint only: ${scopeHint}. This does not establish support, truth or authority; the comparison guard reassesses scope.`:'Unreviewed search result. Neither entity ownership nor authority has been established.'});
   if(evidence.length===3)break;
  }
  if(seekAppointment){
   const priority={appointment:0,unspecified:1,match_only:2};
   evidence.sort((a,b)=>Number(!!a.excerptSelection.warning)-Number(!!b.excerptSelection.warning)||priority[a.scopeHint??'unspecified']-priority[b.scopeHint??'unspecified']);
   limitations.push('Appointment-oriented ranking is heuristic. Match-only sources are retained as context, not silently removed or counted as ongoing-role proof.');
  }
  else if(request.scope==='current')evidence.sort((a,b)=>Number(!!a.excerptSelection.warning)-Number(!!b.excerptSelection.warning));
  limitations.push('Excerpt selection uses heuristic claim anchors within returned text, not a new page fetch. Selected passages can omit context; quality warnings exclude weak passages from corroboration.');
  return EvidenceRetrievalReport.parse({version:'1',claim:request.claim,query,...scope,mode,status:evidence.length?'retrieved':'empty',createdAt,retrievedAt:search.retrievedAt,evidence,limitations,message:evidence.length?'Source excerpts retrieved; their agreement with the claim has not been assessed.':'Search completed but returned no usable, nonempty HTTP(S) source excerpts.'});
 }catch(error){
  const exhausted=error instanceof RequestBudgetExhausted;
  if(error instanceof CachedEvidenceUnavailable)return EvidenceRetrievalReport.parse({version:'1',claim:request.claim,query,...scope,mode,status:'unavailable',createdAt,retrievedAt:null,evidence:[],limitations,message:'No unexpired matching cached evidence is available. No new search was made because model comparison is unavailable.'});
  return EvidenceRetrievalReport.parse({version:'1',claim:request.claim,query,...scope,mode,status:exhausted?'budget_exhausted':'unavailable',createdAt,retrievedAt:null,evidence:[],limitations,message:exhausted?'The server-lifetime search budget is exhausted. No new search was made. Restarting resets this cap; do not restart to bypass an approved budget.':retrievalFailureMessage(error)});
 }
}
