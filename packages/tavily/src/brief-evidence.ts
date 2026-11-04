import {candidateStatements} from './claim-extraction';

type Citation={sourceId:string;url:string;quote:string;eligible:boolean;relation:string};
const terms=(text:string)=>text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
const qualifiers=/\b(?:not|no|never|unless|only|if|but|however|except|provided|subject to|as of|effective|historical|formerly|previously|future|although|despite|when|until|since|pending|conditional|limited|excluding|currently|updated|today|would|could|may|might|will|according|reportedly|allegedly)\b|\d/iu;

/** Display previews only. Model input and full validated citations are unchanged. */
export function briefEvidence(claim:string,outcome:string,citations:Citation[]){
 if(outcome!=='supported'&&outcome!=='contradicted')return [];
 const relation=outcome==='supported'?'supports':'contradicts';
 const anchors=new Set(terms(claim).filter(term=>term.length>2&&!/^(?:the|and|for|with|from|currently|this|that|are|not)$/u.test(term)));
 const result:{sourceId:string;url:string;quote:string}[]=[];const groups=new Set<string>();
 for(const citation of citations){
  if(!citation.eligible||citation.relation!==relation)continue;
  const group=new URL(citation.url).hostname.toLowerCase().split('.').slice(-2).join('.');
  if(groups.has(group))continue;
  const candidates=candidateStatements(citation.quote).map(item=>({...item,score:new Set(terms(item.text).filter(term=>anchors.has(term))).size})).filter(item=>item.score>=2&&item.text.length<=360&&!item.text.includes('[...]')).sort((a,b)=>b.score-a.score||a.start-b.start);
  const selected=candidates.find(item=>!qualifiers.test(citation.quote.slice(0,item.start)+citation.quote.slice(item.end)));
  const quote=selected?.text??(citation.quote.length<=360&&!citation.quote.includes('[...]')&&new Set(terms(citation.quote).filter(term=>anchors.has(term))).size>=2?citation.quote:undefined);
  if(!quote)continue;
  groups.add(group);result.push({sourceId:citation.sourceId,url:citation.url,quote});
  if(result.length===2)break;
 }
 return result;
}
