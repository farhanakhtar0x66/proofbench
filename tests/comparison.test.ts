import {expect,it} from 'vitest';
import {compareEvidence} from '../packages/tavily/src/comparison';
import {verifyAnswer} from '../packages/tavily/src/index';

const now='2026-11-02T12:00:00.000Z';
const recent='2026-11-01T00:00:00.000Z';
it.each([
 ['The current CEO of Acme is Alice.','The current CEO of Acme is Bob.','contradicts'],
 ['Acme latest API version is 2.3.','Acme latest API version is 2.3.','supports'],
 ['Acme Pro currently costs USD 5 per month.','Acme Pro currently costs USD 9 per month.','contradicts'],
 ['Acme Pro currently costs USD 5 per month.','Acme Pro currently costs USD 5 per year.','context'],
 ['Acme latest version is 2.3.','Other latest version is 9.0.','context'],
 ['The current CEO of Acme is Alice.','The current CEO of Acme is not Alice.','context'],
 ['The current CEO of Acme is Alice.','The current CEO of Acme is Alice. The current CEO of Acme is Bob.','context'],
])('compares entity, value and scope for %s',(claim,content,expected)=>{
 expect(compareEvidence(claim,{content,published_date:recent},now)).toBe(expected);
});
it.each([undefined,'invalid','2020-01-01','2027-01-01'])('abstains on missing, old or future dates: %s',published_date=>{
 expect(compareEvidence('Acme latest version is 2.',{content:'Acme latest version is 2.',published_date},now)).toBe('context');
});
it.each(['supported','contradicted','inconclusive'] as const)('requires corroboration and handles conflict: %s',async expected=>{
 const claim='The current CEO of Acme is Alice.';
 const other='The current CEO of Acme is Bob.';
 const contents=expected==='supported'?[claim,claim]:expected==='contradicted'?[other,other]:[claim,other];
 const fetcher:typeof fetch=async()=>Response.json({results:contents.map((content,i)=>({url:`https://source${i}.example/leadership`,content,published_date:new Date().toISOString()}))});
 const result=await verifyAnswer({version:'1',text:claim},{mode:'live',allowPaidRequests:'true',maxRequests:1,apiKey:'test-key',fetch:fetcher});
 expect(result.claims[0].outcome).toBe(expected);
 expect(result.claims[0].freshnessScore).toBe(expected==='supported'?100:expected==='contradicted'?0:null);
});
it('duplicate URLs and one hostname do not count as corroboration',async()=>{
 const text='Acme latest version is 2.';
 const fetcher:typeof fetch=async()=>Response.json({results:[1,2].map(i=>({url:`https://example.com/${i}`,content:text,published_date:new Date().toISOString()}))});
 const result=await verifyAnswer({version:'1',text},{mode:'live',allowPaidRequests:'true',maxRequests:1,apiKey:'test-key',fetch:fetcher});
 expect(result.claims[0].outcome).toBe('inconclusive');
 expect(result.claims[0].freshnessScore).toBeNull();
});
