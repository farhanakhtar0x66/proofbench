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
