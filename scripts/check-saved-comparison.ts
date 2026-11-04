import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {EvidenceRetrievalReport,ClaimExtractionReport} from '../packages/contracts/src/index';
import {bifrostSettings,createBifrostInterpreter} from '../packages/tavily/src/bifrost-interpreter';
import {checkBifrostStack} from '../packages/tavily/src/bifrost-status';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';

// Reuse the real-source snapshot after the failed comparison, not a new search.
const previous=JSON.parse(await readFile('.local/general-flow-check/report.json','utf8'));
assert.equal(previous.status,'comparison_failed');assert.equal(previous.gatewayRequests,2);assert.equal(previous.tavilySearchAttempts,1);
const extraction=ClaimExtractionReport.parse(previous.extraction);
assert.equal(extraction.method,'llm');assert.equal(extraction.claims.length,1);assert.equal(extraction.claims[0].text,previous.claim);
const evidence=EvidenceRetrievalReport.parse(previous.retrieval);
assert.equal(evidence.mode,'live');assert.equal(evidence.status,'retrieved');assert.equal(evidence.claim,previous.claim);
const settings=bifrostSettings();assert.equal(settings.model,previous.model);
if(process.argv.includes('--preflight-only')){
 console.log('PASS saved real-source envelope and previous request counts validated. No network requests made.');
}else{
 if(process.env.BIFROST_LLM_MAX_REQUESTS!=='1'||process.env.TAVILY_MODE!=='mock'||process.env.ALLOW_LIVE_REQUESTS!=='false'||process.env.TAVILY_MAX_REQUESTS!=='0')throw new Error('One new model request and zero Tavily allowance are required for this continuation.');
 const output='.local/general-flow-check/comparison-resume.json';
 // Reserve this continuation before any inference; never overwrite/repeat silently.
 await writeFile(output,JSON.stringify({status:'reserved',createdAt:new Date().toISOString(),model:settings.model}),{flag:'wx'});
 let requests=0;let result:unknown=null;let status='failed';
 try{
  await checkBifrostStack();
  const fetcher:typeof fetch=async(url,init)=>{
   if(String(url)!==new URL('/v1/chat/completions',settings.endpoint).href||requests>=1)throw new Error('Unexpected destination or additional request blocked');
   requests++;return fetch(url,init);
  };
  const interpreter=createBifrostInterpreter(process.env,fetcher);
  const assessed=await compareClaimEvidence(evidence,{mode:'llm',interpreter});result=assessed;
  if(assessed.method==='llm'){status='completed_with_saved_evidence';console.log(`PASS saved-source comparison: ${assessed.outcome}`);}
  else{status=requests?'comparison_failed':'comparison_not_exercised';process.exitCode=1;console.log(`INCOMPLETE: ${assessed.explanation}`);}
 }catch{console.error('Saved-source comparison failed. No retry or alternate provider was used.');process.exitCode=1;}
 finally{
  await writeFile(output,JSON.stringify({createdAt:new Date().toISOString(),status,model:settings.model,sourceReportCreatedAt:previous.createdAt,additionalGatewayRequests:requests,additionalTavilySearches:0,totalFlowGatewayRequests:2+requests,totalFlowTavilySearches:1,result,notice:'Continuation from saved real retrieved excerpts. This is not a fresh one-process full-flow run or independent verification of factual accuracy. No sources or dates were replaced.'},null,2));
  console.log(`${requests} additional model request(s), zero additional searches. Original report preserved.`);
 }
}
