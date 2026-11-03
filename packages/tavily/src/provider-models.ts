import {z} from 'zod';

// Account setup metadata only. All interpretation/inference stays behind Bifrost.
export async function listAccountModels(env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch){
 const provider=z.enum(['gemini','groq']).parse(env.BIFROST_LLM_PROVIDER??'gemini');
 const key=env[provider==='gemini'?'GEMINI_API_KEY':'GROQ_API_KEY']?.trim();
 if(!key)throw new Error('Selected provider API key is missing. Add it only to ignored .env.');
 const models:string[]=[];let pageToken:string|undefined;
 for(let page=0;page<10;page++){
  const url=new URL(provider==='gemini'?'https://generativelanguage.googleapis.com/v1beta/models':'https://api.groq.com/openai/v1/models');
  if(pageToken)url.searchParams.set('pageToken',pageToken);
  const headers:Record<string,string>=provider==='gemini'?{'x-goog-api-key':key}:{Authorization:`Bearer ${key}`};
  let response:Response;
  try{response=await fetcher(url,{headers,redirect:'error',signal:AbortSignal.timeout(8000)});}catch{throw new Error('Model catalog unavailable; no inference attempted.');}
  if(!response.ok)throw new Error(response.status===429?'Model catalog rate limited; no retry.':'Model catalog unavailable or key rejected; no inference attempted.');
  if(provider==='groq'){
   const data=z.object({data:z.array(z.object({id:z.string(),active:z.boolean().optional()}))}).parse(await response.json());
   models.push(...data.data.filter(item=>item.active!==false).map(item=>`groq/${item.id}`));break;
  }
  const data=z.object({models:z.array(z.object({name:z.string(),supportedGenerationMethods:z.array(z.string()).optional()})),nextPageToken:z.string().optional()}).parse(await response.json());
  models.push(...data.models.filter(item=>item.supportedGenerationMethods?.includes('generateContent')).map(item=>`gemini/${item.name.replace(/^models\//u,'')}`));
  pageToken=data.nextPageToken;if(!pageToken)break;
  if(page===9)throw new Error('Model catalog pagination exceeded limit');
 }
 return {provider,models:[...new Set(models)],notice:'Catalog visibility does not prove free-tier quota, pricing, or structured-output support. Confirm billing is disabled and check current provider pricing, then run the gateway schema check.'};
}
