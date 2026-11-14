import {candidateStatements} from './claim-extraction';

const normalize=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();

/** A conservative overlap warning, not a determination of authorship or ownership. */
export function evidenceOverlapTracker(){
 const excerpts=new Set<string>();
 const passages=new Set<string>();
 return (excerpt:string):boolean=>{
  const normalized=normalize(excerpt);
  // Short shared facts are expected. Only substantial complete sentences trigger
  // this extra check; altered paraphrases and common-event reporting are not detected.
  const sentences=candidateStatements(excerpt).map(sentence=>normalize(sentence.text)).filter(sentence=>sentence.length>=160);
  const overlaps=(normalized.length>=120&&excerpts.has(normalized))||sentences.some(sentence=>passages.has(sentence));
  excerpts.add(normalized);
  sentences.forEach(sentence=>passages.add(sentence));
  return overlaps;
 };
}
