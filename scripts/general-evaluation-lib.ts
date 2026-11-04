import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app';
import {AnalysisReport} from '../packages/contracts/src/index';

type Verdict='supported'|'contradicted'|'inconclusive';
type Source={text:string;published?:string;url?:string};
export type Scenario={id:string;text:string;sources:Source[];relations?:string[];modelStatus?:number;correction?:string;expected:Verdict[];searches:number;models:number;omitted?:number;note:string;scope?:'current'|'as_stated'};
const pair=(text:string,published?:string):Source[]=>[0,1].map(index=>({text:`${text} Source notice ${index}.`,published}));
export const generalScenarios:Scenario[]=[
 {id:'price-supported',text:'Acme Pro costs USD 20/month.',sources:pair('Acme Pro costs USD 20/month.'),relations:['supports','supports'],expected:['supported'],searches:1,models:1,note:'Agreeing same-scope assessments.'},
 {id:'price-contradicted-correction',text:'Acme Pro costs USD 20/month.',sources:pair('Acme Pro costs USD 25/month.'),relations:['contradicts','contradicts'],correction:'Acme Pro costs USD 25/month.',expected:['contradicted'],searches:1,models:1,note:'Exact corroborated correction.'},
 {id:'leadership-changed',text:'Maya is CEO of Cedar Labs.',sources:pair('Arjun is CEO of Cedar Labs.'),relations:['contradicts','contradicts'],expected:['contradicted'],searches:1,models:1,note:'Alternative holder with matching organization/role.'},
 {id:'leadership-wrong-role',text:'Maya is CEO of Cedar Labs.',sources:pair('Maya is captain of Other FC.'),expected:['inconclusive'],searches:1,models:0,note:'Unrelated role/entity blocks comparison.'},
 {id:'version-scope-insufficient',text:'Orbit API version 3 is supported.',sources:pair('Orbit API version 4 is supported.'),expected:['inconclusive'],searches:1,models:0,note:'A different version cannot corroborate support.'},
 {id:'historical-completed',text:'Acme SDK 2 reached end of life on 2020-01-01.',sources:pair('The upstream project confirms Acme SDK 2 reached end of life on 2020-01-01.','2020-02-01'),relations:['supports','supports'],expected:['supported'],searches:1,models:1,note:'Dated completed event; freshness remains unknown.'},
 {id:'historical-plan',text:'Acme SDK 2 reached end of life on 2020-01-01.',sources:pair('The upstream project says Acme SDK 2 is scheduled to reach end of life on 2020-01-01.','2019-01-01'),expected:['inconclusive'],searches:1,models:0,note:'An old schedule is not completion proof.'},
 {id:'conflicting-sources',text:'Acme Pro costs USD 20/month.',sources:pair('Acme Pro pricing in USD is described in this notice.'),relations:['supports','contradicts'],expected:['inconclusive'],searches:1,models:1,note:'Conflicting scripted assessments must abstain.'},
 {id:'no-evidence',text:'Acme Pro costs USD 20/month.',sources:[],expected:['inconclusive'],searches:1,models:0,note:'Empty search cannot justify a verdict.'},
 {id:'duplicate-sources',text:'Acme Pro costs USD 20/month.',sources:[{text:'Acme Pro costs USD 20/month.',url:'https://same.example/pricing'},{text:'Acme Pro costs USD 20/month.',url:'https://same.example/pricing?utm_source=copy'}],expected:['inconclusive'],searches:1,models:0,note:'Canonical duplicate cannot supply two groups.'},
 {id:'model-rate-limit',text:'Acme Pro costs USD 20/month.',sources:pair('Acme Pro costs USD 20/month.'),modelStatus:429,expected:['inconclusive'],searches:1,models:1,note:'Failure retains sources, no retry or correction.'},
 {id:'general-topic',text:'Example City is the capital of Exampleland.',sources:pair('Example City is the capital of Exampleland.'),relations:['supports','supports'],expected:['supported'],searches:1,models:1,note:'General factual topic through the same orchestration.'},
 {id:'claim-cap',text:'Acme Pro costs USD 20/month. Beta costs USD 30/month. Gamma costs USD 40/month. Delta costs USD 50/month.',sources:pair('The pricing notice provides billing details in USD.'),relations:['insufficient','insufficient'],expected:['inconclusive','inconclusive','inconclusive'],searches:3,models:3,omitted:1,note:'Three processed claims; fourth omission is disclosed.'},
 {id:'question-only',text:'Is Maya CEO of Cedar Labs?',sources:[],expected:[],searches:0,models:0,note:'Question-only input makes no search/model request.'},
];

