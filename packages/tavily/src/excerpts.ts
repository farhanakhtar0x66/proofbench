import {roleClaimAnchors} from './evidence-relevance';
import {supportClaimSubject} from './support-scope';

const tokens=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/([\p{L}])(?=\d)/gu,'$1 ').match(/[\p{L}\p{N}]+/gu)??[];
const phrase=(text:string,term:string)=>` ${tokens(text).join(' ')} `.includes(` ${tokens(term).join(' ')} `);
const supportTerms=/\b(?:support(?:ed)?|end[- ]of[- ]life|eol|deprecated|sunset|maintenance|discontinued)\b/iu;

export function excerptQualityReason(claim:string,excerpt:string):string|undefined{
 // Inspect artifacts without rewriting the exact text retained as evidence.
 const artifacts=[...excerpt.matchAll(/data:image\/[^\s"')]+|%3C(?:svg|path)[\s\S]*?(?:%3E|$)|<[^>]+>|(?:%[0-9a-f]{2}){8,}/giu)].reduce((sum,match)=>sum+match[0].length,0);
 if(artifacts>=80&&artifacts/Math.max(1,excerpt.length)>0.25)return 'The excerpt is dominated by encoded images or markup rather than readable source statements. Fuller readable evidence is required.';
 const wallSignals=[/\b(?:log[ -]?in|sign in)\b/iu,/\b(?:sign up|create (?:an? |your |new )?account)\b/iu,/\b(?:forgot(?:ten)? (?:password|account)|password reset)\b/iu,/\b(?:log[ -]?in|sign in|subscribe) to (?:continue|read|view|see)\b/iu,/\bsee more on facebook\b/iu].filter(pattern=>pattern.test(excerpt)).length;
 const credentialField=/(?:^|[.\n])\s*(?:email or phone(?: number)?|email address|password)\s*(?:[.\n]|$)/iu.test(excerpt);
 const shortControls=excerpt.length<120&&/^\s*(?:log[ -]?in|sign in|subscribe|create|see more)\b/iu.test(excerpt);
 if(wallSignals>=2&&excerpt.length<=1200&&(credentialField||shortControls))return 'The excerpt appears to be a login or subscription wall, not an accessible article. Fuller readable evidence is required.';
 if(/^\s*(?:Image|Photo|Picture)(?:\s+\d+)?\s*:/iu.test(excerpt)&&!excerpt.includes('\n\n')&&excerpt.length<500)return 'The excerpt appears to contain only an image caption; the article context is unavailable.';
 const lines=excerpt.split('\n').filter(line=>line.trim());
 const packageLines=lines.filter(line=>/^\s*(?:purl:|pkg:)/iu.test(line)).length;
 if(packageLines>=3&&packageLines>lines.length/2)return 'The excerpt is dominated by package identifiers rather than a support statement. Fuller explanatory evidence is required.';
 const subject=supportClaimSubject(claim);
 if(subject&&(!phrase(excerpt,subject)||!supportTerms.test(excerpt)))return 'This support claim needs an explicit matching product/version and support context in the excerpt. Generic compatibility wording or another version cannot corroborate it.';
}

export function selectEvidenceExcerpt(claim:string,content:string){
 const sourceLength=content.length;const scan=content.slice(0,20000);
 const ranges:{start:number;end:number;score:number}[]=[];
 const role=roleClaimAnchors(claim);const subject=supportClaimSubject(claim);
 const anchors=[...new Set(tokens(claim).filter(word=>word.length>2&&!/^(?:the|and|for|are|not|currently|supported|costs|with|from|that|this)$/u.test(word)))];
 const score=(text:string)=>{
  const quality=excerptQualityReason(claim,text);
  if(quality&&/package identifiers|encoded images|login or subscription|image caption/u.test(quality))return -1;
  if(subject&&phrase(text,subject)&&supportTerms.test(text))return 10;
  if(role&&phrase(text,role.entity)&&role.roles.some(word=>phrase(text,word)))return 10;
  return Math.min(5,anchors.filter(word=>phrase(text,word)).length);
 };
 const add=(start:number,end:number)=>{
  while(start<end&&/\s/u.test(scan[start]))start++;
  while(end>start&&/\s/u.test(scan[end-1]))end--;
  if(start<end)ranges.push({start,end,score:score(scan.slice(start,end))});
 };
 let start=0;
 for(const match of scan.matchAll(/\n\s*\n|\[\.\.\.\]/gu)){add(start,match.index);start=match.index+match[0].length;}
 add(start,scan.length);
 let chosen=ranges[0]??{start:0,end:0,score:0};
 if(content.trim().length>1200){
  const fitting=ranges.filter(range=>range.end-range.start<=1200);
  if(fitting.length)chosen=fitting.reduce((best,range)=>range.score>best.score?range:best);
  // A high-scoring oversized paragraph cannot safely be excerpted at a sentence
  // boundary without risking loss of its qualifications. Keep it and warn below.
 }
 let left=chosen.start;let right=chosen.end;
 if(content.trim().length<=1200){left=content.search(/\S/u);right=content.trimEnd().length;}
 else if(right-left<=1200){
  const index=ranges.indexOf(chosen);
  if(index>0&&right-ranges[index-1].start<=1200)left=ranges[index-1].start;
  if(index+1<ranges.length&&ranges[index+1].end-left<=1200)right=ranges[index+1].end;
 }
 left=Math.max(0,left);const clipped=right-left>1200;right=Math.min(right,left+1200);
 const excerpt=content.slice(left,right);
 const relevant=ranges.filter(range=>range.score>=2);
 const uncovered=relevant.some(range=>range.start<left||range.end>right);
 const warning=sourceLength>20000?'Only the first 20,000 source characters were inspected; fuller context requires review.':clipped?'The excerpt cuts a paragraph at the length limit; its missing qualifications require fuller review.':uncovered?'Other potentially relevant passages were omitted by the excerpt limit; conflicting context may require fuller review.':excerptQualityReason(claim,excerpt);
 return {excerpt,selection:{start:left,end:right,sourceLength,reason:left>0?'Selected a contiguous passage using heuristic claim anchors; wording is unchanged.':'Retained the initial source passage; wording is unchanged.',...(warning?{warning}:{})}};
}
