import {expect,it} from 'vitest';
import {analyzeEvidence,compareEvidence} from '../packages/tavily/src/comparison';
import {practiceVerification} from '../scripts/practice-lib';

const now='2026-11-03T00:00:00.000Z';
const claim='Acme Pro costs USD 20/month.';
const ceo='Maya Chen is the CEO of Cedar Labs.';
it.each([' and ',' but ','; '])('reads independent source facts joined by %s',separator=>{
 const source={content:`Acme Pro costs USD 25/month${separator}${ceo}`,published_date:now};
 expect(compareEvidence(claim,source,now)).toBe('contradicts');
 expect(compareEvidence(ceo,source,now)).toBe('supports');
});
it.each([
 'If Acme Pro costs USD 25/month and Maya Chen is the CEO of Cedar Labs.',
 'Acme Pro costs USD 25/month and its CEO is Maya Chen.',
 'Acme Pro costs USD 25/month or Acme Pro costs USD 20/month.',
 '"Acme Pro costs USD 25/month and Maya Chen is the CEO of Cedar Labs."',
 'Acme Pro costs USD 25/month and may cost USD 30/year.',
])('does not strip conditions or guess unresolved source context: %s',content=>{
 expect(compareEvidence(claim,{content,published_date:now},now)).toBe('context');
});
it('detects contradictory values inside a compound source sentence',()=>{
 expect(analyzeEvidence(claim,{content:'Acme Pro costs USD 20/month but Acme Pro costs USD 25/month.',published_date:now},now)).toEqual({relation:'context',conflicting:true});
});
it('still applies source-date checks after extracting facts',()=>{
 expect(compareEvidence(claim,{content:`Acme Pro costs USD 25/month and ${ceo}`,published_date:'2020-01-01'},now)).toBe('context');
});
it('uses compound evidence through the offline practice pipeline',async()=>{
 const result=await practiceVerification(claim,[`Acme Pro costs USD 25/month and ${ceo}`,`Acme Pro costs USD 25/month; ${ceo}`]);
 expect(result.outcome).toBe('contradicted');expect(result.freshnessScore).toBe(0);expect(result.simulated).toBe(true);
});
