export const SOURCE_SCAN_LIMIT=200000;
export const EXCERPT_LIMIT=2400;
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
 const qualification=(text:string)=>/^\s*(?:however|but|only|unless|if|except|according|this|these|it|they|he|she|note|despite|subject to|the (?:role|appointment|company))\b/iu.test(text)||/^[a-z]/u.test(text);
 const candidates=units.map((unit,index)=>{
  const previous=units[index-1],next=units[index+1];
  // Nearby short wrapped lines can carry the subject, value or qualifier.
  const unitText=scan.slice(unit.start,unit.end);
  const previousText=previous?scan.slice(previous.start,previous.end):'';
  const nextText=next?scan.slice(next.start,next.end):'';
  const left=previous&&!boilerplate(previousText)&&(previousText.length<200||!/[.!?]\s*$/u.test(previousText)&&unit.end-previous.start<600||qualification(previousText))?previous.start:unit.start;
  const right=next&&!boilerplate(nextText)&&(nextText.length<200||!/[.!?]\s*$/u.test(unitText)&&next.end-left<900||qualification(nextText))?next.end:unit.end;
  const directScore=score(unitText);
  const coveredByNeighbor=directScore<2&&(score(previousText)>=2||score(nextText)>=2);
  const extra=`${scan.slice(left,unit.start)} ${scan.slice(unit.end,right)}`;
  const plainHeadings=extra.trim().length<300&&!/[.!?\d]|\b(?:not|no|never|however|but|unless|if|except|only|former|previous|disputed|withdrawn|revoked|replaced|correction|this|these|it|they|according|as of|effective)\b/iu.test(extra);
  return {start:left,end:right,dedup:plainHeadings?`core:${unitText}`:`range:${scan.slice(left,right)}`,score:boilerplate(unitText)||coveredByNeighbor?0:directScore<2&&unitText.length>160?directScore:score(scan.slice(left,right))};
 });
 const seen=new Set<string>();
 const relevant=candidates.filter(item=>{
  if(item.score<2)return false;
  if(seen.has(item.dedup))return false;seen.add(item.dedup);return true;
 });
 const ordered=[...relevant].sort((a,b)=>b.score-a.score||a.start-b.start);
 const bestScore=ordered[0]?.score??0;
 // A shared generic word does not make every paragraph material to the claim.
 // Keep equally strong matches and weaker passages carrying possible qualifications.
 const material=ordered.filter(item=>item.score===bestScore||/\b(?:not|never|no longer|however|but|unless|except|formerly|previously|only|instead|rather|incorrect|false|denied|disputed)\b/iu.test(scan.slice(item.start,item.end)));
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
 for(const candidate of material){
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
