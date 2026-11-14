import {expect,it} from 'vitest';
import {verifyAnswer} from '../packages/tavily/src/index';
import {createApp} from '../apps/api/src/app';

it.each([
 [401,'credentials'],[403,'credentials'],[429,'rate or account limit'],[503,'unavailable'],[200,'invalid evidence'],
] as const)('explains upstream HTTP %s without exposing its body',async(status,reason)=>{
 const fetcher:typeof fetch=async()=>new Response('SECRET-UPSTREAM-CONTENT',{status});
 const report=await verifyAnswer({version:'1',text:'Acme costs USD 20/month.'},{mode:'live',allowLiveRequests:'true',apiKey:'private-test-token',maxRequests:1,fetch:fetcher});
 expect(report.claims[0].outcome).toBe('inconclusive');expect(report.claims[0].uncertainty).toContain(reason);expect(JSON.stringify(report)).not.toContain('SECRET-UPSTREAM-CONTENT');expect(JSON.stringify(report)).not.toContain('private-test-token');
});
it('identifies timeout failures',async()=>{
 const fetcher:typeof fetch=async()=>{throw new DOMException('private details','TimeoutError');};
 const report=await verifyAnswer({version:'1',text:'Acme costs USD 20/month.'},{mode:'live',allowLiveRequests:'true',apiKey:'fake',maxRequests:1,fetch:fetcher});
 expect(report.claims[0].uncertainty).toContain('timed out');
});
it('returns actionable validation and malformed JSON messages',async()=>{
 const app=await createApp({implementation:'mock',tavilyMode:'mock'});
 try{
  const invalid=await app.inject({method:'POST',url:'/api/verify',payload:{version:'1',text:''}});
  expect(invalid.statusCode).toBe(400);expect(invalid.json().message).toContain('nonempty text');
  const malformed=await app.inject({method:'POST',url:'/api/verify',headers:{'content-type':'application/json'},payload:'{invalid'});
  expect(malformed.statusCode).toBe(400);expect(malformed.json().message).toContain('JSON syntax');
 }finally{await app.close();}
},20000);
