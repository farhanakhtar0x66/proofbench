import {expect,it} from 'vitest';
import {sourceDate,assessSourceDates} from '../packages/tavily/src/dates';
it('normalizes documented Tavily GMT publication dates without replacing publication with retrieval',()=>{
 expect(sourceDate('Tue, 11 Mar 2025 17:00:00 GMT')).toBe('2025-03-11T17:00:00.000Z');
 const now='2026-11-03T12:00:00.000Z';
 const source={published_date:new Date(now).toUTCString()};
 expect(assessSourceDates(source,now).eligible).toBe(true);
 expect(assessSourceDates({published_date:'Tue, 11 Mar 2025 17:00:00 GMT'},now).eligible).toBe(false);
 expect(assessSourceDates({},now).publishedAt).toBeUndefined();
});
it.each(['Wed, 11 Mar 2025 17:00:00 GMT','Tue, 31 Feb 2025 17:00:00 GMT','Tue, 11 Mar 2025 24:00:00 GMT','Tue, 11 Mar 2025 17:60:00 GMT','Tue, 11 Mar 2025 17:00:60 GMT','Tue, 11 Mar 2025 17:00:00 PST','Tue, 11 Foo 2025 17:00:00 GMT'])('rejects malformed, inconsistent or unsupported publication date %s',value=>expect(sourceDate(value)).toBeUndefined());
