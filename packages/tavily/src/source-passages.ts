export const SOURCE_SCAN_LIMIT=200000;
export const EXCERPT_LIMIT=1200;
export const PASSAGE_SEPARATOR='\n[...]\n';
export type SourcePassage={start:number;end:number;text:string};

/** Exact source blocks with explicit omissions; never rewritten clauses. */
export function selectSourcePassages(content:string,score:(text:string)=>number){
 const scan=content.slice(0,SOURCE_SCAN_LIMIT);
 const units:{start:number;end:number}[]=[];
 const add=(start:number,end:number)=>{
  while(start<end&&/\s/u.test(scan[start]))start++;
  while(end>start&&/\s/u.test(scan[end-1]))end--;
  if(start<end)units.push({start,end});
 };
 let start=0;
 for(const match of scan.matchAll(/\r?\n|\[\.\.\.\]/gu)){add(start,match.index);start=match.index+match[0].length;}
 add(start,scan.length);
 const boilerplate=(text:string)=>/^\s*(?:purl:|pkg:)|^\s*(?:home|menu|search|subscribe|log in|sign in|skip to content)\s*$/iu.test(text);
 const qualification=(text:string)=>/^\s*(?:however|but|only|unless|if|except|according|this|these|it|they|note|despite|subject to)\b/iu.test(text)||/^[a-z]/u.test(text);
 const candidates=units.map((unit,index)=>{
  const previous=units[index-1],next=units[index+1];
  // Nearby short wrapped lines can carry the subject, value or qualifier.
  const left=previous&&!boilerplate(scan.slice(previous.start,previous.end))&&(unit.end-previous.start<600||qualification(scan.slice(previous.start,previous.end)))?previous.start:unit.start;
  const right=next&&!boilerplate(scan.slice(next.start,next.end))&&(next.end-left<900||qualification(scan.slice(next.start,next.end)))?next.end:unit.end;
  return {start:left,end:right,score:boilerplate(scan.slice(unit.start,unit.end))?0:score(scan.slice(left,right))};
 });
 const relevant=candidates.filter(item=>item.score>=2);
 const ordered=[...relevant].sort((a,b)=>b.score-a.score||a.start-b.start);
 const selected:{start:number;end:number}[]=[];let omitted=false;
 const merge=(ranges:{start:number;end:number}[])=>{
  const merged:{start:number;end:number}[]=[];
  for(const range of [...ranges].sort((a,b)=>a.start-b.start)){
   const last=merged.at(-1);
   if(last&&range.start<=last.end+2)last.end=Math.max(last.end,range.end);
   else merged.push({start:range.start,end:range.end});
  }
  return merged;
 };
 for(const candidate of ordered){
  const proposed=merge([...selected,candidate]);
  const size=proposed.reduce((sum,range)=>sum+range.end-range.start,0)+Math.max(0,proposed.length-1)*PASSAGE_SEPARATOR.length;
  if(size>EXCERPT_LIMIT||proposed.length>6){omitted=true;continue;}
  selected.splice(0,selected.length,...proposed);
 }
 if(!selected.length){
  const best=ordered[0]??candidates[0]??{start:0,end:0};
  selected.push({start:best.start,end:Math.min(best.end,best.start+EXCERPT_LIMIT)});
 }
 const passages:SourcePassage[]=selected.map(range=>({...range,text:content.slice(range.start,range.end)}));
 const clipped=selected.some(range=>!units.some(unit=>unit.end===range.end));
 const warning=content.length>SOURCE_SCAN_LIMIT?'Only the first 200,000 source characters were inspected; fuller context requires review.':clipped?'The excerpt cuts a paragraph or sentence at the length limit; its missing qualifications require fuller review.':omitted?'Other potentially relevant passages were omitted by the excerpt limit; conflicting context may require fuller review.':undefined;
 return {passages,excerpt:passages.map(item=>item.text).join(PASSAGE_SEPARATOR),warning};
}

export function validPassageBundle(source:{excerpt:string;excerptPassages?:SourcePassage[];excerptSelection?:{start:number;end:number;sourceLength:number}}){
 if(!source.excerptPassages)return true;
 const parts=source.excerptPassages;const bounds=source.excerptSelection;
 return !!bounds&&parts.length>0&&parts.length<=6&&parts.every((part,index)=>part.start>=0&&part.end-part.start===part.text.length&&part.end<=bounds.sourceLength&&(index===0||part.start>parts[index-1].end))&&bounds.start===parts[0].start&&bounds.end===parts.at(-1)!.end&&source.excerpt===parts.map(part=>part.text).join(PASSAGE_SEPARATOR);
}