// CLI/test utility only: never run concurrently with a production server in this process.
export async function evaluateGeneralScenarios(scenarios:Scenario[]=generalScenarios){
 const env={LANGUAGE_MODE:'bifrost',CLAIM_EXTRACTION_MODE:'rules',EVIDENCE_COMPARISON_MODE:'llm',BIFROST_LLM_PROVIDER:'gemini',BIFROST_LLM_MODEL:'gemini/offline-simulation',BIFROST_LLM_ENDPOINT:'http://127.0.0.1:8080',BIFROST_LLM_TIMEOUT_MS:'1000',BIFROST_LLM_VIRTUAL_KEY:'',BIFROST_FREE_TIER_CONFIRMED:'true',BIFROST_LLM_MAX_REQUESTS:'4',ALLOW_PAID_REQUESTS:'true',TAVILY_API_KEY:'synthetic-key',GEMINI_API_KEY:'synthetic-key',TAVILY_MAX_REQUESTS:'3'};
 const saved=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));const upstream=globalThis.fetch;
 const results=[];
 try{
  Object.assign(process.env,env);
  for(const scenario of scenarios){
   let searches=0;let models=0;let blocked=0;
   globalThis.fetch=async(url,init)=>{
    if(String(url)==='https://api.tavily.com/search'){
     searches++;const body=JSON.parse(String(init?.body));
     if(body.search_depth!=='basic'||body.auto_parameters!==false||body.include_answer!==false||body.include_raw_content!==false)throw new Error('Unexpected search parameters');
     return Response.json({results:scenario.sources.map((source,index)=>({url:source.url??`https://source${index}.example/notice`,title:'SIMULATED source',content:source.text,published_date:source.published??new Date(Date.now()-86400000).toISOString()}))});
    }
    if(String(url)==='http://127.0.0.1:8080/v1/chat/completions'){
     models++;
     if(scenario.modelStatus)return Response.json({error:'Simulated provider failure'},{status:scenario.modelStatus});
     const body=JSON.parse(String(init?.body));const context=JSON.parse(JSON.parse(body.messages[1].content).untrustedText);
     const assessments=context.sources.map((source:{sourceId:string;excerpt:string},index:number)=>({sourceId:source.sourceId,relation:scenario.relations?.[index]??'insufficient',quote:source.excerpt}));
     const output=body.response_format.json_schema.name==='evidence_comparison_references'?{assessments:assessments.map(({sourceId,relation}:{sourceId:string;relation:string})=>({sourceId,relation})),correctionId:scenario.correction?context.correctionCandidates.find((candidate:{text:string})=>candidate.text===scenario.correction)?.candidateId:'none'}:{assessments,correction:scenario.correction?{text:scenario.correction,sourceIds:['S1','S2']}:null};
     return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}]});
    }
    blocked++;throw new Error('Network destination blocked by offline evaluation');
   };
   const directory=await mkdtemp(join(tmpdir(),'b05-evaluation-'));let app:Awaited<ReturnType<typeof createApp>>|undefined;
   try{
    app=await createApp({implementation:'mock',tavilyMode:'live',dataDir:directory});
    const response=await app.inject({method:'POST',url:'/api/analysis',payload:{version:'1',text:scenario.text,...(scenario.scope?{scope:scenario.scope}:{})}});
    if(response.statusCode!==201)throw new Error('Unexpected analysis response');
    const report=AnalysisReport.parse(response.json());const actual=report.results.map(item=>item.comparison.outcome);
    const passed=JSON.stringify(actual)===JSON.stringify(scenario.expected)&&searches===scenario.searches&&models===scenario.models&&blocked===0&&report.omittedClaims===(scenario.omitted??0)&&report.results.every(item=>scenario.correction?item.comparison.correction?.text===scenario.correction:item.comparison.correction===null)&&(scenario.id!=='historical-completed'||report.results[0].comparison.freshness==='unknown');
    results.push({id:scenario.id,note:scenario.note,expected:scenario.expected,actual,passed,simulatedSearches:searches,simulatedModelCalls:models,blockedUnexpectedDestinations:blocked,status:report.status,omittedClaims:report.omittedClaims,report});
   }finally{await app?.close();await rm(directory,{recursive:true,force:true});}
  }
 }finally{
  globalThis.fetch=upstream;
  for(const [key,value] of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
 return {simulated:true,createdAt:new Date().toISOString(),externalRequests:0,notice:'Synthetic pipeline regression with scripted model relations, not model understanding, live search quality or factual accuracy. No provider was contacted. Source URLs and dates are simulated.',summary:{total:results.length,passed:results.filter(result=>result.passed).length,inconclusiveClaims:results.flatMap(result=>result.actual).filter(outcome=>outcome==='inconclusive').length},results};
}
