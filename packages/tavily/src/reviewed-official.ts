import {roleClaimAnchors} from './evidence-relevance';

/** Narrow reviewed mapping: URL identity is not proof that its text entails a claim. */
export function reviewedOfficialDirect(claim:string,source:{url:string;excerpt:string}):boolean{
 const role=roleClaimAnchors(claim);
 if(!role||role.entity.toLowerCase()!=='india'||!role.roles.some(value=>/^(?:prime minister|pm)$/iu.test(value)))return false;
 let url:URL;try{url=new URL(source.url);}catch{return false;}
 if(url.protocol!=='https:'||url.hostname!=='www.pmindia.gov.in'||url.port||url.username||url.password||!/^\/en\/(?:news_updates|pms-profile)(?:\/|$)/u.test(url.pathname))return false;
 for(const {segment} of new Intl.Segmenter('en',{granularity:'sentence'}).segment(source.excerpt)){
  if(/\b(?:former|formerly|previously|was|were|will|might|may|could|until|if|unless|candidate|proposed|expected|scheduled|not|never|reportedly|allegedly)\b/iu.test(segment))continue;
  // A government masthead alone does not identify a holder. Require a named person beside the role.
  if(/\b(?:Prime Minister|PM)\s+(?:(?:Shri|Smt|Mr|Ms|Dr)\.?\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/u.test(segment))return true;
 }
 return false;
}
