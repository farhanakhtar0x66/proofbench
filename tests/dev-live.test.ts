import {expect,it,vi} from 'vitest';
import {LiveStartupError,liveDevelopmentConfig,checkLiveGateway} from '../scripts/dev-live-config';
const base={LANGUAGE_MODE:'rules',TAVILY_MODE:'mock',ALLOW_LIVE_REQUESTS:'false',TAVILY_MAX_REQUESTS:'0',TAVILY_API_KEY:'fake-tavily',BIFROST_LLM_PROVIDER:'groq',BIFROST_LLM_MODEL:'groq/openai/test-model',GROQ_API_KEY:'fake-groq',BIFROST_FREE_TIER_CONFIRMED:'true',BIFROST_LLM_MAX_REQUESTS:'0',VITE_API_MODE:'mock',API_PROXY_TARGET:'https://wrong.example'};
it('sets equal explicit caps and real backend routing without modifying the input or choosing another provider',()=>{
 const original=structuredClone(base);const config=liveDevelopmentConfig(['--requests','5'],base);
 expect(base).toEqual(original);expect(config.env).toMatchObject({LANGUAGE_MODE:'bifrost',CLAIM_EXTRACTION_MODE:'rules',EVIDENCE_COMPARISON_MODE:'llm',TAVILY_MODE:'live',ALLOW_LIVE_REQUESTS:'true',TAVILY_MAX_REQUESTS:'5',BIFROST_LLM_MAX_REQUESTS:'5',VITE_API_MODE:'live',API_PROXY_TARGET:'http://127.0.0.1:3001'});expect(config.settings.provider).toBe('groq');expect(config.configurationOnly).toBe(false);
});
it.each([[],['--requests','0'],['--requests','21'],['--requests','2.5'],['--requests','-1'],['--requests','5','--extra'],['--requests','5','--check','--check']].map(args=>({args})))('rejects missing or invalid allowances: $args',({args})=>expect(()=>liveDevelopmentConfig(args,base)).toThrow(LiveStartupError));
it.each(['gemini','groq'])('preserves explicit %s selection',provider=>{
 const config=liveDevelopmentConfig(['--requests','3','--check'],{...base,BIFROST_LLM_PROVIDER:provider,BIFROST_LLM_MODEL:`${provider}/test-model`,GEMINI_API_KEY:'fake-gemini'});expect(config.settings.provider).toBe(provider);expect(config.configurationOnly).toBe(true);
});
it.each([{TAVILY_API_KEY:''},{GROQ_API_KEY:''},{BIFROST_FREE_TIER_CONFIRMED:'false'},{BIFROST_LLM_MODEL:'gemini/wrong-route'},{BIFROST_LLM_ENDPOINT:'https://outside.example'},{PORT:'-1'},{PORT:'5173'},{PORT:'8080'}])('fails closed on incomplete or unsafe configuration without leaking values: %j',override=>{
 const env={...base,...override};let message='';try{liveDevelopmentConfig(['--requests','5'],env);}catch(error){message=String(error);}
 expect(message).not.toBe('');expect(message).not.toContain('fake-tavily');expect(message).not.toContain('fake-groq');
});
it('probes only local gateway health, never inference or search',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json({status:'ok'}));await checkLiveGateway(liveDevelopmentConfig(['--requests','5'],base),fetcher);
 expect(fetcher).toHaveBeenCalledTimes(1);expect(String(fetcher.mock.calls[0][0])).toBe('http://127.0.0.1:8080/health');
});
it('stops on gateway failure before starting any verification, without retrying or leaking the upstream error',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>{throw new Error('private-provider-secret');});
 await expect(checkLiveGateway(liveDevelopmentConfig(['--requests','5'],base),fetcher)).rejects.toThrow('Start npm run bifrost:start');expect(fetcher).toHaveBeenCalledTimes(1);
});
