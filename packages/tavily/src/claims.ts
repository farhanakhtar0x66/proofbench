import {claimEntity} from './comparison';

export type ClaimCategory='pricing'|'version'|'leadership'|'law'|'policy'|'statistics'|'general';

const categories:[ClaimCategory,RegExp][]=[
 ['pricing',/\b(pric(?:e|es|ing)|costs?|fees?|USD|INR|dollars?)\b|[$€£₹]/iu],
 ['leadership',/\b(CEO|president|prime minister|chairperson|founder)\b/iu],
 ['version',/\b(versions?|releases?|API|supported|support|requires)\b/iu],
 ['law',/\b(law|legal|regulation|legislation|act)\b/iu],
 ['policy',/\b(polic(?:y|ies)|terms|eligibility)\b/iu],
 ['statistics',/\b(population|revenue|salary|statistics?|rate)\b|\d\s*%/iu],
];

// Heuristic categories guide retrieval; they are never evidence of truth.
export function classifyClaim(text:string):{category:ClaimCategory;timeSensitive:'yes'|'unknown';ambiguous:boolean}{
 const category=categories.find(([,pattern])=>pattern.test(text))?.[0]??'general';
 const current=/\b(current(?:ly)?|latest|today|now)\b/iu.test(text);
 const ambiguous=/^(?:the\s+)?(?:latest release|current version|API costs?|price is)\b/iu.test(text.trim())||/^(?:it|they|this|that)\b/iu.test(text.trim());
 return {category,timeSensitive:category!=='general'||current?'yes':'unknown',ambiguous};
}

export function extractClaims(answer:string):string[]{
 const claims:string[]=[];
 let inCode=false;
 const segmenter=new Intl.Segmenter('en',{granularity:'sentence'});
 for(const raw of answer.split(/\r?\n/u)){
  if(/^\s*```/u.test(raw)){inCode=!inCode;continue;}
  if(inCode||/^\s*#/u.test(raw))continue;
  const line=raw.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/u,'').trim();
  if(!line)continue;
  for(const {segment} of segmenter.segment(line)){
   const text=segment.trim();
   if(!text||text.endsWith('?')||/^(?:I (?:think|believe|prefer)|please|try|consider)\b/iu.test(text))continue;
   // Split only complete independently comparable clauses. Never invent a
   // missing subject or strip a condition, quote or qualification from a fact.
   const guarded=/["“”`()[\]]|\b(if|unless|when|provided|according|allegedly|reportedly|either|neither)\b/iu.test(text);
   const clauses=guarded?[text]:text.split(/\s+(?:and|but)\s+|;\s*/iu).map(clause=>clause.trim());
   const candidates=clauses.length>1&&clauses.every(clause=>!!claimEntity(clause))?clauses:[text];
   for(const candidate of candidates){
    claims.push(candidate);
    if(claims.length===50)return claims;
   }
  }
 }
 return claims;
}
