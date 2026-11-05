const smallNumbers=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty'];
const numberPattern=`(?:\\d+|${smallNumbers.join('|')})`;
const value=(text:string)=>/^\d+$/u.test(text)?Number(text):smallNumbers.indexOf(text.toLowerCase());

/** Narrow positive-count guard only; it never changes support into contradiction. */
export function supportedQuantityReason(claim:string,excerpt:string):string|undefined{
 // Qualified/negative counts need semantic review; do not silently strip qualifiers.
 if(/\b(?:not|unless|except|if|formerly|previously|was|were)\b/iu.test(claim))return;
 const pattern=new RegExp(`\\b(?:at most|at least|maximum of|minimum of)\\s+(${numberPattern})\\s+(players?|members?|seats?|users?|requests?|items?)\\b`,'giu');
 for(const match of claim.matchAll(pattern)){
  // Do not misread compound quantities such as "twenty one" as a scalar.
  const unit=match[2].toLowerCase().replace(/s$/u,'');
  const found=[...excerpt.matchAll(new RegExp(`\\b(${numberPattern})\\s+${unit}s?\\b`,'giu'))];
  if(!found.some(item=>value(item[1])===value(match[1])))return 'The model assessed support for a numeric count, but the excerpt does not explicitly give the claimed quantity with its matching unit. Numeric scope requires review; no opposite verdict is inferred.';
 }
}
