import {createApp} from '../apps/api/src/app';
import {AnalysisReport} from '../packages/contracts/src/index';
import {readBoundedSearchJson} from '../packages/tavily/src/response-json';

type Case={id:string;claim:string;expected:'supported'|'contradicted'|'inconclusive'};
type Result={id:string;expected:Case['expected'];status:'not_run'|'completed';actual:Case['expected']|null;elapsedMs:number|null;report:ReturnType<typeof AnalysisReport.parse>|null};
export type TopicBatchReport={
 status:'running'|'completed'|'stopped';stopReason:string|null;
 attempts:{tavily:number;model:number};limits:{tavily:number;model:number};results:Result[];
 summary:{completed:number;exactMatches:number;wrongDecisive:number;inconclusiveKnownFacts:number;notRun:number};
};

// Standalone evaluation only. Replaces process fetch temporarily; never invoke in a serving app.
export async function runLiveTopicBatch(options:{cases:Case[];dataDir:string;endpoint:string;limits:{tavily:number;model:number};fetcher?:typeof fetch;checkpoint?:(report:TopicBatchReport)=>Promise<void>;captureSearch?:(payload:unknown,attempt:number)=>Promise<void>}){
 const {cases,limits}=options;
 if(!cases.length||cases.length>10||new Set(cases.map(item=>item.id)).size!==cases.length)throw new Error('One to ten unique cases required');
 if(!Object.values(limits).every(value=>Number.isInteger(value)&&value>=0&&value<=9))throw new Error('Live limits must be integers between zero and nine');
 const original=globalThis.fetch;const upstream=options.fetcher??original;
 const report:TopicBatchReport={status:'running',stopReason:null,attempts:{tavily:0,model:0},limits:{...limits},results:cases.map(item=>({id:item.id,expected:item.expected,status:'not_run',actual:null,elapsedMs:null,report:null})),summary:{completed:0,exactMatches:0,wrongDecisive:0,inconclusiveKnownFacts:0,notRun:cases.length}};
 let failed=false;let app:Awaited<ReturnType<typeof createApp>>|undefined;
 const save=async()=>{
  const completed=report.results.filter(item=>item.status==='completed');
  report.summary={completed:completed.length,exactMatches:completed.filter(item=>item.actual===item.expected).length,wrongDecisive:completed.filter(item=>item.actual!==null&&item.actual!=='inconclusive'&&item.actual!==item.expected).length,inconclusiveKnownFacts:completed.filter(item=>item.actual==='inconclusive'&&item.expected!=='inconclusive').length,notRun:cases.length-completed.length};
  await options.checkpoint?.(structuredClone(report));
 };
 const stop=(reason:string)=>{failed=true;report.stopReason??=reason;};
 try{
  await save();
  globalThis.fetch=async(input,init)=>{
   const url=String(input);if(url===new URL('/health',options.endpoint).href)return upstream(input,{...init,redirect:'error'});
   const kind=url==='https://api.tavily.com/search'?'tavily':url===new URL('/v1/chat/completions',options.endpoint).href?'model':null;
   if(!kind){stop('Unexpected network destination blocked');throw new Error('Unexpected network destination blocked');}
   if(failed||report.attempts[kind]>=limits[kind]){stop('Attempt ceiling reached; no retry');throw new Error('Attempt ceiling reached');}
   report.attempts[kind]++;await save();
   try{
    const response=await upstream(input,{...init,redirect:'error'});
    if(!response.ok)stop(`${kind} HTTP failure (${response.status}); no retry`);
    if(kind==='tavily'&&response.ok&&options.captureSearch)await options.captureSearch(await readBoundedSearchJson(response.clone()),report.attempts.tavily);
    return response;
   }catch{stop(`${kind} transport failure; no retry`);throw new Error('Provider transport failed');}
  };
  app=await createApp({implementation:'mock',tavilyMode:'live',dataDir:options.dataDir});
  for(const [index,item] of cases.entries()){
   const start=performance.now();const before=report.attempts.model;
   // Evaluation labels, rationales, reference URLs and synthetic sources are never API inputs.
   const response=await app.inject({method:'POST',url:'/api/analysis',payload:{version:'1',text:item.claim,scope:'current'}});
   if(response.statusCode!==201){stop('Analysis API failed');break;}
   const analysis=AnalysisReport.parse(response.json());
   const compared=analysis.results[0]?.comparison;
   if(analysis.results.length!==1||analysis.results[0].claim.text!==item.claim||!compared){stop('Expected one source-preserving claim');break;}
   report.results[index]={id:item.id,expected:item.expected,status:'completed',actual:compared.outcome,elapsedMs:performance.now()-start,report:analysis};
   if(report.attempts.model>before&&compared.method!=='llm')stop('Inference did not return a validated comparison; no retry');
   await save();if(failed)break;
  }
  report.status=failed?'stopped':'completed';
 }catch{report.status='stopped';report.stopReason??='Evaluation stopped at an internal or persistence failure';}
 finally{globalThis.fetch=original;try{await app?.close();}finally{await save();}}
 return report;
}
