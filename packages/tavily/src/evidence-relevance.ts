const rolePattern='(?:(?:club|team|first[- ]team)\\s+)?captain|CEO|chief executive officer|president|prime minister|PM|chairperson|head coach';
const words=(text:string)=>text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
function containsPhrase(text:string,phrase:string){
 const actual=words(text);const expected=words(phrase);
 return expected.length>0&&actual.some((_word,index)=>expected.every((word,offset)=>actual[index+offset]===word));
}

/** Narrow English role patterns only; an anchor match never proves entailment. */
export function roleClaimAnchors(claim:string):{entity:string;roles:string[]}|undefined{
 // Preserve qualified, attributed and compound claims for semantic interpretation.
 if(/^(?:if|unless|according to)\b|\b(?:and|or|but|may|might|could|would|formerly|previously|was|will be)\b|[“”"]/iu.test(claim))return;
 const direct=claim.match(new RegExp(`^.+?\\s+(?:is|serves as)\\s+(?:(?:not|currently)\\s+){0,2}(?:the\\s+)?(${rolePattern})\\s+(?:of|for)\\s+(.+?)[.!]?$`,'iu'));
 const possessive=claim.match(new RegExp(`^(.+?)(?:'s|’s)\\s+(?:current\\s+)?(${rolePattern})\\s+is\\s+(?:not\\s+)?.+?[.!]?$`,'iu'));
 if(!direct&&!possessive)return;
 const entity=(direct?.[2]??possessive![1]).trim();
 // Object-side qualifiers cannot safely be separated by this simple parser.
 if(/\b(?:in|during|since|until|against|as of|for|with|who|which|that)\b|\d/iu.test(entity)||words(entity).length>12)return;
 const role=direct?.[1]??possessive![2];
 const roles=/captain/iu.test(role)?['captain','captains','captaincy']:/^(?:CEO|chief executive officer)$/iu.test(role)?['CEO','chief executive officer']:/^(?:PM|prime minister)$/iu.test(role)?['prime minister','PM']: [role];
 return {entity,roles};
}

export function sourceRelevanceReason(claim:string,excerpt:string):string|undefined{
 const anchors=roleClaimAnchors(claim);if(!anchors)return;
 // Require both anchors within a sentence, not scattered navigation/sidebar text.
 const sentences=new Intl.Segmenter('en',{granularity:'sentence'}).segment(excerpt);
 for(const {segment} of sentences){
  if(containsPhrase(segment,anchors.entity)&&anchors.roles.some(role=>containsPhrase(segment,role)))return;
 }
 return 'The excerpt does not explicitly mention the claimed organization/place and role together in one sentence. It cannot count as corroboration for this role claim; aliases or omitted context may require fuller evidence.';
}
