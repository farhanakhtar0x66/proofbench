import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {verifyAnswer,SearchBudget} from '../packages/tavily/src/index';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';

const Dataset=z.object({version:z.literal('1'),notice:z.string(),cases:z.array(z.object({id:z.string(),claim:z.string().min(1),evidence:z.array(z.string().min(1)).max(3),publishedAt:z.string().datetime().optional(),expected:z.enum(['supported','contradicted','inconclusive']),rationale:z.string().min(1)}).strict()).min(1)}).strict();
export async function prepareVerificationBenchmark(){
 const raw=await readFile(new URL('../fixtures/verification-benchmark/v1.json',import.meta.url),'utf8');
 const dataset=Dataset.parse(JSON.parse(raw));const datasetHash=createHash('sha256').update(raw).digest('hex');
 if(new Set(dataset.cases.map(item=>item.id)).size!==dataset.cases.length)throw new Error('Duplicate benchmark case IDs');
 const preparedAt=new Date().toISOString();const recent=new Date(Date.now()-86400000).toISOString();
 const cases=[];let simulatedSearchCalls=0;
 for(const item of dataset.cases){
  const evidence=EvidenceRetrievalReport.parse({version:'1',claim:item.claim,query:item.claim,mode:'live',status:item.evidence.length?'retrieved':'empty',createdAt:preparedAt,retrievedAt:preparedAt,message:'SIMULATED fixed benchmark evidence; no retrieval occurred.',limitations:['Fictional source statements, hostnames and dates. No source independence/authority was established.'],evidence:item.evidence.map((excerpt,index)=>({url:`https://benchmark-source${index}.example/${item.id}`,title:'SIMULATED benchmark source',excerpt,publishedAt:item.publishedAt??recent,retrievedAt:preparedAt,relation:'context',retrieval:'tavily'}))});
  const fetcher:typeof fetch=async url=>{
   if(String(url)!=='https://api.tavily.com/search')throw new Error('Unexpected benchmark destination blocked');
   simulatedSearchCalls++;
   return Response.json({results:evidence.evidence.map(source=>({url:source.url,title:source.title,content:source.excerpt,published_date:source.publishedAt}))});
  };
  const start=performance.now();
  const baseline=await verifyAnswer({version:'1',text:item.claim,claims:[{text:item.claim}]},{mode:'live',allowPaidRequests:'true',apiKey:'synthetic-key',maxRequests:1,fetch:fetcher,budget:new SearchBudget()});
  const latencyMs=performance.now()-start;const outcome=baseline.claims[0].outcome;
  cases.push({id:item.id,expected:item.expected,rationale:item.rationale,evidence,rules:{outcome,correct:outcome===item.expected,falseDecisive:outcome!=='inconclusive'&&outcome!==item.expected,latencyMs,explanation:baseline.claims[0].uncertainty}});
 }
 const summary={cases:cases.length,correctVerdictRate:cases.filter(item=>item.rules.correct).length/cases.length,falseDecisive:cases.filter(item=>item.rules.falseDecisive).length,inconclusiveRate:cases.filter(item=>item.rules.outcome==='inconclusive').length/cases.length,meanLatencyMs:cases.reduce((sum,item)=>sum+item.rules.latencyMs,0)/cases.length,modelRequests:0,realTavilyRequests:0,simulatedSearchCalls};
 return {version:'1',preparedAt,datasetHash,evidenceHash:createHash('sha256').update(JSON.stringify(cases.map(item=>item.evidence))).digest('hex'),simulatedEvidence:true,externalRequests:0,notice:'Fixed development benchmark preparation only. Rules baseline ran; Gemini-assisted comparison is pending. Expected labels/rationales must never be sent to the model. This is not an independent holdout or real-world accuracy estimate.',arms:[{arm:'existing-deterministic-verifier',status:'completed',summary},{arm:'bifrost-model-evidence-comparison',status:'pending',summary:null}],cases,limits:{maximumFutureModelAttempts:cases.filter(item=>item.evidence.evidence.length>=2).length,realTavilyRequests:0}};
}
