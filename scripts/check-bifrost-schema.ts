import {mkdir,writeFile} from 'node:fs/promises';
import {checkGatewaySchema} from './schema-check-lib';

// At most one inference attempt, synthetic text only; no Tavily requests.
const task=process.argv.includes('--comparison')?'comparison':'interpretation';
const report=await checkGatewaySchema(process.env,fetch,task);
await mkdir('.local/bifrost-benchmark',{recursive:true});
await writeFile('.local/bifrost-benchmark/schema-check-last.json',JSON.stringify(report,null,2));
if(report.passed){
 await writeFile(`.local/bifrost-benchmark/${task==='comparison'?'comparison-schema':'schema'}-${report.provider}.json`,JSON.stringify({...report,notice:'One observed synthetic gateway response passed validation, not a universal schema guarantee or proof of Bifrost challenge completion.'},null,2));
 console.log(`Gateway ${task} structured-response smoke check passed. One inference attempt, zero Tavily calls.`);
}else{
 console.error(`Gateway schema check failed at ${report.phase}: ${report.message}`);
 if(task==='interpretation')console.error('This command tests optional narrow claim interpretation. The main rules-extraction flow uses evidence comparison; npm run bifrost:schema:comparison checks that task with up to one additional model request.');
 console.error('Rules-only remains available; no retries, Tavily searches or alternative provider were used.');
 process.exitCode=1;
}
