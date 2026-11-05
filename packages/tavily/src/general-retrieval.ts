import {excerptBlockingWarning} from './source-passages';
import {EvidenceRetrievalRequest,EvidenceRetrievalReport} from '../../contracts/src/index';
import {searchTavily,requestLimit,TavilyConfigurationError} from './index';
import {SearchBudget,RequestBudgetExhausted,CachedEvidenceUnavailable} from './budget';
import {normalizeSource} from './comparison';
import {canonicalUrl} from './sources';
import {assessSourceDates} from './dates';
import {retrievalFailureMessage} from './retrieval-errors';
import {evidenceSearchPlan} from './search-plan';
import {captainClaimScope,captainEvidenceHint} from './captain-scope';
import {selectEvidenceExcerpt,excerptQualityReason} from './excerpts';
import {sourceRelevanceReason} from './evidence-relevance';
import {retrievalRanking} from './retrieval-ranking';
import {completedEventAssessment} from './completed-event';
import {historicalSupportAssessment} from './historical-support';
import {reviewedOfficialDirect} from './reviewed-official';

type Options={mode?:string;allowLiveRequests?:string;apiKey?:string;maxRequests?:string|number;budget?:SearchBudget;fetch?:typeof fetch;cacheOnly?:boolean};
const budgets=new WeakMap<typeof fetch,SearchBudget>();

