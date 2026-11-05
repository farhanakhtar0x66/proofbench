import {mkdir,writeFile} from 'node:fs/promises';
import {bifrostSettings,createBifrostInterpreter} from '../packages/tavily/src/bifrost-interpreter';
import {checkBifrostStack} from '../packages/tavily/src/bifrost-status';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';

// Real inference with synthetic source envelopes, never real Tavily retrieval.
const settings=bifrostSettings();
const claim='Morgan Vale is the captain of Acme FC.';
const replacement='Taylor Reed is the captain of Acme FC.';
const checks:{name:string;passed:boolean;outcome:string;method:string;gatewayRequests:number;correction:string|null;explanation:string}[]=[];
const diagnostics:{status:number;comparisonJson:boolean;assessmentCount:number|null;sourceIdsMatch:boolean|null;wholeQuotesMatch:boolean|null}[]=[];
let requests=0;
try{
 await checkBifrostStack();
 const fetcher:typeof fetch=async(url,init)=>{
  if(String(url)!==new URL('/v1/chat/completions',settings.endpoint).href||requests>=3)throw new Error('Unexpected destination or excess request blocked');
  requests++;
  const response=await fetch(url,init);
  const diagnostic={status:response.status,comparisonJson:false,assessmentCount:null as number|null,sourceIdsMatch:null as boolean|null,wholeQuotesMatch:null as boolean|null};
  try{
   const wire=await response.clone().json();
   const value=JSON.parse(wire.choices[0].message.content);
   const context=JSON.parse(JSON.parse(JSON.parse(String(init?.body)).messages[1].content).untrustedText);
   if(Array.isArray(value.assessments)){
    diagnostic.comparisonJson=true;diagnostic.assessmentCount=value.assessments.length;
    diagnostic.sourceIdsMatch=value.assessments.length===context.sources.length&&value.assessments.every((item:{sourceId?:unknown},i:number)=>item.sourceId===context.sources[i]?.sourceId);
    diagnostic.wholeQuotesMatch=value.assessments.length===context.sources.length&&value.assessments.every((item:{quote?:unknown},i:number)=>item.quote===context.sources[i]?.excerpt);
   }
  }catch{/* Record only structural metadata, never raw provider bodies or source text. */}
  diagnostics.push(diagnostic);return response;
 };
 const interpreter=createBifrostInterpreter({...process.env,BIFROST_LLM_MAX_REQUESTS:String(Math.min(settings.maxRequests,3))},fetcher);
 const scenarios=[
  {name:'missing_evidence',excerpts:[],outcome:'inconclusive',method:'rules_fallback',correction:null},
  {name:'supported',excerpts:[`${claim} This notice describes the current first-team captain.`,`${claim} This is the club's current captain.`],outcome:'supported',method:'llm',correction:null},
  {name:'contradicted_with_correction',excerpts:[`${replacement} This notice describes the current first-team captain.`,`${replacement} This is the club's current captain.`],outcome:'contradicted',method:'llm',correction:replacement},
  {name:'conflicting_evidence',excerpts:[`${claim} This notice describes the current first-team captain.`,`${replacement} This is the club's current captain.`],outcome:'inconclusive',method:'llm',correction:null},
 ];
 for(const scenario of scenarios){
  const now=new Date().toISOString();
  const evidence=EvidenceRetrievalReport.parse({version:'1',claim,query:claim,mode:'live',status:scenario.excerpts.length?'retrieved':'empty',createdAt:now,retrievedAt:now,message:'SYNTHETIC source envelope; no retrieval occurred.',limitations:['Source URLs, publication/retrieval dates and excerpts are simulated.'],evidence:scenario.excerpts.map((excerpt,i)=>({url:`https://${i?'second':'first'}.example/pricing`,title:'Synthetic source',excerpt,relation:'context',retrieval:'tavily',publishedAt:now,retrievedAt:now}))});
  const before=requests;
  const result=await compareClaimEvidence(evidence,{mode:'llm',interpreter});
  const used=requests-before;
  const passed=result.outcome===scenario.outcome&&result.method===scenario.method&&(result.correction?.text??null)===scenario.correction&&used===(scenario.excerpts.length?1:0);
  checks.push({name:scenario.name,passed,outcome:result.outcome,method:result.method,gatewayRequests:used,correction:result.correction?.text??null,explanation:result.explanation});
  console.log(`${passed?'PASS':'FAIL'} ${scenario.name}: ${result.outcome}, ${result.method}, ${used} request(s)`);
 }
 if(checks.some(check=>!check.passed))process.exitCode=1;
}catch{console.error('Comparison smoke check blocked or failed. No inference retry or alternative provider was used.');process.exitCode=1;}
finally{
 await mkdir('.local/bifrost-benchmark',{recursive:true});
 await writeFile(`.local/bifrost-benchmark/comparison-check-${settings.provider}.json`,JSON.stringify({model:settings.model,createdAt:new Date().toISOString(),passed:checks.length===4&&checks.every(check=>check.passed),checks,diagnostics,gatewayRequests:requests,realTavilyCalls:0,syntheticEvidence:true,notice:'Real gateway inference against synthetic source excerpts, URLs and dates. This checks schema handling and controlled behavior, not current real-world truth, source quality, general accuracy or Bifrost challenge completion.'},null,2));
 console.log(`${requests} gateway request attempts, zero Tavily searches. Report saved locally.`);
}
