const relationship=/\b(?:owners?|owns?|owned|ownership|parent (?:company|firm|corporation)|subsidiar(?:y|ies))\b/iu;
const evidenceRelationship=/\b(?:owners?|owns?|owned|ownership|parent (?:company|firm|corporation)|parent of|subsidiar(?:y|ies)|holding company|belongs? to|independent|divest\w*|sold|acquir\w*|spin[- ]?off|spun off)\b/iu;
const terms=(text:string)=>text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];

/** Relevance only. No holder, ownership direction or truth is inferred. */
export function relationshipPassageScore(claim:string,text:string):number|undefined{
 if(!relationship.test(claim))return;
 const target=(claim.match(/^(?:the\s+)?(?:parent (?:company|firm|corporation)|owner) of (.+?) is\b/iu)?.[1]
  ??claim.match(/^(.+?)(?:'s|’s) (?:parent (?:company|firm|corporation)|owner) is\b/iu)?.[1]
  ??claim.match(/^.+? is (?:the |a )?(?:parent (?:company|firm|corporation)|owner) of (.+?)[.!]?$/iu)?.[1]
  ??claim.match(/^(.+?) is (?:a )?subsidiary of\b/iu)?.[1]
  ??claim.match(/^(.+?) is owned by\b/iu)?.[1]
  ??claim.match(/^.+? owns (.+?)[.!]?$/iu)?.[1])?.trim();
 if(target){
  const expected=terms(target),actual=terms(text);
  const matches=actual.some((_word,index)=>expected.every((word,offset)=>actual[index+offset]===word));
  return evidenceRelationship.test(text)&&matches?10:0;
 }
 const anchors=terms(claim).filter(term=>term.length>2&&!/^(?:the|and|for|with|from|currently|current|owner|owners|owns|owned|ownership|parent|company|firm|corporation|subsidiary|subsidiaries|not|has|have)$/u.test(term));
 if(!anchors.length)return;
 const actual=new Set(terms(text));
 return evidenceRelationship.test(text)&&anchors.some(anchor=>actual.has(anchor))?10:0;
}
