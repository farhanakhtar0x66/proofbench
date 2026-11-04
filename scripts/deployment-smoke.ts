import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {access,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

// Exercise the compiled server, not app.inject. Never load the developer's .env.
await access('dist/api/server.js').catch(()=>{throw new Error('Build missing. Run npm run build first.');});
await access('dist/web/index.html');
const directory=await mkdtemp(join(tmpdir(),'proofbench-deployment-'));
const environment={...process.env,NODE_OPTIONS:'',HOST:'127.0.0.1',PORT:'0',DATA_DIR:directory,
 BIFROST_IMPLEMENTATION:'mock',TAVILY_MODE:'mock',ALLOW_PAID_REQUESTS:'false',TAVILY_MAX_REQUESTS:'0',
 LANGUAGE_MODE:'rules',CLAIM_EXTRACTION_MODE:'rules',EVIDENCE_COMPARISON_MODE:'rules',
 BIFROST_FREE_TIER_CONFIRMED:'false',BIFROST_LLM_MAX_REQUESTS:'0',
 TAVILY_API_KEY:'',GEMINI_API_KEY:'',GROQ_API_KEY:'',BIFROST_LLM_VIRTUAL_KEY:''};

async function start(){
 const child=spawn(process.execPath,['dist/api/server.js'],{env:environment,stdio:['ignore','pipe','pipe']});
 let output='',launchError:Error|undefined;
 child.on('error',error=>{launchError=error;});
 child.stdout.on('data',chunk=>{output=(output+String(chunk)).slice(-10000);});
 child.stderr.resume();
 const closed=new Promise<void>(resolve=>child.once('close',()=>resolve()));
 const stop=async()=>{
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([closed,new Promise<void>(resolve=>{timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},3000);})]);}
  finally{clearTimeout(timer);}
  await closed;
 };
 try{
  for(let attempt=0;attempt<200;attempt++){
   if(launchError||child.exitCode!==null)throw new Error('Compiled API could not start.');
   const match=output.match(/ProofBench API ready on (\{[^\n]+\})/);
   if(match){
    const address=JSON.parse(match[1]) as {address:string;port:number};
    assert.equal(address.address,'127.0.0.1');assert.ok(address.port>0);
    return {origin:`http://127.0.0.1:${address.port}`,stop};
   }
   await delay(50);
  }
  throw new Error('Compiled API startup exceeded 10 seconds.');
 }catch(error){await stop();throw error;}
}

let server:Awaited<ReturnType<typeof start>>|undefined;
try{
 server=await start();
 const request=(path:string,init?:RequestInit)=>fetch(`${server!.origin}${path}`,{...init,signal:AbortSignal.timeout(5000)});
 assert.equal((await request('/api/health')).status,200);
 const status=await (await request('/api/analysis/status')).json();
 assert.equal(status.mode,'mock');assert.equal(status.extractionMode,'rules');
 assert.equal(status.comparisonMode,'rules');assert.equal(status.modelReady,false);
 console.log('PASS compiled API starts on loopback with offline rules and model requests disabled');
 const response=await request('/api/analysis',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({version:'1',text:'An example claim on any topic.'})});
 assert.equal(response.status,201);
 const report=await response.json();
 assert.equal(report.results.length,1);assert.equal(report.results[0].retrieval.status,'offline');
 assert.equal(report.results[0].comparison.outcome,'inconclusive');
 assert.equal((await request('/')).status,404);
 console.log('PASS offline analysis; API does not serve the website (separate static hosting required)');
 await server.stop();server=undefined;
 server=await start();
 const saved=await request(`/api/analysis/${report.id}`);
 assert.equal(saved.status,200);assert.deepEqual(await saved.json(),report);
 console.log('PASS saved report survives API restart with the same data directory');
 console.log('Deployment smoke passed. No .env loaded, provider keys supplied, or external requests needed. Temporary servers and data are removed.');
}finally{
 await server?.stop();await rm(directory,{recursive:true,force:true});
}
