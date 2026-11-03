import {roleClaimAnchors} from './evidence-relevance';

const tokens=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/([\p{L}])(?=\d)/gu,'$1 ').match(/[\p{L}\p{N}]+/gu)??[];
const phrase=(text:string,term:string)=>` ${tokens(text).join(' ')} `.includes(` ${tokens(term).join(' ')} `);
const supportTerms=/\b(?:support(?:ed)?|end[- ]of[- ]life|eol|deprecated|sunset|maintenance|discontinued)\b/iu;
function supportSubject(claim:string){return claim.match(/^(.+?)\s+(?:is|are)\s+(?:(?:not|currently|no longer)\s+){0,2}supported[.!]?$/iu)?.[1];}

export function excerptQualityReason(claim:string,excerpt:string):string|undefined{
 const lines=excerpt.split('\n').filter(line=>line.trim());
 const packageLines=lines.filter(line=>/^\s*(?:purl:|pkg:)/iu.test(line)).length;
 if(packageLines>=3&&packageLines>lines.length/2)return 'The excerpt is dominated by package identifiers rather than a support statement. Fuller explanatory evidence is required.';
 const subject=supportSubject(claim);
 if(subject&&(!phrase(excerpt,subject)||!supportTerms.test(excerpt)))return 'This support claim needs an explicit matching product/version and support context in the excerpt. Generic compatibility wording or another version cannot corroborate it.';
}

export function selectEvidenceExcerpt(claim:string,content:string){
 const sourceLength=content.length;const scan=content.slice(0,20000);
 const ranges:{start:number;end:number;score:number}[]=[];
 const role=roleClaimAnchors(claim);const subject=supportSubject(claim);
 const anchors=[...new Set(tokens(claim).filter(word=>word.length>2&&!/^(?:the|and|for|are|not|currently|supported|costs|with|from|that|this)$/u.test(word)))];
 const score=(text:string)=>{
  if(excerptQualityReason(claim,text)?.includes('package identifiers'))return -1;
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
  for(const range of ranges)if(range.end-range.start<=1200&&range.score>chosen.score)chosen=range;
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
