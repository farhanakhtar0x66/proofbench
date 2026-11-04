import {expect,it} from 'vitest';
import {extractClaims} from '../packages/tavily/src/claims';
import {verifyAnswer} from '../packages/tavily/src/index';

it.each([' and ',' but ','; '])('splits complete factual clauses joined by %s',separator=>{
 const first='Acme Pro costs USD 20/month';const second='Maya Chen is the CEO of Cedar Labs.';
 expect(extractClaims(first+separator+second)).toEqual([first,second]);
});
it.each([
 'Johnson and Johnson latest version is 3.',
 'Acme Pro costs USD 20/month and supports five users.',
 'Acme Pro costs USD 20/month or Acme Pro costs USD 25/month.',
 'If Acme Pro costs USD 20/month and Maya Chen is the CEO of Cedar Labs.',
 'According to a blog, Acme Pro costs USD 20/month and Maya Chen is the CEO of Cedar Labs.',
 '"Acme Pro costs USD 20/month and Maya Chen is the CEO of Cedar Labs."',
])('keeps ambiguous, conditional, quoted or incomplete clauses intact: %s',text=>{
 expect(extractClaims(text)).toEqual([text]);
});
it('retains decimal prices and dotted versions in compound facts',()=>{
 expect(extractClaims('Acme Pro costs USD 19.99/month and Orbit latest API version is v3.2.1.')).toEqual(['Acme Pro costs USD 19.99/month','Orbit latest API version is v3.2.1.']);
});
it('keeps the global 50-claim limit after clause splitting',()=>{
 const text='Acme Pro costs USD 20/month and Orbit latest version is 3.';
 expect(extractClaims(Array(30).fill(text).join('\n'))).toHaveLength(50);
});
it('verifies extracted facts separately within the shared budget',async()=>{
 let calls=0;
 const fetcher:typeof fetch=async(_url,init)=>{
  calls++;
  const {query}=JSON.parse(String(init?.body)) as {query:string};
  const content=query.includes('acme')?'Acme Pro costs USD 25/month.':'Maya Chen is the CEO of Cedar Labs.';
  return Response.json({results:[0,1].map(i=>({url:`https://source${i}.example/facts`,content,published_date:new Date().toISOString()}))});
 };
 const input={version:'1' as const,text:'Acme Pro costs USD 20/month and Maya Chen is the CEO of Cedar Labs.'};
 const result=await verifyAnswer(input,{mode:'live',allowLiveRequests:'true',apiKey:'fake',maxRequests:2,fetch:fetcher});
 expect(calls).toBe(2);expect(result.claims.map(claim=>claim.outcome)).toEqual(['contradicted','supported']);
});
it('does not split caller-provided explicit claims',async()=>{
 const text='Acme Pro costs USD 20/month and Maya Chen is the CEO of Cedar Labs.';
 const report=await verifyAnswer({version:'1',text,claims:[{text}]},{mode:'mock'});
 expect(report.claims.map(claim=>claim.text)).toEqual([text]);
});
