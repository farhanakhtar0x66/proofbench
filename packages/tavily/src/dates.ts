import {claimDateContext} from './claim-date-context';
export type DatedSource={published_date?:string;content?:string;originalContent?:string;contextContent?:string;claim?:string;calendarDayWindow?:boolean};
const monthNames=['january','february','march','april','may','june','july','august','september','october','november','december'];
const explicitDatePattern='(?:\\d{4}-\\d{2}-\\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December) \\d{1,2}(?:st|nd|rd|th)?,? \\d{4}|\\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) \\d{4})';
function explicitDate(text:string){
 if(/^\d{4}-/u.test(text))return text;
 const monthFirst=text.match(/^([A-Za-z]+) (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/iu);
 const dayFirst=text.match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/u);
 if(!monthFirst&&!dayFirst)return text;
 const month=monthNames.indexOf((monthFirst?.[1]??dayFirst![2]).toLowerCase())+1;
 return `${monthFirst?.[3]??dayFirst![3]}-${String(month).padStart(2,'0')}-${(monthFirst?.[2]??dayFirst![1]).padStart(2,'0')}`;
}

export function sourceDate(value:string|undefined):string|undefined{
 // Tavily can return RFC-style GMT publication dates. Validate every component
 // and weekday, rather than accepting Date.parse's permissive rollover behavior.
 const rfc=value?.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/u);
 if(rfc){
  const [,weekday,day,month,year,hour,minute,second]=rfc;
  const monthIndex=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(month);
  const parsed=new Date(Date.UTC(Number(year),monthIndex,Number(day),Number(hour),Number(minute),Number(second)));
  if(parsed.getUTCFullYear()!==Number(year)||parsed.getUTCMonth()!==monthIndex||parsed.getUTCDate()!==Number(day)||parsed.getUTCHours()!==Number(hour)||parsed.getUTCMinutes()!==Number(minute)||parsed.getUTCSeconds()!==Number(second)||parsed.toUTCString().slice(0,3)!==weekday)return;
  value=parsed.toISOString();
 }
 if(!value||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/u.test(value))return;
 const day=value.slice(0,10);const calendar=new Date(`${day}T00:00:00Z`);
 if(!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,10)!==day)return;
 const parsed=Date.parse(value);
 return Number.isFinite(parsed)?new Date(parsed).toISOString():undefined;
}

/** Match date-only search bounds without accepting future timestamps. */
export function publicationWindowAgeMs(publishedAt:string|undefined,now:string,calendarDayWindow=false){
 if(!publishedAt)return NaN;
 const exact=Date.parse(now)-Date.parse(publishedAt);
 if(!Number.isFinite(exact)||exact<0||!calendarDayWindow)return exact;
 return Date.parse(`${now.slice(0,10)}T00:00:00Z`)-Date.parse(`${publishedAt.slice(0,10)}T00:00:00Z`);
}

