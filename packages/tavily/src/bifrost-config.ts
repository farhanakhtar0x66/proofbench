import {bifrostSettings,hostedReadiness} from './bifrost-interpreter';

export function buildBifrostConfig(env:NodeJS.ProcessEnv=process.env){
 const settings=bifrostSettings(env);
 const blocked=hostedReadiness(env,settings);
 if(blocked)throw new Error(blocked);
 const key:Record<string,unknown>={name:`b05-${settings.provider}`,value:`env.${settings.provider==='gemini'?'GEMINI_API_KEY':'GROQ_API_KEY'}`,models:[settings.model.split('/')[1]],weight:1};
 if(settings.provider==='ollama'){
  const url=new URL(env.OLLAMA_ENDPOINT??'http://127.0.0.1:11434');
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Ollama must be a local HTTP origin');
  key.value='';key.ollama_key_config={url:url.origin};
 }
 return {config_store:{enabled:false},client:{enable_logging:true,disable_content_logging:true},providers:{[settings.provider]:{keys:[key],network_config:{allow_private_network:settings.provider==='ollama',max_retries:0,default_request_timeout_in_seconds:9},concurrency_and_buffer_size:{concurrency:1,buffer_size:4}}},plugins:[{name:'logging',enabled:true,config:{disable_content_logging:true,logging_headers:['x-bf-eh-correlation-id']}}]};
}
