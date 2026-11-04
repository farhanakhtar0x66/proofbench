import {roleClaimAnchors} from './evidence-relevance';
import {supportClaimSubject} from './support-scope';
import {claimEntity} from './comparison';
import {completedEventClaim} from './completed-event';

const words=(text:string)=>text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
/** Ranking signals only: never ownership verification, truth or source eligibility. */
export function retrievalRanking(claim:string,source:{url:string;title:string;excerpt:string},now:string){
 const subject=roleClaimAnchors(claim)?.entity??supportClaimSubject(claim)??claimEntity(claim)??completedEventClaim(claim,now)?.subject;
 const anchors=[...new Set(words(subject??claim).filter(word=>word.length>2&&!/^(?:the|and|for|with|from|currently|current|costs|under|have|most|least|players|may|was|became|applicable|official|sources)$/u.test(word)))];
 const textWords=new Set(words(source.excerpt));const titleWords=new Set(words(source.title));
 const relevance=anchors.length?anchors.filter(word=>textWords.has(word)).length/anchors.length:0;
 const url=new URL(source.url);const labels=url.hostname.toLowerCase().split('.');
 const brand=(subject??'').replace(/\s+(?:\d[\w.]*|pro|team|basic|enterprise|api|sdk)$/iu,'').replace(/[^a-z0-9]/giu,'').toLowerCase();
 const identityHint=!!subject&&brand.length>=3&&url.protocol==='https:'&&!url.hostname.includes('xn--')&&labels.length<=3&&labels.at(-2)===brand&&anchors.some(word=>titleWords.has(word))&&relevance===1;
 return {relevance,identityHint};
}
