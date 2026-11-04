import {expect,it,vi,afterEach} from 'vitest';
import {assessSourceDates} from '../packages/tavily/src/dates';
import {evidenceSearchPlan} from '../packages/tavily/src/search-plan';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';

afterEach(()=>vi.useRealTimers());
const now='2026-11-04T19:11:32.000Z';
it('accepts the complete oldest calendar date included in a current search',()=>{
 const plan=evidenceSearchPlan('Aster owns Harbor.','current',new Date(now));
 expect(plan.dateWindow?.startDate).toBe('2026-10-05');
 expect(assessSourceDates({published_date:'2026-10-05T13:35:49.000Z',content:'Aster owns Harbor.',calendarDayWindow:true},now).eligible).toBe(true);
 expect(assessSourceDates({published_date:'2026-10-05T13:35:49.000Z',content:'Aster owns Harbor.'},now).eligible).toBe(false);
});
it.each(['2026-10-04T23:59:59.999Z','2026-11-04T19:11:33.000Z','2026-11-05T00:00:00.000Z','2020-01-01'])('retains older-day and future-timestamp guards: %s',published_date=>{
 expect(assessSourceDates({published_date,calendarDayWindow:true},now).eligible).toBe(false);
});
it('recomputes the cutoff after midnight and retains date metadata checks',()=>{
 expect(assessSourceDates({published_date:'2026-10-05',calendarDayWindow:true},'2026-11-05T00:00:01.000Z').eligible).toBe(false);
 expect(assessSourceDates({published_date:'2026-10-05',content:'Updated on 2020-01-01.',calendarDayWindow:true},now).eligible).toBe(false);
 expect(assessSourceDates({published_date:'2026-11-03',content:'As of 2020-01-01. Aster owns Harbor.',calendarDayWindow:true},now).eligible).toBe(false);
});
it('can corroborate at the calendar boundary without refreshing source timestamps or overclaiming recency',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date(now));
 const claim='Aster owns Harbor.';const dates=['2026-10-26T15:00:00.000Z','2026-10-05T13:35:49.000Z'];
 const input=EvidenceRetrievalReport.parse({version:'1',claim,query:claim,mode:'live',status:'retrieved',searchScope:'current',searchWindow:{startDate:'2026-10-05',endDate:'2026-11-05'},createdAt:now,retrievedAt:now,message:'Synthetic',limitations:[],evidence:dates.map((publishedAt,index)=>({url:`https://source${index}.example`,title:'Synthetic',excerpt:`${claim} Notice ${index}.`,publishedAt,retrievedAt:now,retrieval:'tavily',relation:'context'}))});
 const interpreter={interpret:vi.fn(),compareEvidence:vi.fn(async()=>({assessments:input.evidence.map((source,index)=>({sourceId:`S${index+1}`,relation:'supports',quote:source.excerpt})),correction:null}))};
 const result=await compareClaimEvidence(input,{mode:'llm',interpreter});
 expect(result.outcome).toBe('supported');expect(result.freshnessScore).toBe(0);
 expect(result.citations.map(c=>c.publishedAt)).toEqual(dates);expect(result.freshnessScoreReason).toContain('calendar-day');
 input.searchScope='as_stated';delete input.searchWindow;
 expect((await compareClaimEvidence(input,{mode:'llm',interpreter})).outcome).toBe('inconclusive');
 expect(interpreter.compareEvidence).toHaveBeenCalledOnce();
});
