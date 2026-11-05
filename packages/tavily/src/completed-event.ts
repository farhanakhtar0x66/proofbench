import {sourceDate,assessSourceDates} from './dates';

const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
const datePattern='(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) \\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December) \\d{1,2}, \\d{4})';
const events='became applicable|took effect|was released|was founded|was established';
const qualified=/\b(?:if|unless|according to|reportedly|allegedly|planned|scheduled|expected|will|might|could|would|not|never|resumed|reversed)\b|[“”"]/iu;
function dateValue(text:string){
 if(/^\d{4}-/u.test(text))return sourceDate(text);
 const dayFirst=text.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/u);
 const monthFirst=text.match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/u);
 if(!dayFirst&&!monthFirst)return;
 const month=months.indexOf((dayFirst?.[2]??monthFirst![1]).toLowerCase())+1;
 return month?sourceDate(`${dayFirst?.[3]??monthFirst![3]}-${String(month).padStart(2,'0')}-${(dayFirst?.[1]??monthFirst![2]).padStart(2,'0')}`):undefined;
}
export function completedEventClaim(claim:string,now:string){
 const match=claim.match(new RegExp(`^(.{1,120}?) (${events}) on (${datePattern})[.!]?$`,'iu'));
 if(!match||qualified.test(match[1])||/\b(?:and|or|but|during|since|until|as of|may)\b|[,;:]/iu.test(match[1]))return;
 const eventAt=dateValue(match[3]);if(!eventAt||Date.parse(eventAt)>Date.parse(now))return;
 return {subject:match[1].trim(),event:match[2].toLowerCase(),eventAt};
}

/** Old dated reports can establish a completed event, never current applicability. */
export function completedEventAssessment(claim:string,excerpt:string,publishedAt:string|undefined,now:string){
 const event=completedEventClaim(claim,now);if(!event)return;
 const publication=sourceDate(publishedAt);if(!publication)return;
 const dates=assessSourceDates({published_date:publication,content:excerpt},now);
 if(!dates.eligible&&!dates.reason.startsWith('The publication is older than 30 days;'))return;
 const escape=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&').replace(/\s+/gu,'\\s+');
 const subject=new RegExp(`\\b${escape(event.subject.replace(/^the\s+/iu,''))}\\b`,'iu');
 const acronym=event.subject.match(/\b([A-Z]{3,})$/u)?.[1];
 const region=event.subject.match(/^(?:The )?([A-Z]{2})\s/u)?.[1];
 const regionTerms:Record<string,RegExp>={EU:/\b(?:EU|European Union)\b/iu,US:/\b(?:US|United States)\b/iu,UK:/\b(?:UK|United Kingdom)\b/iu};
 const acronymAlias=!!acronym&&!!region&&!!regionTerms[region]?.test(excerpt);
 const hasSubject=(text:string)=>{
  if(subject.test(text))return true;
  if(!acronymAlias||!new RegExp(`\\b${acronym}\\b`,'u').test(text))return false;
  const named=[...text.matchAll(new RegExp(`\\b([A-Z]{2})\\s+${acronym}\\b`,'gu'))].map(match=>match[1]);
  return !named.length||named.includes(region!);
 };
 const verb=event.event==='became applicable'?'(?:became (?:directly )?applicable|was put into effect)':escape(event.event);
 const datesFound:(string|undefined)[]=[];
 for(const {segment} of new Intl.Segmenter('en',{granularity:'sentence'}).segment(excerpt)){
  const match=segment.match(new RegExp(`\\b${verb}\\b`,'iu'));if(!match)continue;
  const pronoun=/^\s*(?:It|The regulation)\b/u.test(segment)&&acronymAlias&&hasSubject(excerpt);
  if(!hasSubject(segment)&&!pronoun)continue;
  const withoutDates=segment.replace(new RegExp(datePattern,'giu'),'');
  if(qualified.test(withoutDates)||/\bmay\b/iu.test(withoutDates))continue;
  const after=segment.slice(match.index!+match[0].length);
  const afterDate=after.match(new RegExp(`^\\s+(?:on\\s+)?(${datePattern})`,'iu'));
  const beforeDates=[...segment.slice(0,match.index).matchAll(new RegExp(datePattern,'giu'))];
  const date=afterDate?.[1]??beforeDates.at(-1)?.[0];
  if(date)datesFound.push(dateValue(date));
 }
 if(!datesFound.length)return;
 if(datesFound.some(date=>!date||Date.parse(date)>Date.parse(publication))||new Set(datesFound).size!==1)return;
 return {eligible:true,reason:`Completed historical event reported on or after ${datesFound[0]!.slice(0,10)}. Eligible only for the dated event assertion; current freshness is unknown.`};
}
