import {sourceDate,assessSourceDates} from './dates';
import {supportClaimSubject} from './support-scope';

const dateText='(?:\\d{4}-\\d{2}-\\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December) \\d{1,2}, \\d{4})';
function eventDate(text:string){
 if(/^\d{4}-/u.test(text))return sourceDate(text);
 const match=text.match(/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})$/iu);
 if(!match)return;
 const month=['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(match[1].toLowerCase())+1;
 return sourceDate(`${match[3]}-${String(month).padStart(2,'0')}-${match[2].padStart(2,'0')}`);
}
const qualifiers=/\b(?:if|unless|planned|scheduled|expected|proposed|will|may|might|could|would|allegedly|according to|vendor|third[- ]party|extended support|resum\w*|restart\w*|revers\w*|not|never)\b|[“”"]/iu;
export function datedEndOfLifeClaim(claim:string){
 if(qualifiers.test(claim))return;
 const match=claim.match(new RegExp(`^(.{1,100}?) reached (?:official |upstream )?end[- ]of[- ]life on (${dateText})[.!]?$`,'iu'));
 if(!match||!eventDate(match[2])||/[,:;]|\b(?:and|or|but|in|during|since|as of)\b/iu.test(match[1]))return;
 if(!supportClaimSubject(`${match[1].trim()} is supported.`))return;
 return {subject:match[1].trim(),eventAt:eventDate(match[2])!};
}

/** An old completed event can qualify a historical assertion, not today's state. */
export function historicalSupportAssessment(claim:string,excerpt:string,publishedAt:string|undefined,assessedAt:string){
 const historical=datedEndOfLifeClaim(claim);const subject=historical?.subject??supportClaimSubject(claim);
 if(!subject||qualifiers.test(excerpt)||!/\b(?:official|upstream|core (?:project|development team|developers))\b/iu.test(excerpt))return;
 const publication=sourceDate(publishedAt);if(!publication)return;
 const literal=subject.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&').replace(/\s+/gu,'\\s+');
 const pattern=new RegExp(`(?<![\\p{L}\\p{N}])${literal}\\s+reached (?:official |upstream )?end[- ]of[- ]life on (${dateText})`,'giu');
 const events=[...excerpt.matchAll(pattern)].map(match=>eventDate(match[1]));
 if(!events.length||events.some(date=>!date))return;
 const dates=[...new Set(events)];if(dates.length!==1)return;
 const eventAt=dates[0]!;
 if(Date.parse(eventAt)>Date.parse(publication)||Date.parse(publication)>Date.parse(assessedAt))return;
 const publicationCheck=assessSourceDates({published_date:publishedAt,content:excerpt},assessedAt);
 // Do not override invalid/conflicting dates or other temporal warnings.
 if(!publicationCheck.eligible&&!publicationCheck.reason.startsWith('The publication is older than 30 days;'))return;
 if(!historical&&publicationCheck.eligible)return;
 if(!historical)return {eligible:false,eventAt,reason:'A completed end-of-life event is historical context; it does not alone establish today’s support state or vendor support. Current support needs separately applicable evidence.'};
 return {eligible:true,eventAt,reason:`Completed historical end-of-life event dated ${eventAt.slice(0,10)}, reported on or after that event. Eligible only for the dated historical assertion; publication recency is not current support verification.`};
}
