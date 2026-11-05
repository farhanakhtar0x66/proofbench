import {expect,it} from 'vitest';
import {verifyAnswer} from '../packages/tavily/src/index';

const text='Acme Pro costs USD 20/month.';
const other='Acme Pro costs USD 25/month.';
it.each([
 {name:'empty search',claim:text,contents:[],dated:true,reason:'No usable source evidence'},
 {name:'undated evidence',claim:text,contents:[text,text],dated:false,reason:'no valid publication dates'},
 {name:'conflicting sources',claim:text,contents:[text,other],dated:true,reason:'sources disagree'},
 {name:'only one source',claim:text,contents:[text],dated:true,reason:'Fewer than two'},
 {name:'different billing scope',claim:text,contents:['Acme Pro costs USD 20/year.'],dated:true,reason:'same entity and scope'},
 {name:'ambiguous currency',claim:'Acme Pro costs $20/month.',contents:[text,text],dated:true,reason:'dollar symbol'},
 {name:'unsupported wording',claim:'Acme Pro pricing is affordable.',contents:[text,text],dated:true,reason:'supported English'},
])('explains $name',async({claim,contents,dated,reason})=>{
 const fetcher:typeof fetch=async()=>Response.json({results:contents.map((content,i)=>({url:`https://source${i}.example/facts`,content,published_date:dated?new Date().toISOString():undefined}))});
 const report=await verifyAnswer({version:'1',text:claim},{mode:'live',allowLiveRequests:'true',apiKey:'test-key',maxRequests:1,fetch:fetcher});
 expect(report.claims[0].outcome).toBe('inconclusive');expect(report.claims[0].freshnessScore).toBeNull();expect(report.claims[0].uncertainty).toContain(reason);
});
