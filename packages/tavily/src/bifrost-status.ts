import {z} from 'zod';
import {bifrostSettings,hostedReadiness} from './bifrost-interpreter';

export async function checkBifrostStack(env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch){
 const settings=bifrostSettings(env);
 const blocked=hostedReadiness(env,settings);if(blocked)throw new Error(blocked);
 try{
  const health=await fetcher(new URL('/health',settings.endpoint),{redirect:'error',signal:AbortSignal.timeout(2000)});
  if(!health.ok)throw new Error('health');
 }catch{throw new Error('Bifrost is unavailable. Start the local gateway before running a real gateway benchmark.');}
 if(settings.provider!=='ollama')return {gatewayHealthy:true,localModelPresent:false,model:settings.model,notice:'Configuration and gateway health only; account model access, billing status and schema preservation require separate verification.'};
 const ollama=new URL(env.OLLAMA_ENDPOINT??'http://127.0.0.1:11434');
 if(ollama.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(ollama.hostname)||ollama.username||ollama.password||ollama.pathname!=='/'||ollama.search||ollama.hash)throw new Error('Ollama preflight endpoint must be a local HTTP origin');
 try{
  const response=await fetcher(new URL('/api/tags',ollama),{redirect:'error',signal:AbortSignal.timeout(2000)});
  if(!response.ok)throw new Error('tags');
  const tags=z.object({models:z.array(z.object({name:z.string()}))}).parse(await response.json());
  const requested=settings.model.slice('ollama/'.length);
  if(!tags.models.some(model=>model.name===requested))throw new Error('model');
 }catch{throw new Error('Ollama is unavailable or the configured local model is not installed. No model is downloaded automatically.');}
 return {gatewayHealthy:true,localModelPresent:true,model:settings.model,notice:'Preflight checks availability only. A successful routed inference and Bifrost logs are still required to establish the path.'};
}
