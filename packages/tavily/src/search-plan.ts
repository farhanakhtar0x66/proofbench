export function evidenceSearchPlan(claim:string,scope:'as_stated'|'current'='as_stated',now=new Date()){
 const literal=claim.replace(/\s+/gu,' ');
 if(scope==='as_stated')return {query:literal,dateWindow:undefined};
 const start=new Date(now.getTime()-30*86400000);
 const end=new Date(now.getTime()+86400000);
 // Search the role rather than presuming the asserted holder is correct.
 // Keep the original claim for comparison; retain any object-side qualifiers.
 const role=literal.match(/^.+?\s+is\s+(?:not\s+)?(?:the\s+)?(captain|CEO|president|prime minister|chairperson|head coach)\s+of\s+(.+)$/iu);
 const query=role?`${role[2].replace(/[.!]+$/u,'')} current ${role[1]} official sources`:`${literal} current official sources`;
 return {query,dateWindow:{startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10)}};
}
