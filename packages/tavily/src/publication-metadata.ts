import {ageOnlyDateReason} from './temporal-policy';

/** A valid past page update preceding a provider publication estimate is not a fact-date conflict. */
export function publicationEstimateConflict(source:{publishedAt?:string;updatedAt?:string;dateReason?:string},computedReason:string,now:string){
 if(!source.publishedAt||!source.updatedAt)return false;
 const publication=Date.parse(source.publishedAt),update=Date.parse(source.updatedAt),at=Date.parse(now);
 if(![publication,update,at].every(Number.isFinite)||publication>at||update>at||source.updatedAt.slice(0,10)>=source.publishedAt.slice(0,10))return false;
 const harmless=(reason:string)=>reason==='The update date conflicts with publication or current time.'||ageOnlyDateReason(reason)||reason.startsWith('Recent publication;');
 return harmless(computedReason)&&(!source.dateReason||harmless(source.dateReason));
}
