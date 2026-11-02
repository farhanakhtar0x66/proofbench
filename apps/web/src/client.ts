import {z} from 'zod';
import {Capabilities,RunRecord,ExecutionTrace,EvidenceReport,VerificationReport,TaskSpec} from '../../../packages/contracts/src/index';
import {demoRun,demoTrace,demoReport,task} from '../../../packages/contracts/src/examples';
const localMock=import.meta.env.VITE_API_MODE==='mock';
export async function api<T>(path:string,schema:z.ZodType<T>,body?:unknown):Promise<T>{
 if(localMock){
  const fixtures:Record<string,unknown>={
   '/capabilities':{version:'1',implementation:'mock',agent:demoRun.agent,capabilities:{execute:true,benchmarks:true,verify:true,native:false},limitations:['Frontend-only offline fixtures']},
   '/benchmarks':{version:'1',tasks:[task]},'/runs':demoRun,'/runs/demo-run/trace':demoTrace,'/reports/demo-report':demoReport,
  };
  if(path==='/verify'){
   const text=(body as {text:string}).text;
   return schema.parse({version:'1',id:'web-demo-verification',mode:'mock',createdAt:new Date().toISOString(),text,claims:[{version:'1',id:'web-demo-claim',text,timeSensitive:'unknown',outcome:'inconclusive',freshness:'unknown',asOf:new Date().toISOString(),uncertainty:'Frontend-only mode: start the API to run server fixture verification.',evidence:[]}]});
  }
  if(!(path in fixtures))throw new Error('Fixture not available');return schema.parse(fixtures[path]);
 }
 const response=await fetch(`/api${path}`,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`Request failed (${response.status}). ${response.status===501?'Selected capability is not integrated.':'Check that the API is running, then retry.'}`);
 return schema.parse(await response.json());
}
export const schemas={Capabilities,RunRecord,ExecutionTrace,EvidenceReport,VerificationReport,benchmarks:z.object({version:z.literal('1'),tasks:z.array(TaskSpec)})};
export const modeLabel=localMock?'Frontend fixtures':'Connected API';
