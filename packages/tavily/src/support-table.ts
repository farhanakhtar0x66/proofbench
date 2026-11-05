import {SOURCE_SCAN_LIMIT,EXCERPT_LIMIT,PASSAGE_SEPARATOR,type SourcePassage} from './source-passages';
import {supportClaimSubject} from './support-scope';

/** Exact table context for product/version support claims; never a support verdict. */
export function supportTableExcerpt(claim:string,content:string):{excerpt:string;passages:SourcePassage[];selection:{start:number;end:number;sourceLength:number;reason:string;warning?:string;omissionRisk?:'coverage'|'qualification'}}|undefined{
 const subject=supportClaimSubject(claim)?.match(/^(.+?)\s+(\d+(?:\.\d+)*)$/u);
 if(!subject||content.length>SOURCE_SCAN_LIMIT)return;
 const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
 const product=new RegExp(`(?<![\\p{L}\\p{N}])${escape(subject[1]).replace(/\s+/gu,'\\s+')}(?![\\p{L}\\p{N}])`,'iu');
 const version=new RegExp(`^\\s*(?:\\|\\s*)?${escape(subject[2])}(?:\\.\\d+)*\\s*(?:\\||$)`,'u');
 const anyVersion=/^\s*(?:\|\s*)?\d+(?:\.\d+)*\s*(?:\||$)/u;
 const lines=[...content.matchAll(/[^\n]+/gu)].map(m=>({text:m[0],start:m.index,end:m.index+m[0].length}));
 const rows=lines.map((line,index)=>version.test(line.text)?index:-1).filter(index=>index>=0);
 if(!rows.length||rows.length>12)return;
 const ranges:{start:number;end:number}[]=[];
 for(const row of rows){
  let header=-1;
  for(let i=row-1;i>=Math.max(0,row-120);i--){
   const text=lines.slice(i,i+3).map(l=>l.text).join(' ');
   if(/\b(?:branch|version)\b/iu.test(lines[i].text)&&/\bstatus\b/iu.test(text)){header=i;break;}
  }
  if(header<0)return;
  let title=-1;
  for(let i=header-1;i>=0;i--)if(product.test(lines[i].text)&&/\b(?:status|versions?|releases?|branches|support)\b/iu.test(lines[i].text)&&lines[i].text.length<=180&&!/[.!?()/]|\b(?:and|or)\b/iu.test(lines[i].text.replace(product,'PRODUCT'))){title=i;break;}
  if(title<0)return;
  ranges.push(lines[title]);
  // Preserve the section name, nearby conditions, and column headings.
  ranges.push({start:lines[title].start,end:lines[Math.min(row-1,header+2)].end});
  let end=row;
  if(!lines[row].text.includes('|')){
   for(let i=row+1;i<Math.min(lines.length,row+9)&&!anyVersion.test(lines[i].text);i++)end=i;
  }else if(lines[row+1]&&/^\s*(?:however|but|only|unless|if|except|note|subject to)\b/iu.test(lines[row+1].text))end=row+1;
  ranges.push({start:lines[row].start,end:lines[end].end});
 }
 const merged:{start:number;end:number}[]=[];
 for(const range of ranges.sort((a,b)=>a.start-b.start)){
  const last=merged.at(-1);if(last&&range.start<=last.end+2)last.end=Math.max(last.end,range.end);else merged.push({...range});
 }
 const passages:SourcePassage[]=merged.map(range=>({...range,text:content.slice(range.start,range.end)}));
 const excerpt=passages.map(p=>p.text).join(PASSAGE_SEPARATOR);
 if(passages.length>6||excerpt.length>EXCERPT_LIMIT)return;
 return {excerpt,passages,selection:{start:passages[0].start,end:passages.at(-1)!.end,sourceLength:content.length,reason:'Selected exact product heading, support-table column context and matching version-family rows. Other rows are omitted; no support verdict or version equivalence is inferred.'}};
}

export function hasSupportTableContext(claim:string,excerpt:string){return !!supportTableExcerpt(claim,excerpt);}
