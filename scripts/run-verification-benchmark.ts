import {readFile,writeFile} from 'node:fs/promises';
import {loadPreparedBenchmark,runPreparedComparisons,summarizeBenchmarkRows} from './run-verification-benchmark-lib';
import {bifrostSettings,hostedReadiness,createBifrostInterpreter} from '../packages/tavily/src/bifrost-interpreter';
import {prepareBenchmarkContinuation} from './resume-verification-benchmark';
import {checkBifrostStack} from '../packages/tavily/src/bifrost-status';

const {snapshot,directory,maxRequests:initialMax}=await loadPreparedBenchmark();
const continuation=process.argv.includes('--resume')?await prepareBenchmarkContinuation(snapshot,await readFile(`${directory}/model-result.json`,'utf8')):undefined;
const maxRequests=continuation?.maxRequests??initialMax;
const activeSnapshot=continuation?.remainingSnapshot??snapshot;
if(!process.argv.includes('--live')){
 console.log(`Ready: ${activeSnapshot.cases.length} selected cases, up to ${maxRequests} model comparisons, zero Tavily searches. Model runner not started.`);
 console.log('Live mode requires an explicitly approved allowance, RUN_VERIFICATION_BENCHMARK=true, matching model cap and mock/zero-search settings.');
}else{
 if(process.env.RUN_VERIFICATION_BENCHMARK!=='true'||process.env.TAVILY_MODE!=='mock'||process.env.ALLOW_PAID_REQUESTS!=='false'||process.env.TAVILY_MAX_REQUESTS!=='0'||process.env.BIFROST_LLM_MAX_REQUESTS!==String(maxRequests))throw new Error('Live benchmark requires explicit confirmation, exactly the planned model cap and zero-search settings.');
 const settings=bifrostSettings();if(settings.provider==='ollama'||hostedReadiness(process.env,settings))throw new Error('A configured, explicitly confirmed free-tier hosted provider is required.');
 if(continuation&&continuation.previous.model!==settings.model)throw new Error('Continuation must use the original model.');
 await checkBifrostStack();
 const path=`${directory}/${continuation?'model-continuation.json':'model-result.json'}`;let attempts=0;let progress:unknown[]=[];
 await writeFile(path,JSON.stringify({status:'reserved',modelRequests:0}),{flag:'wx'});
 const save=async(value:unknown)=>writeFile(path,JSON.stringify({createdAt:new Date().toISOString(),model:settings.model,datasetHash:snapshot.datasetHash,evidenceHash:snapshot.evidenceHash,realTavilyRequests:0,modelRequests:attempts,priorModelRequests:continuation?.previous.modelRequests??0,totalModelRequests:attempts+(continuation?.previous.modelRequests??0),stagedRun:!!continuation,parentReportHash:continuation?.parentHash,priorFailedModelAttempts:continuation?1:0,result:value,notice:'No retries. Startup catalog metadata calls are separate from inference counts. Source evidence is fictional and fixed.'},null,2));
 try{
  const guarded:typeof fetch=async(url,init)=>{
   if(String(url)!==new URL('/v1/chat/completions',settings.endpoint).href||attempts>=maxRequests)throw new Error('Extra inference or unexpected destination blocked');
   attempts++;await save({status:'running',rows:progress});return fetch(url,{...init,redirect:'error'});
  };
  const currentResult=await runPreparedComparisons(activeSnapshot,createBifrostInterpreter(process.env,guarded),()=>attempts,rows=>{progress=[...rows];return save({status:'running',rows:progress});});
  const combined=continuation?summarizeBenchmarkRows(continuation.merge(currentResult.rows),attempts+continuation.previous.modelRequests):currentResult;
  const result={...combined,summary:{...combined.summary,priorFailedModelAttempts:continuation?1:0,totalInferenceFailures:currentResult.summary.modelFailures+(continuation?1:0)}};
  const baseline={totalCases:snapshot.cases.length,matchedExpected:snapshot.cases.filter(item=>item.rules.outcome===item.expected).length,falseDecisive:snapshot.cases.filter(item=>item.rules.outcome!=='inconclusive'&&item.rules.outcome!==item.expected).length,inconclusive:snapshot.cases.filter(item=>item.rules.outcome==='inconclusive').length};
  await save({...result,baseline});console.table(result.rows.map(row=>({id:row.id,expected:row.expected,rules:snapshot.cases.find(item=>item.id===row.id)?.rules.outcome,model:row.outcome,status:row.status,modelRequests:row.modelRequests}))); console.log(JSON.stringify(result.summary,null,2));console.log(`Report: ${path}`);
  if(result.status!=='completed')process.exitCode=1;
 }catch{await save({status:'failed',rows:progress,explanation:'Benchmark stopped unexpectedly; no automatic retry.'});console.error('Benchmark stopped; review the saved report before any new allowance.');process.exitCode=1;}
}
