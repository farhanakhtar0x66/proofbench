import {bifrostSettings,hostedReadiness} from '../packages/tavily/src/bifrost-interpreter';
import {checkBifrostStack} from '../packages/tavily/src/bifrost-status';

export class LiveStartupError extends Error {}

export function liveDevelopmentConfig(args:string[],base:NodeJS.ProcessEnv){
 const checked=args.includes('--check');const values=args.filter(arg=>arg!=='--check');
 if(args.filter(arg=>arg==='--check').length>1||values.length!==2||values[0]!=='--requests'||!/^\d+$/u.test(values[1]))throw new LiveStartupError('Use npm run dev:live -- --requests N (1–20). Add --check for configuration-only validation.');
 const limit=Number(values[1]);
 if(limit<1||limit>20)throw new LiveStartupError('Choose an explicit request allowance between 1 and 20.');
 const port=base.PORT??'3001';
 if(!/^\d+$/u.test(port)||Number(port)<1||Number(port)>65535)throw new LiveStartupError('PORT must be a valid local TCP port.');
 const env:NodeJS.ProcessEnv={...base,HOST:'127.0.0.1',PORT:port,LANGUAGE_MODE:'bifrost',CLAIM_EXTRACTION_MODE:'rules',EVIDENCE_COMPARISON_MODE:'llm',TAVILY_MODE:'live',ALLOW_LIVE_REQUESTS:'true',TAVILY_MAX_REQUESTS:String(limit),BIFROST_LLM_MAX_REQUESTS:String(limit),VITE_API_MODE:'live',API_PROXY_TARGET:`http://127.0.0.1:${port}`};
 if(!env.TAVILY_API_KEY?.trim())throw new LiveStartupError('TAVILY_API_KEY is missing from the ignored local .env.');
 let settings:ReturnType<typeof bifrostSettings>;
 try{settings=bifrostSettings(env);}catch{throw new LiveStartupError('The selected Bifrost provider, model or endpoint is invalid. Review local provider configuration.');}
 if(Number(port)===5173||Number(port)===Number(new URL(settings.endpoint).port||80))throw new LiveStartupError('The API port must differ from the website and gateway ports.');
 if(settings.provider==='ollama')throw new LiveStartupError('This hosted live launcher requires explicitly selected Gemini or Groq. Existing rules-only/local workflows remain separate.');
 const blocked=hostedReadiness(env,settings);
 if(blocked)throw new LiveStartupError(blocked);
 return {env,settings,limit,configurationOnly:checked};
}

/** Health endpoint only for hosted providers: no Tavily or model request. */
export async function checkLiveGateway(config:ReturnType<typeof liveDevelopmentConfig>,fetcher:typeof fetch=fetch){
 try{await checkBifrostStack(config.env,fetcher);}catch{throw new LiveStartupError('Bifrost is not ready. Start npm run bifrost:start in another terminal and keep it running. No verification request was made.');}
}
