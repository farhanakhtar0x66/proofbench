import {z} from 'zod';
import {Capabilities,RunRecord,ExecutionTrace,EvidenceReport,VerificationReport,TaskSpec,RunListResponse,JobRecord,JobSubmissionResponse} from '../../../packages/contracts/src/index';
import {demoRun,demoTrace,demoReport,task} from '../../../packages/contracts/src/examples';
const localMock=import.meta.env.VITE_API_MODE==='mock';
export async function api<T>(path:string,schema:z.ZodType<T>,body?:unknown):Promise<T>{
 if(localMock){
  const fixtures:Record<string,unknown>={
   '/capabilities':{version:'1',implementation:'mock',agent:demoRun.agent,capabilities:{execute:true,benchmarks:true,verify:true,native:false},limitations:['Frontend-only offline fixtures']},
   '/benchmarks':{version:'1',tasks:[task]},
   '/runs':{version:'1',runs:[demoRun]},
   '/runs/demo-run':demoRun,
   '/runs/demo-run/trace':demoTrace,
   '/reports/demo-report':demoReport,
   '/benchmarks/controlled':{
    version:'1',
    taskId:'task-2-missing-feature',
    taskTitle:'Implement exponential backoff retry calculation',
    evaluationMode:'controlled_routing_fair_comparison',
    summary:{
     controlled_direct_small:{policy:'controlled_direct_small',policyLabel:'Direct Small (Qwen 1.5B)',totalTrials:1,passedTrials:0,failedTrials:1,successRatePercent:0,avgTotalTokens:2500,avgWallDurationMs:7824,avgControllerCpuMs:41},
     controlled_direct_frontier:{policy:'controlled_direct_frontier',policyLabel:'Direct Frontier (Qwen 9B)',totalTrials:1,passedTrials:1,failedTrials:0,successRatePercent:100,avgTotalTokens:7766,avgWallDurationMs:168349,avgControllerCpuMs:334},
     controlled_escalation_only:{policy:'controlled_escalation_only',policyLabel:'Escalation Only (Small ➔ Frontier)',totalTrials:1,passedTrials:1,failedTrials:0,successRatePercent:100,avgTotalTokens:4461,avgWallDurationMs:63501,avgControllerCpuMs:118},
     controlled_bidirectional_adaptive:{policy:'controlled_bidirectional_adaptive',policyLabel:'Bidirectional Adaptive Policy',totalTrials:1,passedTrials:1,failedTrials:0,successRatePercent:100,avgTotalTokens:6215,avgWallDurationMs:75249,avgControllerCpuMs:136}
    },
    attribution:{modelSelectionTokensSaved:3305,bidirectionalHandoffTokensSaved:null,cpuOverheadMs:136,note:'Single-trial empirical observation. Downward delegation did not occur in this run.'}
   }
  };
  if(path==='/verify'){
   const text=(body as {text:string}).text;
   return schema.parse({version:'1',id:'web-demo-verification',mode:'mock',createdAt:new Date().toISOString(),text,claims:[{version:'1',id:'web-demo-claim',text,timeSensitive:'unknown',outcome:'inconclusive',freshness:'unknown',asOf:new Date().toISOString(),uncertainty:'Frontend-only mode: start the API to run server fixture verification.',evidence:[]}]});
  }
  if(path==='/jobs'){
   return schema.parse({version:'1',jobId:'demo-job-1',status:'completed',runId:'demo-run'});
  }
  if(path.startsWith('/jobs/')){
   return schema.parse({version:'1',id:'demo-job-1',status:'completed',task,agentId:demoRun.agent.id,runId:'demo-run',progress:'Completed demo execution',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
  }
  if(!(path in fixtures))throw new Error(`Fixture not available for path ${path}`);
  return schema.parse(fixtures[path]);
 }
 const response=await fetch(`/api${path}`,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 if(!response.ok){
  let serverMessage='';
  try{
   const errorJson=await response.json();
   if(errorJson.message)serverMessage=errorJson.message;
   else if(errorJson.error)serverMessage=`Error: ${errorJson.error}`;
  }catch{/* ignore non-json */}
  if(serverMessage)throw new Error(serverMessage);
  throw new Error(`Request failed (${response.status}). ${response.status===501?'Selected capability is not integrated.':response.status===503?'Inference gateway is offline. Start the Bifrost HTTP daemon on :8089.':'Check that the API is running, then retry.'}`);
 }
 return schema.parse(await response.json());
}
export const schemas={Capabilities,RunRecord,RunListResponse,JobRecord,JobSubmissionResponse,ExecutionTrace,EvidenceReport,VerificationReport,benchmarks:z.object({version:z.literal('1'),tasks:z.array(TaskSpec)})};
export const modeLabel=localMock?'Frontend fixtures':'Connected API';
