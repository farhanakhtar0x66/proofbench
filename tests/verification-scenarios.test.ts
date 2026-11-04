import {expect,it} from 'vitest';
import {verifyAnswer} from '../packages/tavily/src/index';

// Synthetic regression scenarios, not independently collected accuracy evidence.
const scenarios=[
 {name:'unchanged decimal price',claim:'Nimbus Pro currently costs USD 19.99 per month.',evidence:'Nimbus Pro currently costs USD 19.99 per month.',outcome:'supported'},
 {name:'increased monthly price',claim:'Nimbus Pro currently costs USD 20 per month.',evidence:'Nimbus Pro currently costs USD 25 per month.',outcome:'contradicted'},
 {name:'same number in different currencies',claim:'Nimbus Pro currently costs USD 20 per month.',evidence:'Nimbus Pro currently costs EUR 20 per month.',outcome:'inconclusive'},
 {name:'input versus output token prices',claim:'Nimbus API currently costs USD 5 per million input tokens.',evidence:'Nimbus API currently costs USD 15 per million output tokens.',outcome:'inconclusive'},
 {name:'different subscription plan',claim:'Nimbus Pro currently costs USD 20 per month.',evidence:'Nimbus Enterprise currently costs USD 25 per month.',outcome:'inconclusive'},
 {name:'leadership replacement',claim:'The current CEO of Cedar Labs is Maya Chen.',evidence:'The current CEO of Cedar Labs is Arjun Rao.',outcome:'contradicted'},
 {name:'speculative leadership report',claim:'The current CEO of Cedar Labs is Maya Chen.',evidence:'The current CEO of Cedar Labs might be Arjun Rao.',outcome:'inconclusive'},
 {name:'changed dotted version',claim:'Orbit latest API version is v3.2.1.',evidence:'Orbit latest API version is 3.3.0.',outcome:'contradicted'},
 {name:'equivalent version prefix',claim:'Orbit latest API version is v3.2.1.',evidence:'Orbit latest API version is 3.2.1.',outcome:'supported'},
 {name:'unrelated product release',claim:'Orbit latest version is 3.2.1.',evidence:'Orbit Studio latest version is 4.0.',outcome:'inconclusive'},
 {name:'bare dollars require currency clarification',claim:'Nimbus Pro costs $20/month.',evidence:'Nimbus Pro costs $25/month.',outcome:'inconclusive'},
 {name:'ordinary reversed CEO wording',claim:'Maya Chen is the CEO of Cedar Labs.',evidence:'Arjun Rao is the CEO of Cedar Labs.',outcome:'contradicted'},
 {name:'possessive version wording',claim:"Orbit’s latest API version is v3.",evidence:"Orbit’s latest API version is v4.",outcome:'contradicted'},
 {name:'monthly shorthand with explicit currency',claim:'Nimbus Pro costs USD 20/month.',evidence:'The monthly price of Nimbus Pro is USD 25.',outcome:'contradicted'},
 {name:'rupee shorthand agrees across wordings',claim:'Nimbus Pro costs ₹499/month.',evidence:'Nimbus Pro currently costs INR 499 per month.',outcome:'supported'},
 {name:'equivalent CEO word order',claim:'Maya Chen is the CEO of Cedar Labs.',evidence:'The current CEO of Cedar Labs is Maya Chen.',outcome:'supported'},
 {name:'equivalent possessive versions',claim:"Orbit's latest API version is v3.2.",evidence:'Orbit latest API version is 3.2.',outcome:'supported'},
 {name:'annual versus monthly still differs',claim:'Nimbus Pro costs EUR 20/month.',evidence:'The annual price of Nimbus Pro is EUR 20.',outcome:'inconclusive'},
 {name:'ambiguous dollar versus explicit USD',claim:'Nimbus Pro costs $20/month.',evidence:'Nimbus Pro costs USD 20/month.',outcome:'inconclusive'},
 {name:'approximate amounts abstain',claim:'Nimbus Pro costs USD 20/month.',evidence:'Nimbus Pro costs about USD 20/month.',outcome:'inconclusive'},
 {name:'future pricing abstains',claim:'Nimbus Pro costs USD 20/month.',evidence:'Nimbus Pro costs USD 25/month starting tomorrow.',outcome:'inconclusive'},
] as const;

it.each(scenarios)('$name',async({claim,evidence,outcome})=>{
 let calls=0;
 const fetcher:typeof fetch=async()=>{
  calls++;
  return Response.json({results:[0,1].map(i=>({url:`https://synthetic-source-${i}.example/facts`,title:'Synthetic test evidence',content:evidence,published_date:new Date().toISOString()}))});
 };
 const report=await verifyAnswer({version:'1',text:claim},{mode:'live',allowLiveRequests:'true',apiKey:'fake-test-key',maxRequests:1,fetch:fetcher});
 expect(calls).toBe(1);
 expect(report.claims).toHaveLength(1);
 expect(report.claims[0].outcome).toBe(outcome);
 expect(report.claims[0].freshness).toBe(outcome==='supported'?'current':outcome==='contradicted'?'stale':'unknown');
 expect(report.claims[0].freshnessScore).toBe(outcome==='supported'?100:outcome==='contradicted'?0:null);
 expect(report.claims[0].evidence).toHaveLength(2);
});

it('returns separate results for a mixed answer using the actual extraction pipeline',async()=>{
 const statements=[
  'Nimbus Pro currently costs USD 20 per month.',
  'The current CEO of Cedar Labs is Maya Chen.',
  'Orbit latest version is 3.2.',
 ];
 const fetcher:typeof fetch=async(_url,init)=>{
  const {query}=JSON.parse(String(init?.body)) as {query:string};
  const content=query.includes('nimbus')?'Nimbus Pro currently costs USD 25 per month.':query.includes('cedar')?statements[1]:'Orbit latest version is 4.0.';
  return Response.json({results:[0,1].map(i=>({url:`https://synthetic-source-${i}.example/facts`,content,published_date:new Date().toISOString()}))});
 };
 const report=await verifyAnswer({version:'1',text:statements.join('\n')},{mode:'live',allowLiveRequests:'true',apiKey:'fake-test-key',maxRequests:3,fetch:fetcher});
 expect(report.claims.map(claim=>claim.text)).toEqual(statements);
 expect(report.claims.map(claim=>claim.outcome)).toEqual(['contradicted','supported','contradicted']);
});
