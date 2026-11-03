import {randomUUID} from 'node:crypto';
import {AnalysisRequest,AnalysisReport,EvidenceRetrievalRequest} from '../../contracts/src/index';
import {SearchBudget} from './budget';
import {extractFactualClaims} from './claim-extraction';
import {retrieveClaimEvidence} from './general-retrieval';
import {compareClaimEvidence} from './evidence-comparison';
import type {LanguageInterpreter} from './interpretation';

type Options={tavilyMode:string;budget:SearchBudget;interpreter?:LanguageInterpreter;extractionMode:'rules'|'llm';comparisonMode:'rules'|'llm'};

export async function compareGeneralClaim(input:unknown,options:Options){
 const request=EvidenceRetrievalRequest.parse(input);const {interpreter,comparisonMode}=options;
 const available=comparisonMode==='llm'&&!!interpreter?.compareEvidence&&!!interpreter.canRequest?.();
 const reason=comparisonMode!=='llm'?'General comparison is disabled in rules-only mode. No model request was made.':!interpreter?.compareEvidence?'No general evidence-comparison adapter is available.':!available?interpreter.unavailableReason?.()??'The model is temporarily unavailable. No model request was made.':undefined;
 const retrieval=await retrieveClaimEvidence(request,{mode:options.tavilyMode,budget:options.budget,cacheOnly:!available});
 const comparison=await compareClaimEvidence(retrieval,{mode:available?'llm':'rules',interpreter,unavailableReason:reason});
 return {retrieval,comparison};
}

function boundedInterpreter(base:LanguageInterpreter|undefined){
 if(!base)return;
 let attempts=0;
 const reason=()=>attempts>=4?'The analysis model-attempt limit is exhausted. No additional model request was made.':base.unavailableReason?.();
 const invoke=async(method:'interpret'|'extractClaims'|'compareEvidence',text:string)=>{
  if(attempts>=4||base.canRequest?.()===false)throw new Error('Model request unavailable');
  attempts++;return base[method]!(text);
 };
 return {description:base.description,timeoutMs:base.timeoutMs,canRequest:()=>attempts<4&&base.canRequest?.()===true,unavailableReason:reason,interpret:(text:string)=>invoke('interpret',text),...(base.extractClaims?{extractClaims:(text:string)=>invoke('extractClaims',text)}:{}),...(base.compareEvidence?{compareEvidence:(text:string)=>invoke('compareEvidence',text)}:{})} satisfies LanguageInterpreter;
}

export async function analyzeAnswer(input:unknown,options:Options){
 const request=AnalysisRequest.parse(input);const createdAt=new Date().toISOString();
 const interpreter=boundedInterpreter(options.interpreter);
 const extraction=await extractFactualClaims(request.text,{mode:options.extractionMode,interpreter});
 const seen=new Set<string>();
 const unique=extraction.claims.filter(claim=>{if(seen.has(claim.text))return false;seen.add(claim.text);return true;});
 const selected=unique.slice(0,3);const omittedClaims=unique.length-selected.length;
 const results=[];
 // Sequential processing shares server budgets, cache and inference cooldown.
 for(const claim of selected){
  const result=await compareGeneralClaim({version:'1',claim:claim.text,scope:request.scope},{...options,interpreter});
  results.push({claim,...result});
 }
 return AnalysisReport.parse({version:'1',id:randomUUID(),mode:options.tavilyMode,createdAt,text:request.text,scope:request.scope??'as_stated',status:!results.length?'no_claims':omittedClaims||extraction.method==='rules_fallback'||results.some(result=>result.comparison.method!=='llm')?'partial':'complete',extraction,omittedClaims,results,limits:{maxClaims:3,maxModelAttempts:4},limitations:['At most three distinct extracted claims are processed, in source order. Repeated identical statements share one result; exact original offsets are retained. Extraction can omit statements.', 'Complete means all selected comparisons returned validated model assessments; inconclusive remains a valid outcome. Partial results are not a confirmed factual verdict.', 'At most four inference attempts and three claim searches per analysis; shared server limits can be lower. Model catalog requests are separate and are not counted by these inference limits.', 'Rules-only mode remains available without a model. This endpoint does not invent live evidence, general rules-based verdicts, calibrated freshness scores or corrections.']});
}
