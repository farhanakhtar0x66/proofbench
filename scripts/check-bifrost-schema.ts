import {mkdir,writeFile} from 'node:fs/promises';
import {bifrostSettings,createBifrostInterpreter} from '../packages/tavily/src/bifrost-interpreter';
import {checkBifrostStack} from '../packages/tavily/src/bifrost-status';
import {canonicalInterpretation} from '../packages/tavily/src/interpretation';

// Exactly one inference attempt, synthetic text only; no Tavily requests.
try{
 const settings=bifrostSettings();await checkBifrostStack();
 const text='Subscribers pay twenty USD monthly for Acme Pro.';
 const result=await createBifrostInterpreter().interpret(text);
 if(canonicalInterpretation(text,result)!=='Acme Pro costs USD 20 per month.')throw new Error('Interpretation failed exact-span/meaning checks');
 await mkdir('.local/bifrost-benchmark',{recursive:true});
 await writeFile(`.local/bifrost-benchmark/schema-${settings.provider}.json`,JSON.stringify({model:settings.model,passed:true,createdAt:new Date().toISOString(),notice:'One real gateway response passed strict Zod and source-span validation. This is not a universal schema guarantee or proof of Bifrost challenge completion.'},null,2));
 console.log('Gateway structured-response smoke check passed. One inference attempt, zero Tavily calls.');
}catch{console.error('Gateway schema check blocked or failed. Rules-only remains available; no retries or alternative provider were used.');process.exitCode=1;}
