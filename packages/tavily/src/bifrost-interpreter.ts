import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Interpretation,INTERPRETATION_PROMPT,type LanguageInterpreter} from './interpretation';
import {ExtractionOutput,EXTRACTION_PROMPT,EXTRACTION_SCHEMA} from './claim-extraction';
import {ComparisonOutput,COMPARISON_PROMPT,comparisonSchemaFor,EVIDENCE_POLICY_PROMPT} from './evidence-comparison';
import {referenceComparisonFor,REFERENCE_COMPARISON_PROMPT} from './comparison-references';

export const BifrostSettings=z.object({endpoint:z.string().default('http://127.0.0.1:8080'),provider:z.enum(['gemini','groq','ollama']),model:z.string().regex(/^(?:(?:gemini|groq|ollama)\/[a-zA-Z0-9_.:-]+(?:\/[a-zA-Z0-9_.:-]+)?)?$/u).refine(value=>!value.split('/').some(part=>part==='.'||part==='..'),'Invalid model namespace').refine(value=>!value.toLowerCase().includes('cloud'),'Cloud aliases are disabled'),timeoutMs:z.coerce.number().int().min(100).max(30000).default(20000),virtualKey:z.string().optional(),maxRequests:z.coerce.number().int().min(0).max(100).default(0)});
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
const ChatEnvelope=z.object({error:z.null().optional(),choices:z.array(z.object({finish_reason:z.literal('stop'),message:z.object({role:z.literal('assistant'),content:z.string().min(1).max(16000),tool_calls:z.array(z.unknown()).length(0).nullish(),function_call:z.null().optional(),refusal:z.null().optional()})})).length(1)});

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
 const blocked=hostedReadiness(env,settings);let requests=0;let unavailableUntil=0;let lastFailure='The previous model request failed.';
 const unavailableReason=()=>blocked??(Date.now()<unavailableUntil?`${lastFailure} Model comparison is temporarily unavailable during the 60-second safety cooldown; no automatic retry was made.`:settings.provider!=='ollama'&&requests>=settings.maxRequests?'The hosted model request budget is exhausted. No additional model request was made.':undefined);
 async function request(text:string,prompt:string,name:string,schema:unknown,parse:(value:unknown)=>unknown,maxTokens=1024){
  if(blocked)throw new Error(blocked);
  if(settings.provider!=='ollama'&&(requests>=settings.maxRequests||Date.now()<unavailableUntil))throw new Error('Hosted request cap or cooldown reached; rules-only fallback');
  requests++;
  const headers:Record<string,string>={'Content-Type':'application/json','x-bf-eh-correlation-id':randomUUID()};
  if(settings.virtualKey)headers['x-bf-vk']=settings.virtualKey;
  // Gemini's newer models reject sampling overrides; use provider defaults.
  const sampling=settings.provider==='gemini'?{}:{temperature:0};
  let failure='Cannot connect to Bifrost. Start the local gateway with npm run bifrost:start and keep it running.';
  try{
  const response=await fetcher(new URL('/v1/chat/completions',settings.endpoint),{method:'POST',redirect:'error',signal:AbortSignal.timeout(settings.timeoutMs),headers,body:JSON.stringify({model:settings.model,stream:false,n:1,...sampling,max_tokens:maxTokens,response_format:settings.provider==='ollama'?{type:'json_object'}:{type:'json_schema',json_schema:{name,strict:true,schema}},messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify({untrustedText:text})}]})});
  if(!response.ok){
   let status=response.status;
   // Some gateways wrap an upstream 503 in a generic 500/502 envelope.
   // Read only a bounded numeric status; never expose provider messages or key metadata.
   if(status===500||status===502){
    const body=await readBounded(response).catch(()=>null);
    const upstream=z.object({status_code:z.number().optional(),error:z.object({code:z.number().optional()}).passthrough().optional()}).passthrough().safeParse(body);
    if(upstream.success&&(upstream.data.status_code===503||upstream.data.error?.code===503))status=503;
   }
   failure=status===400?'The model gateway rejected the request parameters (HTTP 400). Compatibility requires review.':status===401||status===403?'The model provider rejected authentication or access. Check the selected provider key and model permissions.':status===429?'The model gateway reported a rate limit.':status===504?'The model request timed out at the gateway.':status===503?'The model provider is temporarily unavailable or busy (HTTP 503). No verdict was reached.':'The model gateway reported an upstream failure.';
   throw new Error('Gateway failure');
  }
  failure='The model returned an invalid or incomplete structured response. No factual verdict was accepted.';
  failure='The model gateway returned an invalid chat response envelope. No assessment was accepted.';
  const envelope=ChatEnvelope.parse(await readBounded(response));
  failure='The model returned invalid JSON. No assessment was accepted.';
  const output=JSON.parse(envelope.choices[0].message.content);
  failure='The model output failed structured schema validation. No assessment was accepted.';
  return parse(output);
  }catch(error){lastFailure=error instanceof Error&&error.name==='TimeoutError'?'The model request timed out at the client.':failure;unavailableUntil=Date.now()+60000;throw new Error('Bifrost interpretation unavailable; rules-only fallback');}
 }
 return {description:`Bifrost → ${settings.model}`,
  timeoutMs:settings.timeoutMs,
  checkReady:async()=>{
   if(unavailableReason())return false;
   try{
    const response=await fetcher(new URL('/health',settings.endpoint),{redirect:'error',signal:AbortSignal.timeout(2000)});
    await response.body?.cancel();
    if(!response.ok)throw new Error('Gateway unhealthy');
    return true;
   }catch{
    lastFailure='Cannot connect to Bifrost. Start the local gateway with npm run bifrost:start and keep it running.';
    unavailableUntil=Date.now()+60000;
    return false;
   }
  },
  canRequest:()=>!blocked&&(settings.provider==='ollama'||requests<settings.maxRequests&&Date.now()>=unavailableUntil),
  unavailableReason,
  interpret:text=>request(text,INTERPRETATION_PROMPT,'claim_interpretation',INTERPRETATION_JSON_SCHEMA,value=>Interpretation.parse(value)),
  extractClaims:text=>request(text,EXTRACTION_PROMPT,'claim_extraction',EXTRACTION_SCHEMA,value=>ExtractionOutput.parse(value)),
  compareEvidence:text=>{
   const policy=JSON.parse(text).evidencePolicy?EVIDENCE_POLICY_PROMPT:'';
   if(settings.provider==='gemini'||settings.provider==='groq'){
    const references=referenceComparisonFor(text);
    if(references.useCompact)return request(references.text,REFERENCE_COMPARISON_PROMPT+policy,'evidence_comparison_references',references.schema,value=>ComparisonOutput.parse(references.parse(value)),2048);
   }
   return request(text,COMPARISON_PROMPT+policy,'evidence_comparison',comparisonSchemaFor(text),value=>ComparisonOutput.parse(value),2048);
  },
 };
}
