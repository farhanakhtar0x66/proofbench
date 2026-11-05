import {type SearchEvidence,analyzeEvidence,claimEntity,normalizeSource} from './comparison';
import {isLikelyOfficial} from './official-candidate';

export type SourceRule={entities:string[];domain:string;paths?:string[];includeSubdomains?:boolean};
export type SourcePolicy={official:SourceRule[];secondary:SourceRule[]};
export type SourceTier='official_direct'|'reviewed_secondary'|'likely_official'|'unreviewed';
// Empty until the team reviews and adds entity/domain/page mappings.
export const sourcePolicy:SourcePolicy={official:[],secondary:[]};
export const canonicalUrl=(input:string)=>{
 const url=new URL(input);url.hash='';
 for(const key of [...url.searchParams.keys()])if(/^utm_/iu.test(key)||['fbclid','gclid'].includes(key))url.searchParams.delete(key);
 url.searchParams.sort();return url.href;
};

export function rankSources(claim:string,input:SearchEvidence[],now:string,policy:SourcePolicy=sourcePolicy){
 const entity=claimEntity(claim);
 const ranked=input.map(normalizeSource).filter((item):item is SearchEvidence&{url:string}=>!!item?.url).map((source,index)=>{
  const url=new URL(source.url);const host=url.hostname.toLowerCase().replace(/^www\./u,'');
  const matches=(rule:SourceRule)=>!!entity&&rule.entities.some(name=>name.trim().toLowerCase()===entity)&&
   url.protocol==='https:'&&(host===rule.domain.toLowerCase()||!!rule.includeSubdomains&&host.endsWith(`.${rule.domain.toLowerCase()}`))&&
   (!rule.paths||rule.paths.some(path=>url.pathname===path||url.pathname.startsWith(`${path.replace(/\/$/u,'')}/`)));
  const relation=analyzeEvidence(claim,source,now).relation;
  const official=policy.official.find(matches);const secondary=policy.secondary.find(matches);
  const likely=isLikelyOfficial(claim,entity,source,relation!=='context');
  const tier:SourceTier=official&&relation!=='context'?'official_direct':secondary?'reviewed_secondary':likely?'likely_official':'unreviewed';
  const age=source.published_date?Date.parse(now)-Date.parse(source.published_date):NaN;
  const inferredGroup=likely?host.replace(/^(?:docs|developers|developer|api|help|support)\./u,''):host;
  return {...source,index,tier,relation,group:official?.domain??secondary?.domain??inferredGroup,recent:age>=0&&age<=30*86400000,
   reason:tier==='official_direct'?'Reviewed entity/domain/page mapping with direct recent evidence.':tier==='reviewed_secondary'?'Reviewed secondary source for this entity; comparison and date checks still apply.':tier==='likely_official'?'Heuristic only: HTTPS brand-domain match, entity in page title, relevant page path and recent direct evidence. Ownership is not verified; an impersonating site can mimic these signals.':'No qualifying reviewed mapping or sufficient identity signals for this entity and page. Relevance is not authority.'};
 }).sort((a,b)=>{
  const order={official_direct:0,reviewed_secondary:1,likely_official:2,unreviewed:3};
  return order[a.tier]-order[b.tier]||Number(b.relation!=='context')-Number(a.relation!=='context')||Number(b.recent)-Number(a.recent)||a.index-b.index;
 });
 const urls=new Map<string,string>();const copies=new Map<string,string>();
 return ranked.map(source=>{
  const url=canonicalUrl(source.url);const content=(source.originalContent??source.content??'').trim().toLowerCase().replace(/\s+/gu,' ');
  // Short factual statements may independently have identical wording.
  const copyEligible=content.length>=120&&content.split(' ').length>=20;
  const duplicateOf=urls.get(url)??(copyEligible?copies.get(content):undefined);
  urls.set(url,urls.get(url)??source.url);
  if(copyEligible)copies.set(content,copies.get(content)??source.url);
  return {...source,duplicateOf};
 });
}
