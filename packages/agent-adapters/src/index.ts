import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {RunRecord,RunRequest,ExecutionTrace,type AgentAdapter,UnsupportedCapability} from '../../contracts/src/index';
import {demoRun,task} from '../../contracts/src/examples';
import {bifrost01} from '../../../implementations/bifrost-01/src/index';
import {bifrost02} from '../../../implementations/bifrost-02/src/index';
export const mockAdapter:AgentAdapter={
 descriptor:demoRun.agent,capabilities:{execute:true,benchmarks:true,verify:true,native:false},
 async run(input){
  const request=RunRequest.parse(input);
  if(request.agentId!==this.descriptor.id) throw new Error('Unknown agent');
  if(JSON.stringify(request.task)!==JSON.stringify(task)) throw new UnsupportedCapability('Mock executes only the published sum fixture');
  const start=performance.now();const createdAt=new Date().toISOString();const id=randomUUID();
  const output=[1,2,3].reduce((a,b)=>a+b,0).toString();
  const passed=output==='6';
  const acceptance={version:'1',status:passed?'passed':'failed',method:'Offline exact-output comparison; not agent performance',checks:[{name:'Output exactly 6',passed,evidence:`Observed ${output}; expected 6`}]};
  const run=RunRecord.parse({...demoRun,id,createdAt,reportId:randomUUID(),output,acceptance,usage:{...demoRun.usage,duration:{status:'known',value:performance.now()-start,unit:'ms',source:'performance.now',scope:'offline arithmetic fixture, not agent latency'}},reproducibility:{...demoRun.reproducibility,seed:request.seed}});
  const trace=ExecutionTrace.parse({version:'1',runId:id,events:[{sequence:0,at:createdAt,type:'start',message:'Executed deterministic local arithmetic fixture; no model invoked.'},{sequence:1,at:createdAt,type:'output',message:output},{sequence:2,at:createdAt,type:'check',message:'Exact output comparison: 6'},{sequence:3,at:new Date().toISOString(),type:'finish',message:'Fixture complete'}]});
  return {run,trace};
 }
};
export function selectAdapter(mode:string):AgentAdapter {
 switch(mode){case 'mock':return mockAdapter;case '01':return bifrost01;case '02':return bifrost02;default:throw new Error('Invalid BIFROST_IMPLEMENTATION; use mock, 01 or 02');}
}
