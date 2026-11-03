import {captainClaimScope} from './captain-scope';

export function evidenceSearchPlan(claim:string,scope:'as_stated'|'current'='as_stated',now=new Date()){
 const literal=claim.replace(/\s+/gu,' ');
 if(scope==='as_stated')return {query:literal,dateWindow:undefined};
 const start=new Date(now.getTime()-30*86400000);
 const end=new Date(now.getTime()+86400000);
 // Search the role rather than presuming the asserted holder is correct.
 // Keep the original claim for comparison; retain any object-side qualifiers.
 const qualified=/^(?:if|unless|according to)\b|\b(?:may|might|could|would)\s+(?:be|serve)\b|\b(?:formerly|previously|was|will be)\b|[“”"]/iu.test(literal);
 const role=qualified?null:literal.match(/^.+?\s+(?:is|serves as)\s+(?:(?:not|currently)\s+){0,2}(?:the\s+)?((?:club |team |first-team )?captain|CEO|president|prime minister|chairperson|head coach)\s+(?:of|for)\s+(.+)$/iu);
 const possessive=qualified?null:literal.match(/^(.+?)(?:'s|’s)\s+(?:current\s+)?(?:club\s+|team\s+|first-team\s+)?captain\s+is\s+(?:not\s+)?.+$/iu);
 let query=`${literal} current official sources`;
 if(role){
  const target=role[2].replace(/[.!]+$/u,'');
  query=/\bcaptain\b/iu.test(role[1])&&captainClaimScope(literal)==='appointment'?`${target} current club captains captaincy appointment official sources`:`${target} current ${role[1]} official sources`;
 }else if(possessive&&captainClaimScope(literal)==='appointment')query=`${possessive[1]} current club captains captaincy appointment official sources`;
 return {query,dateWindow:{startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10)}};
}
