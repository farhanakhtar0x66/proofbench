import {SearchBudget,verifyAnswer} from '../packages/tavily/src/index';

export async function practiceVerification(claim:string,sources:[string,string]){
 const date=new Date().toISOString();
 const fakeFetch:typeof fetch=async()=>Response.json({results:sources.filter(text=>text.trim()).map((content,i)=>({
  url:`https://practice-source-${i}.example/simulated`,title:`Simulated source ${i+1}`,content,published_date:date,
 }))});
 // Explicit dependency injection makes the entire search pipeline offline.
 const report=await verifyAnswer({version:'1',text:claim,claims:[{text:claim}]},{mode:'live',allowLiveRequests:'true',apiKey:'offline-placeholder',maxRequests:1,fetch:fakeFetch,budget:new SearchBudget()});
 const result=report.claims[0];
 return {
  simulated:true as const,
  notice:'Practice only. Source URLs and publication dates are simulated. No live facts were checked.',
  claim:result.text,
  outcome:result.outcome,
  freshness:result.freshness,
  freshnessScore:result.freshnessScore??null,
  explanation:`SIMULATED evidence: ${result.uncertainty}`,
  sources:result.evidence.map(item=>({text:item.excerpt,relation:item.relation})),
 };
}
