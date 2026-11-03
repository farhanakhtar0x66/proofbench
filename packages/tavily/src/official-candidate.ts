import {classifyClaim} from './claims';
import {type SearchEvidence} from './comparison';

// Heuristic identity signals, never a substitute for reviewed ownership.
export function isLikelyOfficial(claim:string,entity:string|undefined,source:SearchEvidence,direct:boolean):boolean{
 if(!entity||!direct||!source.title||!source.url)return false;
 const url=new URL(source.url);
 if(url.protocol!=='https:'||url.hostname.includes('xn--'))return false;
 const labels=url.hostname.toLowerCase().split('.');
 if(labels.length===3&&['www','docs','developers','developer','api','help','support'].includes(labels[0]))labels.shift();
 // Without a public-suffix resolver, abstain on deeper and multi-part domains.
 if(labels.length!==2||!['com','org','net','io','dev','ai','app','tech','software','example'].includes(labels[1]))return false;
 const compact=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]/gu,'');
 const identities=[entity,entity.replace(/\s+(?:pro|basic|enterprise|api)$/iu,'')].map(compact).filter(text=>text.length>=3);
 if(!identities.includes(labels[0]))return false;
 const title=source.title.toLowerCase().replace(/[^a-z0-9]+/gu,' ').trim();
 const entityText=entity.toLowerCase().replace(/[^a-z0-9]+/gu,' ').trim();
 if(!entityText||!` ${title} `.includes(` ${entityText} `))return false;
 const category=classifyClaim(claim).category;
 const page=category==='pricing'?/^\/(?:pricing|plans)(?:\/|$)/iu:
  category==='leadership'?/^\/(?:leadership|team|about(?:\/leadership|\/team)?)(?:\/|$)/iu:
  category==='version'?/^\/(?:docs|documentation|releases|changelog|versions)(?:\/|$)/iu:undefined;
 return !!page?.test(url.pathname);
}