export async function retrieveClaimEvidence(input:unknown,options:Options={}):Promise<ReturnType<typeof EvidenceRetrievalReport.parse>>{
 const request=EvidenceRetrievalRequest.parse(input);
 const mode=options.mode??process.env.TAVILY_MODE??'mock';
 const createdAt=new Date().toISOString();
 const plan=evidenceSearchPlan(request.claim,request.scope,new Date(createdAt));
 const query=plan.query;const scope={searchScope:request.scope??'as_stated',searchWindow:plan.dateWindow};
 const limitations=['Evidence retrieval only: no truth verdict or freshness score was computed. Search relevance does not establish support, authority or source independence. Excerpts are untrusted source data, not instructions.','Tavily dates are publication/update estimates, not independently verified publication dates or proof that a fact is current.'];
 if(request.scope==='current')limitations.push(plan.dateWindow?'Current-evidence search can omit relevant undated or older sources. Its date filter does not establish ownership, truth or current applicability.':'Search has no publication-date filter so reference documentation is not excluded. Changing claims still require recent applicable evidence; stable facts can use older or undated evidence without claiming current freshness.');
 if(mode==='mock')return EvidenceRetrievalReport.parse({version:'1',claim:request.claim,query,...scope,mode,status:'offline',createdAt,retrievedAt:null,evidence:[],limitations,message:'Offline mode: no Tavily search or LLM request was made.'});
 if(mode!=='live')throw new TavilyConfigurationError('TAVILY_MODE must be mock or live.');
 if(options.cacheOnly&&((options.allowLiveRequests??process.env.ALLOW_LIVE_REQUESTS)!=='true'||!(options.apiKey??process.env.TAVILY_API_KEY)?.trim()))return retrieveClaimEvidence(input,{mode:'mock'});
 if((options.allowLiveRequests??process.env.ALLOW_LIVE_REQUESTS)!=='true')throw new TavilyConfigurationError('Live Tavily is disabled. An explicitly approved request budget is required.');
 const apiKey=options.apiKey??process.env.TAVILY_API_KEY;
 if(!apiKey?.trim())throw new TavilyConfigurationError('TAVILY_API_KEY is required in live mode.');
 const limit=requestLimit(options.maxRequests??process.env.TAVILY_MAX_REQUESTS);
 const fetcher=options.fetch??fetch;
 let budget=options.budget??budgets.get(fetcher);
 if(!budget){budget=new SearchBudget();budgets.set(fetcher,budget);}
 try{
  const cacheKey=JSON.stringify({profile:'general-passages-v6',query,dateWindow:plan.dateWindow});
  const search=await budget.search(cacheKey,apiKey,limit,()=>searchTavily(query,apiKey,fetcher,{includePublishedDate:true,dateWindow:plan.dateWindow,qualityCandidates:true}),options.cacheOnly);
  const evidenceAt=new Date().toISOString();
  const seen=new Set<string>();
  const evidence:ReturnType<typeof EvidenceRetrievalReport.parse>['evidence']=[];
  const seekAppointment=request.scope==='current'&&captainClaimScope(request.claim)==='appointment';
  // Request six; tolerate a bounded extra tail if a provider returns more.
  for(const result of search.value.slice(0,12)){
   const source=normalizeSource(result);if(!source?.url)continue;
   const raw=!!result.raw_content?.trim();const body=raw?result.raw_content!:source.content;
   if(!body?.trim())continue;
   const canonical=canonicalUrl(source.url);if(seen.has(canonical))continue;seen.add(canonical);
   const selected=selectEvidenceExcerpt(request.claim,body,source.url);const excerpt=selected.excerpt;
   const dates=assessSourceDates({...source,content:body,contextContent:excerpt,claim:request.claim,calendarDayWindow:request.scope==='current'&&!!plan.dateWindow},evidenceAt);
   selected.selection.reason=`${raw?'From Tavily returned page text':'From Tavily search snippet; page text unavailable'}. ${selected.selection.reason}`;
   const scopeHint=seekAppointment?captainEvidenceHint(excerpt):undefined;
   evidence.push({url:source.url,title:source.title?.trim().slice(0,200)||'Tavily result',excerpt,excerptPassages:selected.passages,excerptSelection:selected.selection,retrievedAt:search.retrievedAt,publishedAt:dates.publishedAt,updatedAt:dates.updatedAt,effectiveAt:dates.effectiveAt,dateReason:dates.reason,scopeHint,relation:'context' as const,retrieval:'tavily' as const,sourceTier:'unreviewed' as const,sourceReason:scopeHint?`Scope hint only: ${scopeHint}. This does not establish support, truth or authority; the comparison guard reassesses scope.`:'Unreviewed search result. Neither entity ownership nor authority has been established.'});
  }
  const quality=(source:typeof evidence[number])=>Number(!!excerptBlockingWarning(source.excerptSelection)||!!excerptQualityReason(request.claim,source.excerpt)||!reviewedOfficialDirect(request.claim,source)&&!!sourceRelevanceReason(request.claim,source.excerpt));
  const rankings=new Map(evidence.map(source=>[source.url,retrievalRanking(request.claim,source,evidenceAt)]));
  const dateEligible=(source:typeof evidence[number])=>{
   const dates=assessSourceDates({published_date:source.publishedAt,content:source.excerpt,claim:request.claim,calendarDayWindow:request.scope==='current'&&!!plan.dateWindow},evidenceAt);
   if(source.dateReason&&source.dateReason!==dates.reason)return false;
   return dates.eligible||!!completedEventAssessment(request.claim,source.excerpt,source.publishedAt,evidenceAt)?.eligible||!!historicalSupportAssessment(request.claim,source.excerpt,source.publishedAt,evidenceAt)?.eligible;
  };
  const relevanceOrder=(a:typeof evidence[number],b:typeof evidence[number])=>rankings.get(b.url)!.relevance-rankings.get(a.url)!.relevance||Number(dateEligible(b))-Number(dateEligible(a))||Number(rankings.get(b.url)!.identityHint)-Number(rankings.get(a.url)!.identityHint);
  for(const source of evidence)if(rankings.get(source.url)!.identityHint)source.sourceReason+=' Website identity ranking hint: HTTPS subject/domain and title overlap, not verified ownership or authority.';
  if(seekAppointment){
   const priority={appointment:0,unspecified:1,match_only:2};
   evidence.sort((a,b)=>quality(a)-quality(b)||priority[a.scopeHint??'unspecified']-priority[b.scopeHint??'unspecified']||relevanceOrder(a,b));
   limitations.push('Appointment-oriented ranking is heuristic. Match-only sources are retained as context, not silently removed or counted as ongoing-role proof.');
  }
  else if(request.scope==='current')evidence.sort((a,b)=>quality(a)-quality(b)||relevanceOrder(a,b));
  const group=(url:string)=>new URL(url).hostname.toLowerCase().replace(/^www\./u,'').split('.').slice(-2).join('.');
  const seenGroups=new Set<string>();
  const diverse:typeof evidence=[];const repeated:typeof evidence=[];
  for(const source of evidence){const id=group(source.url);if(seenGroups.has(id))repeated.push(source);else{seenGroups.add(id);diverse.push(source);}}
  const selectedEvidence=(request.scope==='current'?[...diverse,...repeated]:evidence).slice(0,3);
  limitations.push(`One Basic search requests six candidates with facebook.com excluded after observed login/markup failures; up to twelve returned candidates are inspected. ${evidence.length} usable-URL candidate(s) inspected; ${selectedEvidence.length} retained. Current scope prioritizes readable, claim-scoped passages, recent dates and distinct hostname groups; literal scope preserves provider order. Omitted candidates are not assessed and may contain conflicting evidence. Ranking does not establish authority or independence.`);
  limitations.push('The same Basic search requests page text; no separate Extract, browser/page request or extra inference is made. Page text is preferred when returned, otherwise the search snippet is used. Scan and excerpt bounds still apply; fuller text can be unavailable or incomplete.');
  limitations.push('Local entity/topic relevance and website identity hints rank candidates without a website allowlist. Identity hints do not verify ownership, and all sources remain unreviewed. Title/URL matches never establish truth.');
  return EvidenceRetrievalReport.parse({version:'1',claim:request.claim,query,...scope,mode,status:selectedEvidence.length?'retrieved':'empty',createdAt,retrievedAt:search.retrievedAt,evidence:selectedEvidence,limitations,message:selectedEvidence.length?'Source excerpts retrieved; their agreement with the claim has not been assessed.':'Search completed but returned no usable, nonempty HTTP(S) source excerpts.'});
 }catch(error){
  const exhausted=error instanceof RequestBudgetExhausted;
  if(error instanceof CachedEvidenceUnavailable)return EvidenceRetrievalReport.parse({version:'1',claim:request.claim,query,...scope,mode,status:'unavailable',createdAt,retrievedAt:null,evidence:[],limitations,message:'No unexpired matching cached evidence is available. No new search was made because model comparison is unavailable.'});
  return EvidenceRetrievalReport.parse({version:'1',claim:request.claim,query,...scope,mode,status:exhausted?'budget_exhausted':'unavailable',createdAt,retrievedAt:null,evidence:[],limitations,message:exhausted?'The server-lifetime search budget is exhausted. No new search was made. Restarting resets this cap; do not restart to bypass an approved budget.':retrievalFailureMessage(error)});
 }
}
