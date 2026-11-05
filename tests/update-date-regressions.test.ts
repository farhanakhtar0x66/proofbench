import {expect,it} from 'vitest';
import {assessSourceDates} from '../packages/tavily/src/dates';

const now='2026-11-04T10:00:00.000Z';
it('rejects a recent publication estimate that follows an older explicit page update',()=>{
 const result=assessSourceDates({published_date:'2026-11-03',content:'Status of versions. Last updated on May 27, 2026'},now);
 expect(result.updatedAt).toBe('2026-05-27T00:00:00.000Z');expect(result.eligible).toBe(false);expect(result.reason).toContain('conflicts');
});
it('parses an English update without using it as publication or overriding an old publication',()=>{
 expect(assessSourceDates({content:'Last updated on November 3, 2026'},now)).toMatchObject({updatedAt:'2026-11-03T00:00:00.000Z',eligible:false});
 expect(assessSourceDates({published_date:'2020-01-01',content:'Updated on November 3, 2026'},now).reason).toContain('older than 30 days');
});
it.each(['Last updated on February 30, 2026','Last updated on Smarch 3, 2026','Last updated on 03/11/2026'])('abstains on invalid or unsupported explicit update dates: %s',content=>{
 const result=assessSourceDates({published_date:'2026-11-01',content},now);
 expect(result.eligible).toBe(false);expect(result.reason).toMatch(/invalid|could not be parsed/u);
});
it('allows compatible dates, rejects future dates and does not mistake ordinary update prose for a date label',()=>{
 expect(assessSourceDates({published_date:'2026-11-01',content:'Last updated on November 3, 2026'},now).eligible).toBe(true);
 expect(assessSourceDates({published_date:'2026-11-01',content:'Last updated on November 5, 2026'},now).eligible).toBe(false);
 expect(assessSourceDates({published_date:'2026-11-01',content:'This product receives updated packages.'},now).eligible).toBe(true);
});
it('treats equivalent ISO and English update labels as one date',()=>{
 expect(assessSourceDates({published_date:'2026-11-01',content:'Updated on 2026-11-03. Last updated on November 3, 2026.'},now)).toMatchObject({updatedAt:'2026-11-03T00:00:00.000Z',eligible:true});
});

it.each(['07/13/2019','13/07/2019'])('parses unambiguous numeric update labels without manufacturing a publication date: %s',text=>{
 const result=assessSourceDates({content:'Updated on '+text},now);expect(result.updatedAt).toBe('2019-07-13T00:00:00.000Z');expect(result.publishedAt).toBeUndefined();expect(result.eligible).toBe(false);expect(result.reason).toContain('missing');
});
it.each(['02/30/2026','30/02/2026','03/04/2026','13/14/2026'])('does not guess ambiguous or impossible numeric update labels: %s',text=>{
 const result=assessSourceDates({published_date:'2026-01-01',content:'Updated on '+text},now);expect(result.updatedAt).toBeUndefined();expect(result.eligible).toBe(false);expect(result.reason).toMatch(/invalid|parsed/u);
});
