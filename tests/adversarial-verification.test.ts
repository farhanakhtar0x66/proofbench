import {expect,it} from 'vitest';
import {practiceVerification} from '../scripts/practice-lib';
import {verifyAnswer} from '../packages/tavily/src/index';

it.each([
 ['leadership agreement','Maya Chen is the CEO of Cedar Labs.',['The current CEO of Cedar Labs is Maya Chen.','Maya Chen is the CEO of Cedar Labs.'],'supported'],
 ['version change',"Orbit's latest API version is v3.",['Orbit latest API version is 4.','Orbit’s latest API version is v4.'],'contradicted'],
 ['ambiguous dollars','Acme Pro costs $20/month.',['Acme Pro costs USD 20/month.','Acme Pro costs USD 20/month.'],'inconclusive'],
 ['different plan','Acme Pro costs USD 20/month.',['Acme Enterprise costs USD 20/month.','Acme Enterprise costs USD 20/month.'],'inconclusive'],
 ['unsupported language','Acme ka price 20 dollar hai.',['Acme costs USD 20/month.','Acme costs USD 20/month.'],'inconclusive'],
] as const)('basic offline practice: %s',async(_name,claim,sources,expected)=>{
 const result=await practiceVerification(claim,[...sources]);
 expect(result.outcome).toBe(expected);expect(result.simulated).toBe(true);
});

it('does not ignore a source containing both agreeing and contradicting statements',async()=>{
 const claim='Acme Pro costs USD 20/month.';
 const fetcher:typeof fetch=async()=>Response.json({results:[
  {url:'https://first.example/pricing',content:claim},
  {url:'https://second.example/pricing',content:claim},
  {url:'https://third.example/pricing',content:`${claim} Acme Pro costs USD 25/month.`},
 ].map(item=>({...item,published_date:new Date().toISOString()}))});
 const report=await verifyAnswer({version:'1',text:claim},{mode:'live',allowLiveRequests:'true',apiKey:'fake-key',maxRequests:1,fetch:fetcher});
 expect(report.claims[0].outcome).toBe('inconclusive');expect(report.claims[0].freshnessScore).toBeNull();
});

it.each([
 ['support keyword','Python 2 is currently supported.','Python 2 documentation. Supported platforms and current downloads.'],
 ['deprecation alone','Python 2 is currently supported.','Python 2 is deprecated.'],
 ['another version','Python 2 is currently supported.','Python 3 is currently supported.'],
 ['unrelated deprecation','Orbit latest API version is 3.','Orbit documentation. A legacy SDK is deprecated.'],
 ['current without a version','Orbit latest API version is 3.','Orbit API documentation lists current and supported releases.'],
 ['support without a price','Acme Pro costs USD 20/month.','Acme Pro is currently supported. See the current pricing page.'],
 ['negated matching price','Acme Pro costs USD 20/month.','Acme Pro does not cost USD 20/month.'],
 ['conditional matching price','Acme Pro costs USD 20/month.','If eligible, Acme Pro costs USD 20/month.'],
] as const)('abstains on ambiguous snippet evidence: %s',async(_name,claim,excerpt)=>{
 let calls=0;
 const fetcher:typeof fetch=async()=>{
  calls++;
  return Response.json({results:[0,1].map(i=>({url:`https://keyword-source-${i}.example/facts`,content:excerpt,published_date:new Date().toISOString()}))});
 };
 const report=await verifyAnswer({version:'1',text:claim},{mode:'live',allowLiveRequests:'true',apiKey:'fake-key',maxRequests:1,fetch:fetcher});
 const result=report.claims[0];
 expect(calls).toBe(1);expect(result.evidence).toHaveLength(2);
 expect(result.outcome).toBe('inconclusive');expect(result.freshness).toBe('unknown');expect(result.freshnessScore).toBeNull();
 expect(result.evidence.every(source=>source.relation==='context')).toBe(true);
});
