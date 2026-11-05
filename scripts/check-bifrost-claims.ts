import {mkdir,writeFile} from 'node:fs/promises';
import {bifrostSettings,createBifrostInterpreter} from '../packages/tavily/src/bifrost-interpreter';
import {checkBifrostStack} from '../packages/tavily/src/bifrost-status';
import {canonicalInterpretation} from '../packages/tavily/src/interpretation';
import {extractFactualClaims} from '../packages/tavily/src/claim-extraction';

// Two synthetic inference attempts at most, one shared adapter, no retrieval.
const settings=bifrostSettings();
const checks:{name:string;passed:boolean}[]=[];
let gatewayRequests=0;
try{
 await checkBifrostStack();
 const fetcher:typeof fetch=async(url,init)=>{gatewayRequests++;return fetch(url,init);};
 const adapter=createBifrostInterpreter({...process.env,BIFROST_LLM_MAX_REQUESTS:String(Math.min(settings.maxRequests,2))},fetcher);
 const price='Subscribers pay twenty USD monthly for Acme Pro.';
 const interpretation=await adapter.interpret(price);
 const oldPassed=canonicalInterpretation(price,interpretation)==='Acme Pro costs USD 20 per month.';
 checks.push({name:'existing_price_interpretation',passed:oldPassed});
 if(!oldPassed)throw new Error('Price check failed');
 const expected=['Ronaldo is not the captain of Real Madrid in 2026.','The Acme policy applies in India only after approval in 2027.'];
 const text=expected.join('\n');
 const extraction=await extractFactualClaims(text,{mode:'llm',interpreter:adapter});
 const newPassed=extraction.method==='llm'&&extraction.claims.length===expected.length&&extraction.claims.every((claim,i)=>claim.text===expected[i]&&text.slice(claim.start,claim.end)===claim.text);
 checks.push({name:'general_extraction_with_qualifiers',passed:newPassed});
 if(!newPassed)throw new Error('Extraction check failed');
 console.log('PASS existing price interpretation');
 console.log('PASS general extraction: exact sentences, negation, dates, region and condition preserved');
}catch{
 console.error('Combined schema check blocked or failed. No inference retry or alternative provider was used.');
 process.exitCode=1;
}finally{
 await mkdir('.local/bifrost-benchmark',{recursive:true});
 await writeFile(`.local/bifrost-benchmark/claims-check-${settings.provider}.json`,JSON.stringify({model:settings.model,createdAt:new Date().toISOString(),passed:checks.length===2&&checks.every(check=>check.passed),checks,gatewayRequests,realTavilyCalls:0,notice:'Synthetic schema smoke checks only. Assertions were extracted, not fact-checked. This does not prove general extraction quality, universal schema preservation or Bifrost challenge completion.'},null,2));
 console.log(`${gatewayRequests} gateway request attempts; zero Tavily requests. Report saved locally.`);
}
