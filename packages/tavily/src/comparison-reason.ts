import {ComparisonReasonCode} from '../../contracts/src/index';
import type {z} from 'zod';

type Code=z.infer<typeof ComparisonReasonCode>;
export type ComparisonDiagnostic={reasonCode:Code;shortReason:string;verificationStatus:'completed'|'blocked'|'failed'};
const labels:Record<Code,string>={supported:'Sources support the claim.',contradicted:'Sources contradict the claim.',conflicting_evidence:'Sources disagree.',insufficient_evidence:'Evidence does not establish a verdict.',insufficient_sources:'Not enough eligible, independent sources.',source_dates_uncertain:'No sources pass publication or fact-date checks.',source_context_incomplete:'Source text is incomplete or not usable.',source_scope_mismatch:'Sources do not match the claim’s entity, version or scope.',duplicate_sources:'Repeated sources do not provide independent corroboration.',offline:'Live source retrieval is disabled.',rules_only:'Model comparison is disabled.',model_unavailable:'Could not verify: the model service is unavailable.',model_request_rejected:'Could not verify: the model request or response failed validation.',provider_busy:'Could not verify: the model provider is busy or temporarily unavailable.',model_timeout:'Could not verify: the model timed out. No verdict was reached.',rate_limited:'Could not verify: the model provider rate limit was reached.',budget_exhausted:'Request allowance exhausted.',invalid_model_response:'Could not verify: the model response failed validation.',invalid_evidence:'Source data failed validation.',unsafe_input:'Instruction-like source text needs review.',ambiguous_claim:'The claim needs clearer scope.'};

/** Public diagnostics contain fixed labels, never raw provider messages or credentials. */
export function comparisonReason(outcome:'supported'|'contradicted'|'inconclusive',explanation:string,completed=false,offline=false):ComparisonDiagnostic{
 const code:Code=outcome==='supported'?'supported':outcome==='contradicted'?'contradicted':completed?/conflict/iu.test(explanation)?'conflicting_evidence':'insufficient_evidence':offline?'offline':
 /HTTP 400/iu.test(explanation)?'model_request_rejected':/HTTP 503/iu.test(explanation)?'provider_busy':/rate limit/iu.test(explanation)?'rate_limited':/timed out|timeout/iu.test(explanation)?'model_timeout':/budget|allowance|cap .*exhaust|cap is zero/iu.test(explanation)?'budget_exhausted':/invalid.*(?:output|structure|chat|JSON)|schema validation|structured response|model (?:changed|omitted|repeated)|correction.*(?:claim|corroborat)|comparison failed/iu.test(explanation)?'invalid_model_response':/gateway|Bifrost|provider|key|adapter|model.*(?:unavailable|configured)|Free tier/iu.test(explanation)?'model_unavailable':/rules-only|disabled/iu.test(explanation)?'rules_only':/currency|ambig/iu.test(explanation)?'ambiguous_claim':/Instruction-like/iu.test(explanation)?'unsafe_input':/invalid|exceeds/iu.test(explanation)?'invalid_evidence':'insufficient_sources';
 const verificationStatus=completed?'completed':['model_request_rejected','provider_busy','model_timeout','invalid_model_response','model_unavailable','rate_limited'].includes(code)?'failed':'blocked';
 return {reasonCode:code,shortReason:labels[code],verificationStatus};
}

/** Explains evidence gates from their computed state, without inferring truth. */
export function sourceGateReason(sources:{eligible:boolean;dateEligible:boolean;contextIncomplete:boolean;scopeMismatch:boolean;duplicate:boolean;group:string}[]):ComparisonDiagnostic{
 const groups=new Set(sources.filter(source=>source.eligible).map(source=>source.group)).size;
 let reasonCode:Code='insufficient_sources';
 let shortReason=groups===1?'Only one independent source group qualifies; two are required.':'No sources pass all date and context checks.';
 if(sources.length&&sources.every(source=>!source.dateEligible))reasonCode='source_dates_uncertain';
 else if(sources.length&&sources.every(source=>source.contextIncomplete))reasonCode='source_context_incomplete';
 else if(sources.length&&sources.every(source=>source.scopeMismatch))reasonCode='source_scope_mismatch';
 else if(groups===1&&sources.filter(source=>!source.eligible).length>0&&sources.filter(source=>!source.eligible).every(source=>source.duplicate))reasonCode='duplicate_sources';
 if(reasonCode!=='insufficient_sources')shortReason=labels[reasonCode];
 return {reasonCode,shortReason,verificationStatus:'blocked'};
}
