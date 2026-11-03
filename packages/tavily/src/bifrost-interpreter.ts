import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Interpretation,INTERPRETATION_PROMPT,type LanguageInterpreter} from './interpretation';
import {ExtractionOutput,EXTRACTION_PROMPT,EXTRACTION_SCHEMA} from './claim-extraction';

export const BifrostSettings=z.object({endpoint:z.string().default('http://127.0.0.1:8080'),provider:z.enum(['gemini','groq','ollama']),model:z.string().regex(/^(?:(?:gemini|groq|ollama)\/[a-zA-Z0-9_.:-]+)?$/u).refine(value=>!value.toLowerCase().includes('cloud'),'Cloud aliases are disabled'),timeoutMs:z.coerce.number().int().min(100).max(10000).default(8000),virtualKey:z.string().optional(),maxRequests:z.coerce.number().int().min(0).max(100).default(0)});
export function bifrostSettings(env:NodeJS.ProcessEnv=process.env){
 const settings=BifrostSettings.parse({endpoint:env.BIFROST_LLM_ENDPOINT,provider:env.BIFROST_LLM_PROVIDER??env.BIFROST_LLM_MODEL?.split('/')[0]??'gemini',model:env.BIFROST_LLM_MODEL??'',timeoutMs:env.BIFROST_LLM_TIMEOUT_MS,virtualKey:env.BIFROST_LLM_VIRTUAL_KEY,maxRequests:env.BIFROST_LLM_MAX_REQUESTS});
 if(settings.model&&!settings.model.startsWith(`${settings.provider}/`))throw new Error('Model route must match selected provider');
 const url=new URL(settings.endpoint);
 if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Bifrost endpoint must be a local HTTP origin without credentials, path, query or fragment');
 return settings;
}
export function hostedReadiness(env:NodeJS.ProcessEnv,settings=bifrostSettings(env)):string|undefined{
 if(!settings.model)return 'No model selected; rules-only fallback is active';
 if(settings.provider==='ollama')return;
 if(env.BIFROST_FREE_TIER_CONFIRMED!=='true')return 'Confirm a Free tier account with billing disabled before hosted inference';
 if(!env[settings.provider==='gemini'?'GEMINI_API_KEY':'GROQ_API_KEY']?.trim())return 'Selected provider API key is missing';
 if(settings.maxRequests===0)return 'Hosted inference request cap is zero';
}
// Mirrors the strict Zod object; wire-schema parity is covered by tests.
export const INTERPRETATION_JSON_SCHEMA={type:'object',additionalProperties:false,required:['entity','kind','value','currency','period','time','region','tier'],properties:{entity:{type:'string',minLength:1,maxLength:100},kind:{type:'string',enum:['price','ceo','version']},value:{type:'string',minLength:1,maxLength:100},...Object.fromEntries(['currency','period','time','region','tier'].map(key=>[key,{type:['string','null']}]))}};
const ChatEnvelope=z.object({error:z.never().optional(),choices:z.array(z.object({finish_reason:z.literal('stop'),message:z.object({role:z.literal('assistant'),content:z.string().min(1).max(16000),tool_calls:z.never().optional(),function_call:z.never().optional(),refusal:z.null().optional()})})).length(1)});

async function readBounded(response:Response):Promise<unknown>{
 if(!response.body)throw new Error('Empty gateway response');
 const reader=response.body.getReader();const parts:Uint8Array[]=[];let bytes=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>32000){await reader.cancel();throw new Error('Gateway response exceeded limit');}parts.push(value);}
 }finally{reader.releaseLock();}
 const combined=new Uint8Array(bytes);let offset=0;
 for(const part of parts){combined.set(part,offset);offset+=part.byteLength;}
 return JSON.parse(new TextDecoder().decode(combined));
}

export function createBifrostInterpreter(env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch):LanguageInterpreter{
 const settings=bifrostSettings(env);
 const blocked=hostedReadiness(env,settings);let requests=0;let unavailableUntil=0;
 async function request(text:string,prompt:string,name:string,schema:unknown,parse:(value:unknown)=>unknown){
  if(blocked)throw new Error(blocked);
  if(settings.provider!=='ollama'&&(requests>=settings.maxRequests||Date.now()<unavailableUntil))throw new Error('Hosted request cap or cooldown reached; rules-only fallback');
  requests++;
  const headers:Record<string,string>={'Content-Type':'application/json','x-bf-eh-correlation-id':randomUUID()};
  if(settings.virtualKey)headers['x-bf-vk']=settings.virtualKey;
  // Gemini's newer models reject sampling overrides; use provider defaults.
  const sampling=settings.provider==='gemini'?{}:{temperature:0};
  try{
  const response=await fetcher(new URL('/v1/chat/completions',settings.endpoint),{method:'POST',redirect:'error',signal:AbortSignal.timeout(settings.timeoutMs),headers,body:JSON.stringify({model:settings.model,stream:false,n:1,...sampling,max_tokens:1024,response_format:settings.provider==='ollama'?{type:'json_object'}:{type:'json_schema',json_schema:{name,strict:true,schema}},messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify({untrustedText:text})}]})});
  if(!response.ok)throw new Error(response.status===429?'Bifrost rate limited':'Bifrost inference unavailable');
  const envelope=ChatEnvelope.parse(await readBounded(response));
  return parse(JSON.parse(envelope.choices[0].message.content));
  }catch{unavailableUntil=Date.now()+60000;throw new Error('Bifrost interpretation unavailable; rules-only fallback');}
 }
 return {description:`Bifrost → ${settings.model}`,
  interpret:text=>request(text,INTERPRETATION_PROMPT,'claim_interpretation',INTERPRETATION_JSON_SCHEMA,value=>Interpretation.parse(value)),
  extractClaims:text=>request(text,EXTRACTION_PROMPT,'claim_extraction',EXTRACTION_SCHEMA,value=>ExtractionOutput.parse(value)),
 };
}
