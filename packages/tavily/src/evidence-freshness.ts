import type {z} from 'zod';
import type {EvidenceComparisonReport} from '../../contracts/src/index';
import {sourceDate,publicationWindowAgeMs} from './dates';

type Report=z.infer<typeof EvidenceComparisonReport>;
const windowMs=30*86400000;

// Called only after the comparison's existing corroboration/scope gates.
// This policy measures publication recency, never factual confidence.
export function evidenceFreshness(report:Pick<Report,'outcome'|'freshness'|'assessedAt'|'citations'>,calendarDayWindow=false){
 const unavailable=(freshnessScoreReason:string)=>({freshnessScore:null,freshnessScoreReason});
 if(report.outcome==='contradicted')return unavailable('No freshness score: contradiction does not establish that the original claim was previously true or when it changed.');
 if(report.outcome!=='supported')return unavailable('No freshness score: insufficient or conflicting evidence cannot establish current support.');
 if(report.freshness!=='current')return unavailable('No freshness score: publication recency or current temporal applicability is unconfirmed.');
 const supporting=report.citations.filter(source=>source.eligible&&source.relation==='supports');
 const now=Date.parse(report.assessedAt);
 const ages=supporting.map(source=>{const date=sourceDate(source.publishedAt);return publicationWindowAgeMs(date,report.assessedAt,calendarDayWindow);});
 const groups=new Set(supporting.map(source=>new URL(source.url).hostname.toLowerCase().replace(/^www\./u,'').split('.').slice(-2).join('.')));
 if(groups.size<2||!Number.isFinite(now)||ages.some(age=>!Number.isFinite(age)||age<0||age>windowMs))return unavailable('No freshness score: at least two qualifying source groups with valid publication dates within 30 days are required.');
 const oldestAge=Math.max(...ages);
 // Round down: the displayed integer cannot overstate the policy's recency.
 const freshnessScore=Math.max(0,Math.min(100,Math.floor(100*(1-oldestAge/windowMs))));
 return {freshnessScore,freshnessScoreReason:`Evidence recency only: ${freshnessScore}/100, using the oldest eligible supporting publication (${(oldestAge/86400000).toFixed(1)} days old) at assessment time. ${calendarDayWindow?'UTC calendar-day search-window policy':'Linear 30-day policy'}; not truth confidence, source authority or proof of independence. Publication dates are provider estimates; retrieval time does not refresh this score.`};
}
