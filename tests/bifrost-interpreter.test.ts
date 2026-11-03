import {expect,it,vi} from 'vitest';
import {createBifrostInterpreter,bifrostSettings} from '../packages/tavily/src/bifrost-interpreter';
import {createLanguageInterpreter} from '../packages/tavily/src/language-provider';
import {interpretationSession} from '../packages/tavily/src/interpretation';
import {verifyAnswer} from '../packages/tavily/src/index';
import {checkBifrostStack} from '../packages/tavily/src/bifrost-status';
import {createApp} from '../apps/api/src/app';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const text='Subscribers pay twenty USD monthly for Acme Pro.';
const local={BIFROST_LLM_PROVIDER:'ollama',BIFROST_LLM_MODEL:'ollama/qwen2.5:3b'};
const fact={entity:'Acme Pro',kind:'price',value:'twenty',currency:'USD',period:'monthly',time:null,region:null,tier:null};
const envelope=(content=JSON.stringify(fact),finish='stop')=>({choices:[{finish_reason:finish,message:{role:'assistant',content}}]});
it('keeps rules-only startup independent of invalid gateway settings',()=>{
 const fetcher=vi.fn();
 expect(createLanguageInterpreter({LANGUAGE_MODE:'rules',BIFROST_LLM_ENDPOINT:'bad'},fetcher)).toBeUndefined();expect(fetcher).not.toHaveBeenCalled();
 expect(()=>createLanguageInterpreter({LANGUAGE_MODE:'wrong'})).toThrow();
});
it.each(['https://remote.example','http://user:pass@localhost:8080','http://localhost:8080/path','http://localhost:8080/?key=secret'])('rejects unsupported gateway endpoint %s',endpoint=>{
 expect(()=>bifrostSettings({BIFROST_LLM_ENDPOINT:endpoint})).toThrow();
});
it.each(['openai/model','ollama/model:cloud','ollama/model\nother'])('does not silently add hosted routes: %s',model=>expect(()=>bifrostSettings({BIFROST_LLM_MODEL:model})).toThrow());
it('sends one bounded, nonstreaming request with explicit Ollama route and optional gateway key',async()=>{
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
  expect(String(url)).toBe('http://127.0.0.1:8080/v1/chat/completions');
  expect(init?.redirect).toBe('error');expect(init?.signal).toBeInstanceOf(AbortSignal);
  const headers=init?.headers as Record<string,string>;expect(headers['x-bf-vk']).toBe('test-gateway-key');expect(headers['x-bf-eh-correlation-id']).toBeTruthy();
  const body=JSON.parse(String(init?.body));expect(body.model).toBe('ollama/qwen2.5:3b');expect(body.temperature).toBe(0);expect(body.stream).toBe(false);expect(body.tools).toBeUndefined();expect(body.fallbacks).toBeUndefined();expect(body.messages[0].content).toContain('Never decide truth');
  return Response.json(envelope());
 });
 const adapter=createLanguageInterpreter({...local,LANGUAGE_MODE:'bifrost',BIFROST_LLM_VIRTUAL_KEY:'test-gateway-key'},fetcher)!;
 expect(await interpretationSession(adapter).normalize(text)).toContain('USD 20 per month');expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(['http','network','timeout','invalid-json','wrong-schema','truncated','tool-call','oversized'])('falls back without retry for %s',async failure=>{
 let calls=0;
 const fetcher:typeof fetch=async()=>{
  calls++;
  if(failure==='network')throw new Error('secret network details');
  if(failure==='timeout')throw new DOMException('timeout','TimeoutError');
  if(failure==='http')return new Response('secret provider error',{status:503});
  if(failure==='invalid-json')return new Response('not-json');
  if(failure==='oversized')return new Response('x'.repeat(33000));
  if(failure==='tool-call')return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(fact),tool_calls:[]}}]});
  return Response.json(envelope(failure==='wrong-schema'?JSON.stringify({...fact,verdict:'supported'}):JSON.stringify(fact),failure==='truncated'?'length':'stop'));
 };
 const session=interpretationSession(createBifrostInterpreter(local,fetcher));
 expect(await session.normalize(text)).toBe(text);await session.normalize('Another unsupported price phrase.');expect(calls).toBe(1);
});
it('runs the verifier through a gateway-shaped fake upstream, preserving evidence-backed outcomes',async()=>{
 let gatewayCalls=0;let evidenceCalls=0;
 const gateway:typeof fetch=async()=>{gatewayCalls++;return Response.json(envelope());};
 const evidence:typeof fetch=async()=>{evidenceCalls++;return Response.json({results:[0,1].map(i=>({url:`https://source${i}.example`,content:'Acme Pro costs USD 25/month.',published_date:new Date().toISOString()}))});};
 const report=await verifyAnswer({version:'1',text},{mode:'live',allowPaidRequests:'true',apiKey:'fake',maxRequests:1,fetch:evidence,interpreter:createBifrostInterpreter(local,gateway)});
 expect(report.claims[0].outcome).toBe('contradicted');expect(report.claims[0].text).toBe(text);expect(report.claims[0].uncertainty).toContain('Bifrost');expect(gatewayCalls).toBe(1);expect(evidenceCalls).toBe(1);
});
it('preflights availability and model presence without inference',async()=>{
 const fetcher:typeof fetch=async url=>String(url).endsWith('/health')?Response.json({status:'ok'}):Response.json({models:[{name:'qwen2.5:3b'}]});
 expect((await checkBifrostStack(local,fetcher)).localModelPresent).toBe(true);
 await expect(checkBifrostStack(local,async()=>new Response('',{status:503}))).rejects.toThrow('Bifrost is unavailable');
 await expect(checkBifrostStack(local,async url=>String(url).endsWith('/health')?Response.json({}):Response.json({models:[]}))).rejects.toThrow('model is not installed');
});
it('connects the Fastify verify route to the configured gateway adapter without real services',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'b05-gateway-test-'));
 vi.stubEnv('LANGUAGE_MODE','bifrost');vi.stubEnv('BIFROST_LLM_ENDPOINT','http://127.0.0.1:8080');vi.stubEnv('BIFROST_LLM_MODEL','ollama/qwen2.5:3b');vi.stubEnv('ALLOW_PAID_REQUESTS','true');vi.stubEnv('TAVILY_API_KEY','fake-test-key');vi.stubEnv('TAVILY_MAX_REQUESTS','1');
 let gateways=0;let searches=0;
 vi.spyOn(globalThis,'fetch').mockImplementation(async url=>{
  if(String(url)==='http://127.0.0.1:8080/v1/chat/completions'){gateways++;return Response.json(envelope());}
  if(String(url)==='https://api.tavily.com/search'){searches++;return Response.json({results:[0,1].map(i=>({url:`https://source${i}.example`,content:'Acme Pro costs USD 25/month.',published_date:new Date().toISOString()}))});}
  throw new Error('Unexpected network destination');
 });
 const app=await createApp({implementation:'mock',tavilyMode:'live',dataDir:dir});
 try{
  const response=await app.inject({method:'POST',url:'/api/verify',payload:{version:'1',text}});
  expect(response.statusCode).toBe(201);expect(response.json().claims[0].outcome).toBe('contradicted');expect(gateways).toBe(1);expect(searches).toBe(1);
  expect((await app.inject(`/api/verify/${response.json().id}`)).statusCode).toBe(200);
 }finally{await app.close();vi.restoreAllMocks();vi.unstubAllEnvs();await rm(dir,{recursive:true,force:true});}
},20000);
