import {type ClaimVerification} from '../../contracts/src/index';

// Coarse validity indicator, not a probability or source credibility estimate.
// Intermediate values are intentionally avoided until scoring is calibrated.
export function freshnessScore(claim:ClaimVerification,mode:'mock'|'live'):number|null{
 if(mode!=='live')return null;
 const relation=claim.outcome==='supported'?'supports':claim.outcome==='contradicted'?'contradicts':undefined;
 if(!relation)return null;
 const at=Date.parse(claim.asOf);
 const sources=new Set<string>();
 for(const evidence of claim.evidence){
  if(evidence.retrieval!=='tavily'||evidence.relation!==relation||!evidence.retrievedAt||!evidence.publishedAt)continue;
  const age=at-Date.parse(evidence.publishedAt);
  if(!Number.isFinite(age)||age<0||age>30*86400000)continue;
  try{sources.add(new URL(evidence.url).hostname.replace(/^www\./u,''));}catch{continue;}
 }
 if(sources.size<2||claim.evidence.some(item=>item.relation===(relation==='supports'?'contradicts':'supports')))return null;
 if(claim.outcome==='supported'&&claim.freshness==='current')return 100;
 if(claim.outcome==='contradicted'&&claim.freshness==='stale')return 0;
 return null;
}
