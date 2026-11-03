/** Explicit English product/version support assertions; no inferred subject. */
export function supportClaimSubject(claim:string):string|undefined{
 const subject=claim.match(/^(.+?)\s+(?:is|are)\s+(?:(?:not|currently|no longer)\s+){0,2}supported[.!]?$/iu)?.[1].trim();
 if(!subject||subject.length>120)return;
 if(/[,;:"“”]|\b(?:if|unless|according to|and|or|but|in|during|since|until|as of|may|might|could|would|formerly|previously)\b/iu.test(subject))return;
 if(/^(?:it|they|this|that|these|those|he|she)$/iu.test(subject))return;
 return subject;
}
