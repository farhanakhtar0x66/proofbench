import {expect,it,vi} from 'vitest';
import {bifrostSettings,createBifrostInterpreter,INTERPRETATION_JSON_SCHEMA} from '../packages/tavily/src/bifrost-interpreter';
import {Interpretation,interpretationSession} from '../packages/tavily/src/interpretation';
import {buildBifrostConfig} from '../packages/tavily/src/bifrost-config';
import {listAccountModels} from '../packages/tavily/src/provider-models';
import {checkBifrostStack} from '../packages/tavily/src/bifrost-status';

const text='Subscribers pay twenty USD monthly for Acme Pro.';
const fact={entity:'Acme Pro',kind:'price',value:'twenty',currency:'USD',period:'monthly',time:null,region:null,tier:null};
const env=(provider='gemini')=>({BIFROST_LLM_PROVIDER:provider,BIFROST_LLM_MODEL:`${provider}/test-model`,BIFROST_FREE_TIER_CONFIRMED:'true',BIFROST_LLM_MAX_REQUESTS:'10',GEMINI_API_KEY:'fake-gemini',GROQ_API_KEY:'fake-groq'});
const envelope=(value:unknown=fact)=>Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(value)}}]});
it('preserves a namespaced Groq model identifier for explicit future provider evaluation',()=>{
 const configured={...env('groq'),BIFROST_LLM_MODEL:'groq/openai/gpt-oss-20b'};
 expect(bifrostSettings(configured).model).toBe('groq/openai/gpt-oss-20b');
 expect(buildBifrostConfig(configured).providers.groq.keys[0].models).toEqual(['openai/gpt-oss-20b']);
 expect(()=>bifrostSettings({...configured,BIFROST_LLM_MODEL:'groq/../test'})).toThrow();
 expect(()=>bifrostSettings({...configured,BIFROST_LLM_MODEL:'gemini/other'})).toThrow();
});
it.each(['gemini','groq'])('routes %s only through Bifrost with explicit strict schema and validates returned fields',async provider=>{
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
  expect(String(url)).toBe('http://127.0.0.1:8080/v1/chat/completions');
  const body=JSON.parse(String(init?.body));expect(body.model).toBe(`${provider}/test-model`);
  if(provider==='gemini')expect(body).not.toHaveProperty('temperature');
  else expect(body.temperature).toBe(0);
  expect(body).not.toHaveProperty('top_p');expect(body).not.toHaveProperty('top_k');
  expect(body.response_format).toEqual({type:'json_schema',json_schema:{name:'claim_interpretation',strict:true,schema:INTERPRETATION_JSON_SCHEMA}});
  expect(JSON.stringify(init)).not.toContain('fake-gemini');expect(JSON.stringify(init)).not.toContain('fake-groq');
  expect(body.fallbacks).toBeUndefined();return envelope();
 });
 expect(await interpretationSession(createBifrostInterpreter(env(provider),fetcher)).normalize(text)).toBe('Acme Pro costs USD 20 per month.');
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it('keeps wire schema aligned with Zod required fields, enum, bounds and nullable qualifiers',()=>{
 expect(INTERPRETATION_JSON_SCHEMA.required).toEqual(Object.keys(Interpretation.shape));
 expect(INTERPRETATION_JSON_SCHEMA.additionalProperties).toBe(false);
 expect(INTERPRETATION_JSON_SCHEMA.properties.kind.enum).toEqual(Interpretation.shape.kind.options);
 for(const field of ['entity','value'] as const){expect(Interpretation.shape[field].minLength).toBe(1);expect(Interpretation.shape[field].maxLength).toBe(100);}
 for(const field of ['currency','period','time','region','tier'] as const)expect(Interpretation.shape[field].isNullable()).toBe(true);
});
it.each([{BIFROST_LLM_MODEL:''},{GEMINI_API_KEY:''},{BIFROST_FREE_TIER_CONFIRMED:'false'},{BIFROST_LLM_MAX_REQUESTS:'0'}])('abstains with no network for incomplete hosted setup %j',async patch=>{
 const fetcher=vi.fn();const adapter=createBifrostInterpreter({...env(),...patch},fetcher);
 expect(await interpretationSession(adapter).normalize(text)).toBe(text);expect(fetcher).not.toHaveBeenCalled();
});
it('rejects mismatched routes instead of switching providers',()=>expect(()=>bifrostSettings({...env(),BIFROST_LLM_MODEL:'groq/other'})).toThrow('match'));
it('shares a cap across requests on the same adapter',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>envelope());const adapter=createBifrostInterpreter({...env(),BIFROST_LLM_MAX_REQUESTS:'1'},fetcher);
 await adapter.interpret(text);await expect(adapter.interpret(text)).rejects.toThrow('cap');expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([401,403,429,500,503])('backs off after HTTP %s without retry or provider fallback',async status=>{
 const fetcher=vi.fn<typeof fetch>(async()=>new Response('secret upstream error',{status}));const adapter=createBifrostInterpreter(env(),fetcher);
 await expect(adapter.interpret(text)).rejects.toThrow('rules-only');await expect(adapter.interpret(text)).rejects.toThrow('cooldown');expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([{...fact,verdict:'supported'},{...fact,entity:42},{...fact,tier:undefined},null])('rejects malformed/schema-bypassing hosted output %j',async value=>{
 const fetcher=vi.fn<typeof fetch>(async()=>envelope(value));
 expect(await interpretationSession(createBifrostInterpreter(env(),fetcher)).normalize(text)).toBe(text);
});
it('does not trust hallucinated spans just because schema passed',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>envelope({...fact,entity:'Different company'}));
 expect(await interpretationSession(createBifrostInterpreter(env(),fetcher)).normalize(text)).toBe(text);
});
it.each(['gemini','groq'])('generates a single %s provider with only environment key references and no retries',provider=>{
 const config=buildBifrostConfig(env(provider));expect(Object.keys(config.providers)).toEqual([provider]);
 const selected=config.providers[provider];expect(selected.keys[0].models).toEqual(['test-model']);expect(selected.network_config.max_retries).toBe(0);
 expect(JSON.stringify(config)).not.toContain('fake-');expect(selected.keys[0].value).toBe(`env.${provider==='gemini'?'GEMINI_API_KEY':'GROQ_API_KEY'}`);
});
it('checks hosted health without contacting Ollama or doing inference',async()=>{
 const fetcher=vi.fn<typeof fetch>(async url=>{expect(String(url)).toContain('/health');return Response.json({status:'ok'});});
 expect((await checkBifrostStack(env(),fetcher)).gatewayHealthy).toBe(true);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('lists paginated account models without treating visibility as free quota',async()=>{
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
  expect((init?.headers as Record<string,string>)['x-goog-api-key']).toBe('fake-gemini');expect(String(url)).not.toContain('fake-gemini');
  return String(url).includes('pageToken=next')?Response.json({models:[{name:'models/image-only',supportedGenerationMethods:['predict']}]}):Response.json({models:[{name:'models/account-model',supportedGenerationMethods:['generateContent']}],nextPageToken:'next'});
 });
 const result=await listAccountModels(env(),fetcher);expect(result.models).toEqual(['gemini/account-model']);expect(result.notice).toContain('does not prove');expect(fetcher).toHaveBeenCalledTimes(2);
});
it('lists Groq models with its own key and handles missing keys and 429 without retries',async()=>{
 expect((await listAccountModels(env('groq'),async()=>Response.json({data:[{id:'active',active:true},{id:'disabled',active:false}]}))).models).toEqual(['groq/active']);
 const fetcher=vi.fn<typeof fetch>(async()=>new Response('',{status:429}));await expect(listAccountModels({...env(),GEMINI_API_KEY:''},fetcher)).rejects.toThrow('missing');expect(fetcher).not.toHaveBeenCalled();
 await expect(listAccountModels(env(),fetcher)).rejects.toThrow('rate limited');expect(fetcher).toHaveBeenCalledTimes(1);
});
