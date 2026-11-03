import {expect,it} from 'vitest';
import {assessSourceDates,sourceDate} from '../packages/tavily/src/dates';
import {verifyAnswer} from '../packages/tavily/src/index';

const now='2026-11-03T12:00:00.000Z';
it.each(['2026-02-30','2026-13-01','11/03/2026','not-a-date'])('rejects invalid or ambiguous dates: %s',value=>expect(sourceDate(value)).toBeUndefined());
it('parses ISO calendar dates and timezone timestamps',()=>{
 expect(sourceDate('2026-11-03')).toBe('2026-11-03T00:00:00.000Z');
 expect(sourceDate('2026-11-03T12:00:00+05:30')).toBe('2026-11-03T06:30:00.000Z');
});
it.each([
 {published_date:'2020-01-01',content:'Updated: 2026-11-03. Acme costs USD 20/month.'},
 {published_date:undefined,content:'Updated: 2026-11-03. Acme costs USD 20/month.'},
 {published_date:'2026-11-03',content:'As of 2020-01-01. Acme costs USD 20/month.'},
 {published_date:'2026-11-03',content:'Effective on 2027-01-01. Acme costs USD 20/month.'},
 {published_date:'2026-11-03',content:'Updated: 2020-01-01. Acme costs USD 20/month.'},
 {published_date:'2026-11-03',content:'Effective: tomorrow. Acme costs USD 20/month.'},
 {published_date:'2026-11-03',content:'Effective: 2026-02-30. Acme costs USD 20/month.'},
 {published_date:'2026-11-03',content:'As of 2026-11-01. As of 2026-11-02. Acme costs USD 20/month.'},
])('abstains on misleading temporal context: %j',source=>{
 expect(assessSourceDates(source,now).eligible).toBe(false);
});
it('does not treat an old effective date as proof a current term is stale',()=>{
 const dates=assessSourceDates({published_date:'2026-11-02',content:'Effective: 2020-01-01. Updated: 2026-11-03. Acme costs USD 20/month.'},now);
 expect(dates.eligible).toBe(true);expect(dates.effectiveAt).toBe('2020-01-01T00:00:00.000Z');expect(dates.updatedAt).toBe('2026-11-03T00:00:00.000Z');
});
it('keeps original-source temporal qualifiers after model normalization',()=>{
 expect(assessSourceDates({published_date:'2026-11-03',content:'Acme costs USD 20/month.',originalContent:'As of 2020-01-01. Acme costs USD 20/month.'},now).eligible).toBe(false);
});
it('returns temporal notes and does not infer current truth from a recently published historical passage',async()=>{
 const text='Acme costs USD 20/month.';
 const fetcher:typeof fetch=async()=>Response.json({results:[0,1].map(i=>({url:`https://source${i}.example`,content:`As of 2020-01-01. ${text}`,published_date:new Date().toISOString()}))});
 const report=await verifyAnswer({version:'1',text},{mode:'live',allowPaidRequests:'true',apiKey:'fake',maxRequests:1,fetch:fetcher});
 expect(report.claims[0].outcome).toBe('inconclusive');expect(report.claims[0].freshnessScore).toBeNull();expect(report.claims[0].evidence[0].dateReason).toContain('historical');expect(report.claims[0].uncertainty).toContain('historical');
});
