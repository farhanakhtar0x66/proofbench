import {roleClaimAnchors,roleEntityMentioned} from './evidence-relevance';
import {supportClaimSubject} from './support-scope';
import {priceCurrencyEvidenceReason} from './claim-ambiguity';
import {selectSourcePassages,EXCERPT_LIMIT} from './source-passages';
import {completedEventClaim} from './completed-event';
import {claimEntity} from './comparison';
import {reviewedOfficialDirect} from './reviewed-official';
import {relationshipPassageScore} from './relationship-passages';

const tokens=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/([\p{L}])(?=\d)/gu,'$1 ').match(/[\p{L}\p{N}]+/gu)??[];
const phrase=(text:string,term:string)=>` ${tokens(text).join(' ')} `.includes(` ${tokens(term).join(' ')} `);
const supportTerms=/\b(?:support(?:ed)?|end[- ]of[- ]life|eol|deprecated|sunset|maintenance|discontinued|security (?:updates|fixes|patches))\b/iu;

export function excerptQualityReason(claim:string,excerpt:string):string|undefined{
 // Inspect artifacts without rewriting the exact text retained as evidence.
 const artifacts=[...excerpt.matchAll(/data:image\/[^\s"')]+|%3C(?:svg|path)[\s\S]*?(?:%3E|$)|<[^>]+>|(?:%[0-9a-f]{2}){8,}/giu)].reduce((sum,match)=>sum+match[0].length,0);
 if(artifacts>=80&&artifacts/Math.max(1,excerpt.length)>0.25)return 'The excerpt is dominated by encoded images or markup rather than readable source statements. Fuller readable evidence is required.';
 const wallSignals=[/\b(?:log[ -]?in|sign in)\b/iu,/\b(?:sign up|create (?:an? |your |new )?account)\b/iu,/\b(?:forgot(?:ten)? (?:password|account)|password reset)\b/iu,/\b(?:log[ -]?in|sign in|subscribe) to (?:continue|read|view|see)\b/iu,/\bsee more on facebook\b/iu].filter(pattern=>pattern.test(excerpt)).length;
 const credentialField=/(?:^|[.\n])\s*(?:email or phone(?: number)?|email address|password)\s*(?:[.\n]|$)/iu.test(excerpt);
 const shortControls=excerpt.length<120&&/^\s*(?:log[ -]?in|sign in|subscribe|create|see more)\b/iu.test(excerpt);
 if(wallSignals>=2&&excerpt.length<=EXCERPT_LIMIT&&(credentialField||shortControls))return 'The excerpt appears to be a login or subscription wall, not an accessible article. Fuller readable evidence is required.';
 if(/^\s*(?:Image|Photo|Picture)(?:\s+\d+)?\s*:/iu.test(excerpt)&&!excerpt.includes('\n\n')&&excerpt.length<500)return 'The excerpt appears to contain only an image caption; the article context is unavailable.';
 const lines=excerpt.split('\n').filter(line=>line.trim());
 const packageLines=lines.filter(line=>/^\s*(?:purl:|pkg:)/iu.test(line)).length;
 if(packageLines>=3&&packageLines>lines.length/2)return 'The excerpt is dominated by package identifiers rather than a support statement. Fuller explanatory evidence is required.';
 const currencyReason=priceCurrencyEvidenceReason(claim,excerpt);if(currencyReason)return currencyReason;
 const subject=supportClaimSubject(claim);
 if(subject&&(!phrase(excerpt,subject)||!supportTerms.test(excerpt)))return 'This support claim needs an explicit matching product/version and support context in the excerpt. Generic compatibility wording or another version cannot corroborate it.';
}

export function selectEvidenceExcerpt(claim:string,content:string,sourceUrl?:string){
 const sourceLength=content.length;
 const role=roleClaimAnchors(claim);const subject=supportClaimSubject(claim);
 const event=completedEventClaim(claim,new Date().toISOString());
 const priceSubject=/\b(?:costs?|prices?|pricing)\b/iu.test(claim)?claimEntity(claim):undefined;
 const countUnit=claim.match(/\b(?:at most|at least|maximum of|minimum of)\s+(?:\d+|[a-z]+)\s+(players?|members?|seats?|users?|requests?|items?)\b/iu)?.[1].replace(/s$/u,'');
 const anchors=[...new Set(tokens(claim).filter(word=>word.length>2&&!/^\d+$/u.test(word)&&!/^(?:the|and|for|are|not|currently|supported|costs|with|from|that|this|became|was|may|january|february|march|april|june|july|august|september|october|november|december|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/u.test(word)))];
 const score=(text:string)=>{
  const quality=excerptQualityReason(claim,text);
  if(quality&&/package identifiers|encoded images|login or subscription|image caption/u.test(quality))return -1;
  if(subject)return phrase(text,subject)&&supportTerms.test(text)?10:0;
  if(role){
   const rolePresent=role.roles.some(word=>phrase(text,word));
   if(rolePresent&&roleEntityMentioned(text,role.entity)||!!sourceUrl&&reviewedOfficialDirect(claim,{url:sourceUrl,excerpt:text}))return 10;
   // Keep a potentially useful passage for review, but do not waive the comparison scope checks.
   return rolePresent&&!/^\s*#/u.test(text)?2:0;
  }
  if(priceSubject)return phrase(text,priceSubject)&&/\b(?:costs?|prices?|pricing|USD|dollars?|per user|monthly)\b|\$\s*\d/iu.test(text)?10:0;
  const relationshipScore=relationshipPassageScore(claim,text);
  if(relationshipScore!==undefined)return relationshipScore;
  if(event){
   const subjects=tokens(event.subject).filter(word=>word.length>2&&word!=='the');
   const target=event.event==='became applicable'?/\b(?:became (?:directly )?applicable|applicable (?:as of|from|on)|application date|put into effect)\b/iu:/\b(?:took effect|was released|was founded|was established)\b/iu;
   return subjects.some(word=>phrase(text,word))&&target.test(text)&&/\b\d{4}\b/u.test(text)?10:0;
  }
  if(countUnit)return new RegExp(`\\b(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\\s+${countUnit}s?\\b|\\b${countUnit}s?\\b.{0,60}\\b\\d+\\b`,'iu').test(text)?10:0;
  return Math.min(5,anchors.filter(word=>phrase(text,word)).length);
 };
 if(content.trim().length>EXCERPT_LIMIT||/package identifiers/u.test(excerptQualityReason(claim,content)??'')){
  const selected=selectSourcePassages(content,score);
  const first=selected.passages[0];const last=selected.passages.at(-1)!;
  const warning=selected.warning??excerptQualityReason(claim,selected.excerpt);
  return {excerpt:selected.excerpt,passages:selected.passages.length>1?selected.passages:undefined,selection:{start:first.start,end:last.end,sourceLength,reason:selected.passages.length>1?'Selected exact source blocks in source order; [...] marks omitted text.':'Selected a complete source block using claim anchors; wording is unchanged.',...(warning?{warning}:{})}};
 }
 const start=Math.max(0,content.search(/\S/u));const end=content.trimEnd().length;
 const excerpt=content.slice(start,end);const warning=excerptQualityReason(claim,excerpt);
 return {excerpt,passages:undefined,selection:{start,end,sourceLength,reason:'Retained the complete short source text; wording is unchanged.',...(warning?{warning}:{})}};
}