export function assessSourceDates(source:DatedSource,now:string){
 const publishedAt=sourceDate(source.published_date);
 const content=source.originalContent??source.content??'';
 const context=source.contextContent??content;
 const collect=(pattern:RegExp,text=content)=>[...new Set([...text.matchAll(pattern)].map(match=>match[1]))];
 const updates=collect(/\b(?:last updated(?: on)?|updated(?: on)?)\s*:?\s*(\d{4}-\d{2}-\d{2})\b/giu);
 // A readable page-update label can disagree with Tavily's publication estimate.
 // Parse complete English month dates strictly; never replace publication with it.
 const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
 const monthUpdates=collect(/\b(?:last updated(?: on)?|updated on)\s*:?\s*([A-Za-z]+ \d{1,2},? \d{4})\b/giu);
 for(const text of monthUpdates){
  const match=text.match(/^([A-Za-z]+) (\d{1,2}),? (\d{4})$/u)!;
  const month=months.indexOf(match[1].toLowerCase())+1;
  updates.push(month?`${match[3]}-${String(month).padStart(2,'0')}-${match[2].padStart(2,'0')}`:text);
 }
 // Accept numeric page-update labels only when month/day order is unambiguous.
 // This never supplies a missing publication date, and impossible days still fail sourceDate.
 for(const text of collect(/\b(?:last updated(?: on)?|updated on)\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})\b/giu)){
  const [first,second,year]=text.split('/').map(Number);
  const dayFirst=first>12&&second<=12;
  const monthFirst=second>12&&first<=12||first===second&&first<=12;
  if(dayFirst||monthFirst)updates.push(`${year}-${String(dayFirst?second:first).padStart(2,'0')}-${String(dayFirst?first:second).padStart(2,'0')}`);
 }
 const effective=collect(new RegExp(`\\b(?:effective(?: from| on)?|takes effect(?: on)?)\\s*:?\\s*(${explicitDatePattern})\\b`,'giu'),context).map(explicitDate);
 const scopeContext=claimDateContext(source.claim,context);
 const scopes:string[]=[];let unparsedScope=false;
 for(const cue of scopeContext.matchAll(/\bas of\s*:?\s*/giu)){
  const tail=scopeContext.slice(cue.index+cue[0].length);
  const exact=tail.match(new RegExp(`^(${explicitDatePattern})\\b`,'iu'));
  if(exact){scopes.push(explicitDate(exact[1]));continue;}
  const relative=tail.match(/^(today|yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b(?!\s*(?:\d|,\s*\d)|\s+(?:last|next|this|in|of|before|after)\b)/iu);
  if(relative&&publishedAt){
   const day=new Date(`${publishedAt.slice(0,10)}T00:00:00Z`);
   const term=relative[1].toLowerCase();const weekday=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(term);
   const back=term==='today'?0:term==='yesterday'?1:(day.getUTCDay()-weekday+7)%7;
   day.setUTCDate(day.getUTCDate()-back);scopes.push(day.toISOString().slice(0,10));
  }else unparsedScope=true;
 }
 const updatedAt=new Set(updates).size===1?sourceDate(updates[0]):undefined;
 const effectiveAt=effective.length===1?sourceDate(effective[0]):undefined;
 const age=publicationWindowAgeMs(publishedAt,now,source.calendarDayWindow);
 let reason:string|undefined;
 if(!publishedAt)reason=source.published_date?'The publication date is invalid or unsupported.':'The publication date is missing; an update or retrieval date cannot replace it.';
 else if(age<0)reason='The publication date is in the future.';
 else if(age>30*86400000)reason='The publication is older than 30 days; a recent page update does not prove that the fact was rechecked.';
 if([...updates,...effective,...scopes].some(value=>!sourceDate(value)))reason='An explicit source date is invalid.';
 if(/\b(?:last updated(?: on)?|updated on)\s*:?\s*(?:[A-Za-z]+\s+\d|\d)/iu.test(content)&&!updates.length)reason='An explicit update date could not be parsed; its publication relationship is uncertain.';
 const effectiveCue=/\b(?:effective (?:from|on)|takes effect)\b|\beffective\s*:?\s*(?:\d|next\b|tomorrow\b|immediately\b|(?:January|February|March|April|May|June|July|August|September|October|November|December)\b)/iu.test(context);
 if(effectiveCue&&effective.length===0||unparsedScope)reason='An explicit effective or as-of date could not be parsed; its temporal scope is uncertain.';
 if(new Set(updates).size>1||new Set(effective).size>1||new Set(scopes).size>1)reason='Multiple explicit source dates cannot be safely assigned to the fact.';
 if(updatedAt&&(Date.parse(updatedAt)>Date.parse(now)||publishedAt&&updatedAt.slice(0,10)<publishedAt.slice(0,10)))reason='The update date conflicts with publication or current time.';
 if(effectiveAt&&Date.parse(effectiveAt)>Date.parse(now))reason='The stated effective date is in the future; this fact is not established as current.';
 if(scopes.some(value=>{const date=sourceDate(value);const age=publicationWindowAgeMs(date,now,source.calendarDayWindow);return !Number.isFinite(age)||age<0||age>30*86400000;}))reason='The text explicitly scopes this fact to a historical or future date.';
 return {publishedAt,updatedAt,effectiveAt,eligible:!reason,reason:reason??'Recent publication; explicit update/effective dates do not conflict. Retrieval time is separate.'};
}
