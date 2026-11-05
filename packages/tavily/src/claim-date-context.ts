const words=(text:string)=>text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
const generic=new Set('the and for from with that this currently current is are was were has have had not only owner company parent costs cost price pricing per month monthly supported support latest version of'.split(' '));

/** Scope only body-text as-of dates. Publication/update/effective dates remain strict. */
export function claimDateContext(claim:string|undefined,text:string):string{
 if(!claim)return text;
 const anchors=new Set(words(claim).filter(word=>word.length>=3&&!generic.has(word)&&!/^\d+$/u.test(word)));
 if(anchors.size<2)return text;
 // Shield dotted abbreviations for segmentation only. The original source is never rewritten.
 const scan=text.replace(/\b(?:[A-Z]\.){2,}/gu,match=>match.replaceAll('.','·'));
 const sentences=[...new Intl.Segmenter('en',{granularity:'sentence'}).segment(scan)].map(item=>text.slice(item.index,item.index+item.segment.length));
 const overlap=(sentence:string)=>new Set(words(sentence).filter(word=>anchors.has(word))).size;
 if(!sentences.some(sentence=>overlap(sentence)>=2))return text;
 const kept=sentences.filter(sentence=>{
  if(!/\bas of\b/iu.test(sentence)||/\b(?:effective|updated)\b/iu.test(sentence)||overlap(sentence))return true;
  // Standalone date labels, pronouns and references can qualify the adjacent claim.
  if(/\b(?:this|that|these|those|it|its|they|their|same|above|below|former|latter|status|terms|policy|arrangement|ownership|holding|holdings|stake|shares|role|appointment|support|price|version|company|business|organization|organisation|entity|product|service|relationship|contract|license|law|agreement|position|office|report|notice|statement|record|information|fact|validity|date|figure|amount|value)\b/iu.test(sentence))return true;
  // Exclude only a separately stated subject, not an unassigned temporal fragment.
  const independent=/^\s*(?:There\s+(?:is|are|was|were)\b|(?:The\s+)?[A-Z][\p{L}\p{N}'’-]*(?:\s+[\p{L}\p{N}'’-]+){0,8}\s+(?:is|are|was|were|has|have|had|reported|reports|recorded|records|totaled|totals|counted|counts)\b)/u.test(sentence);
  return !independent;
 });
 return kept.length===sentences.length?text:kept.join('\n');
}
