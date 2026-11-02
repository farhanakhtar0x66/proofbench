import {it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app';
import {task} from '../packages/contracts/src/examples';
import {verifyAnswer} from '../packages/tavily/src/index';
import {selectAdapter} from '../packages/agent-adapters/src/index';
it('unknown claims remain inconclusive and offline',async()=>{
 const report=await verifyAnswer({version:'1',text:'The moon is made of cheese.'});
 expect(report.mode).toBe('mock'); expect(report.claims[0].outcome).toBe('inconclusive'); expect(report.claims[0].evidence).toEqual([]);
});
it.each(['01','02'] as const)('%s rejects unavailable execution instead of simulating success',async mode=>{
 const adapter=selectAdapter(mode);
 expect(adapter.descriptor.implementation).toBe(mode);
 expect(adapter.capabilities.execute).toBe(false);
 await expect(adapter.run({version:'1',task,agentId:adapter.descriptor.id,seed:0})).rejects.toThrow('not integrated');
});
it('rejects invalid configuration',()=>expect(()=>selectAdapter('oops')).toThrow());
it('serves health, validates input, persists verification and links runs, reports, traces',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'proofbench-test-'));
 const app=await createApp({dataDir:dir,implementation:'mock'});
 try {
 expect((await app.inject('/api/health')).statusCode).toBe(200);
 expect((await app.inject('/api/capabilities')).json().capabilities.execute).toBe(true);
 expect((await app.inject({method:'POST',url:'/api/verify',payload:{text:''}})).statusCode).toBe(400);
 const verification=await app.inject({method:'POST',url:'/api/verify',payload:{version:'1',text:'Python 2 is currently supported.'}});
 expect(verification.statusCode).toBe(201);
 expect(verification.json().claims[0].outcome).toBe('contradicted');
 const run=await app.inject({method:'POST',url:'/api/runs',payload:{version:'1',task,agentId:'mock-local'}});
 expect(run.statusCode).toBe(201);
 expect(run.json().usage.inputTokens.status).toBe('missing');
 expect((await app.inject(`/api/runs/${run.json().id}/trace`)).json().events.length).toBeGreaterThan(0);
 expect((await app.inject(`/api/reports/${run.json().reportId}`)).statusCode).toBe(200);
 expect((await app.inject('/api/runs/not-found')).statusCode).toBe(404);
 await app.close();
 const reopened=await createApp({dataDir:dir,implementation:'mock'});
 expect((await reopened.inject(`/api/verify/${verification.json().id}`)).statusCode).toBe(200);
 await reopened.close();
 } finally {await app.close();await rm(dir,{recursive:true,force:true});}
});
it('returns 501 for unintegrated Bifrost while verification remains available',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'proofbench-test-'));
 const app=await createApp({dataDir:dir,implementation:'01'});
 try {
 expect((await app.inject({method:'POST',url:'/api/runs',payload:{version:'1',task,agentId:'bifrost-01'}})).statusCode).toBe(501);
 expect((await app.inject({method:'POST',url:'/api/verify',payload:{version:'1',text:'A claim.'}})).statusCode).toBe(201);
 } finally {await app.close();await rm(dir,{recursive:true,force:true});}
});
it('preserves explicit historical scope without applying a current fixture verdict',async()=>{
 const asOf='2019-01-01T00:00:00.000Z';
 const result=await verifyAnswer({version:'1',text:'Python 2 is currently supported.',claims:[{text:'Python 2 is currently supported.',asOf}]});
 expect(result.claims[0].outcome).toBe('inconclusive');
 expect(result.claims[0].asOf).toBe(asOf);
});
it('never invents a retrieval timestamp for offline annotations',async()=>{
 const result=await verifyAnswer({version:'1',text:'Python 2 is currently supported.'});
 expect(result.claims[0].evidence[0].retrievedAt).toBeNull();
});
it('does not call Tavily unless live mode, approval, a key, and a positive cap are all supplied',async()=>{
 const request={version:'1' as const,text:'The current CEO of Example Corp is Ada Lovelace.'};
 const fetcher=async()=>{throw new Error('network call should be blocked');};
 await expect(verifyAnswer(request,{mode:'live',apiKey:'test-key',maxRequests:1,fetch:fetcher})).rejects.toThrow('ALLOW_PAID_REQUESTS=true');
 await expect(verifyAnswer(request,{mode:'live',allowPaidRequests:'true',apiKey:'test-key',maxRequests:0,fetch:fetcher})).rejects.toThrow('TAVILY_MAX_REQUESTS');
});
it('uses mocked Tavily evidence only within the explicit request budget',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;return new Response(JSON.stringify({results:[{url:'https://example.com/leadership',title:'Leadership',content:'The current CEO of Example Corp is Ada Lovelace.'}]}),{status:200,headers:{'Content-Type':'application/json'}});};
 const result=await verifyAnswer({version:'1',text:'The current CEO of Example Corp is Ada Lovelace. The current API version is 2.'},{mode:'live',allowPaidRequests:'true',apiKey:'test-key',maxRequests:1,fetch:fetcher});
 expect(calls).toBe(1);expect(result.mode).toBe('live');expect(result.claims[0].outcome).toBe('inconclusive');expect(result.claims[0].evidence[0].relation).toBe('context');expect(result.claims[1].outcome).toBe('inconclusive');expect(result.claims[1].uncertainty).toContain('budget exhausted');
});
it('reuses duplicate claims within a report without spending another request',async()=>{
 let calls=0;
 const fetcher:typeof fetch=async(_url,init)=>{calls++;expect(init?.signal).toBeInstanceOf(AbortSignal);return Response.json({results:[]});};
 const text='The current API version is 2.';
 const result=await verifyAnswer({version:'1',text,claims:[{text},{text}]},{mode:'live',allowPaidRequests:'true',apiKey:'test-key',maxRequests:1,fetch:fetcher});
 expect(calls).toBe(1);expect(result.claims).toHaveLength(2);expect(result.claims[0].id).not.toBe(result.claims[1].id);
});
it('abstains on retrieval errors without retrying or disclosing upstream details',async()=>{
 let calls=0;
 const fetcher:typeof fetch=async()=>{calls++;throw new Error('secret upstream detail');};
 const result=await verifyAnswer({version:'1',text:'The current API version is 2.'},{mode:'live',allowPaidRequests:'true',apiKey:'test-key',maxRequests:1,fetch:fetcher});
 expect(calls).toBe(1);expect(result.claims[0].outcome).toBe('inconclusive');expect(result.claims[0].evidence).toEqual([]);expect(JSON.stringify(result)).not.toContain('secret upstream detail');
});
it('never treats negated or changed numeric evidence as proof from word overlap',async()=>{
 const fetcher:typeof fetch=async()=>Response.json({results:[{url:'https://example.com/pricing',content:'The current API price is not 5 dollars. The current API price is 9 dollars.'}]});
 const result=await verifyAnswer({version:'1',text:'The current API price is 5 dollars.'},{mode:'live',allowPaidRequests:'true',apiKey:'test-key',maxRequests:1,fetch:fetcher});
 expect(result.claims[0].outcome).toBe('inconclusive');expect(result.claims[0].freshness).toBe('unknown');
});
