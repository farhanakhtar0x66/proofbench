import {ComparisonReasonCode} from '../../contracts/src/index';
import type {z} from 'zod';

type Code=z.infer<typeof ComparisonReasonCode>;
const labels:Record<Code,string>={supported:'Sources support the claim.',contradicted:'Sources contradict the claim.',conflicting_evidence:'Sources disagree.',insufficient_evidence:'Evidence does not establish a verdict.',insufficient_sources:'Not enough eligible, independent sources.',offline:'Live source retrieval is disabled.',rules_only:'Model comparison is disabled.',model_unavailable:'Model service is unavailable. Check Bifrost and provider setup.',model_timeout:'Model comparison timed out.',rate_limited:'Model provider rate limit reached.',budget_exhausted:'Request allowance exhausted.',invalid_model_response:'Model response failed validation.',invalid_evidence:'Source data failed validation.',unsafe_input:'Instruction-like source text needs review.',ambiguous_claim:'The claim needs clearer scope.'};

/** Public diagnostics contain fixed labels, never raw provider messages or credentials. */
export function comparisonReason(outcome:'supported'|'contradicted'|'inconclusive',explanation:string,completed=false,offline=false){
 const code:Code=outcome==='supported'?'supported':outcome==='contradicted'?'contradicted':completed?/conflict/iu.test(explanation)?'conflicting_evidence':'insufficient_evidence':offline?'offline':
 /rate limit/iu.test(explanation)?'rate_limited':/timed out|timeout/iu.test(explanation)?'model_timeout':/budget|allowance|cap .*exhaust|cap is zero/iu.test(explanation)?'budget_exhausted':/invalid.*(?:output|structure)|structured response|model (?:changed|omitted|repeated)|correction.*(?:claim|corroborat)|comparison failed/iu.test(explanation)?'invalid_model_response':/gateway|Bifrost|provider|key|adapter|model.*(?:unavailable|configured)|Free tier/iu.test(explanation)?'model_unavailable':/rules-only|disabled/iu.test(explanation)?'rules_only':/currency|ambig/iu.test(explanation)?'ambiguous_claim':/Instruction-like/iu.test(explanation)?'unsafe_input':/invalid|exceeds/iu.test(explanation)?'invalid_evidence':'insufficient_sources';
 const verificationStatus=completed?'completed':['model_timeout','invalid_model_response','model_unavailable','rate_limited'].includes(code)?'failed':'blocked';
 return {reasonCode:code,shortReason:labels[code],verificationStatus};
}
