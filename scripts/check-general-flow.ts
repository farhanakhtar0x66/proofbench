import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app';
import {ClaimExtractionReport,EvidenceRetrievalReport,EvidenceComparisonReport} from '../packages/contracts/src/index';
import {bifrostSettings} from '../packages/tavily/src/bifrost-interpreter';
import {checkBifrostStack} from '../packages/tavily/src/bifrost-status';

const resume=process.argv.includes('--resume-extraction');
if(process.env.TAVILY_MODE!=='live'||process.env.ALLOW_PAID_REQUESTS!=='true'||process.env.TAVILY_MAX_REQUESTS!=='1'||process.env.LANGUAGE_MODE!=='bifrost'||process.env.BIFROST_LLM_MAX_REQUESTS!==(resume?'1':'2')||process.env.CLAIM_EXTRACTION_MODE!=='llm'||process.env.EVIDENCE_COMPARISON_MODE!=='llm')throw new Error('Explicit test settings required: one search, two total model attempts (one remaining for resume), and extraction/comparison enabled.');
const settings=bifrostSettings();
const claim='Cristiano Ronaldo is captain of Real Madrid.';
const upstream=globalThis.fetch;
let searches=0;let inferences=0;
let status='failed';const stages:{name:string;passed:boolean}[]=[];
let extraction:unknown=null;let retrieval:unknown=null;let comparison:unknown=null;
let priorInferences=0;let savedExtraction:unknown;
if(resume){
 const previous=JSON.parse(await readFile('.local/general-flow-check/report.json','utf8'));
 assert.equal(previous.status,'failed');assert.equal(previous.claim,claim);assert.equal(previous.gatewayRequests,1);assert.equal(previous.tavilySearchAttempts,0);
 const saved=ClaimExtractionReport.parse(previous.extraction);assert.equal(saved.method,'rules_fallback');assert.equal(saved.claims.length,1);assert.equal(saved.claims[0].text,claim);
 savedExtraction=saved;priorInferences=1;
 await writeFile('.local/general-flow-check/extraction-timeout.json',JSON.stringify(previous,null,2),{flag:'wx'});
}
const directory=await mkdtemp(join(tmpdir(),'b05-full-flow-'));
let app:Awaited<ReturnType<typeof createApp>>|undefined;
try{
 await checkBifrostStack();
 globalThis.fetch=async(input,init)=>{
  const url=String(input);
  if(url==='https://api.tavily.com/search'){if(searches>=1)throw new Error('Search cap reached');searches++;}
  else if(url===new URL('/v1/chat/completions',settings.endpoint).href){if(inferences+priorInferences>=2)throw new Error('Inference cap reached');inferences++;}
  else throw new Error('Unexpected destination blocked');
  return upstream(input,{...init,redirect:'error'});
 };
 app=await createApp({implementation:'mock',tavilyMode:'live',dataDir:directory});
 let claims;
 if(resume)claims=ClaimExtractionReport.parse(savedExtraction);
 else{const extracted=await app.inject({method:'POST',url:'/api/claims/extract',payload:{version:'1',text:claim}});assert.equal(extracted.statusCode,200);claims=ClaimExtractionReport.parse(extracted.json());}
 extraction=claims;
 assert.equal(claims.claims.length,1);assert.equal(claims.claims[0].text,claim);
 const extractionFallback=claims.method!=='llm';
 stages.push({name:extractionFallback?'heuristic_extraction_fallback':'real_claim_extraction',passed:true});console.log(extractionFallback?'PASS heuristic fallback retained exact claim; no extraction retry':'PASS real claim extraction');
 const payload={version:'1',claim:claims.claims[0].text};
 const retrieved=await app.inject({method:'POST',url:'/api/claims/retrieve',payload});assert.equal(retrieved.statusCode,200);
 const evidence=EvidenceRetrievalReport.parse(retrieved.json());retrieval=evidence;
 assert.equal(evidence.status,'retrieved');assert.ok(evidence.evidence.length>0);assert.equal(searches,1);
 stages.push({name:'real_evidence_retrieval',passed:true});console.log(`PASS real retrieval: ${evidence.evidence.length} source excerpts`);
 const compared=await app.inject({method:'POST',url:'/api/claims/compare',payload});assert.equal(compared.statusCode,200);
 const result=EvidenceComparisonReport.parse(compared.json());comparison=result;assert.equal(searches,1);
 stages.push({name:'retrieval_cache_reused',passed:true});console.log('PASS comparison reused the search cache');
 if(result.method==='llm'){
  assert.equal(inferences+priorInferences,2);status=extractionFallback?'completed_with_extraction_fallback':'completed';stages.push({name:'real_evidence_comparison',passed:true});
  console.log(`PASS real comparison: ${result.outcome}`);
 }else{
  status=inferences+priorInferences===1?'comparison_not_exercised':'comparison_failed';
  stages.push({name:'real_evidence_comparison',passed:false});process.exitCode=1;
  console.log(`INCOMPLETE: ${result.explanation}`);
 }
}catch{console.error('End-to-end check stopped at a failed stage. No automatic retry or alternative provider was used.');process.exitCode=1;}
finally{
 globalThis.fetch=upstream;
 try{await app?.close();}finally{await rm(directory,{recursive:true,force:true});}
 await mkdir('.local/general-flow-check',{recursive:true});
 await writeFile('.local/general-flow-check/report.json',JSON.stringify({createdAt:new Date().toISOString(),status,stages,claim,model:settings.model,tavilySearchAttempts:searches,expectedTavilyCredits:searches?1:0,gatewayRequests:inferences+priorInferences,currentRunGatewayRequests:inferences,extraction,retrieval,comparison,notice:'A comparison may abstain before inference when evidence does not qualify. Only completed status exercises all model stages. completed_with_extraction_fallback reuses a saved heuristic extraction after one timed-out model attempt. This is a single-case pipeline check, not independent factual accuracy or billing verification.'},null,2));
 console.log(`${searches} Tavily search attempt(s), ${inferences} new Gemini request(s), ${inferences+priorInferences} total across this check. Local report saved.`);
}
