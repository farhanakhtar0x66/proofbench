import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {EvidenceRetrievalReport,EvidenceComparisonReport} from '../packages/contracts/src/index';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import type {LanguageInterpreter} from '../packages/tavily/src/interpretation';
import {BenchmarkDataset} from './verification-benchmark-lib';

const outcome=z.enum(['supported','contradicted','inconclusive']);
export const PreparedBenchmark=z.object({version:z.literal('1'),preparedAt:z.string().datetime(),datasetHash:z.string(),evidenceHash:z.string(),cases:z.array(z.object({id:z.string(),expected:outcome,rationale:z.string(),evidence:EvidenceRetrievalReport,rules:z.object({outcome,latencyMs:z.number().nonnegative()}).passthrough()}).passthrough()).min(1).max(20)}).passthrough();
export type Snapshot=z.infer<typeof PreparedBenchmark>;
export async function loadPreparedBenchmark(){
 const latest=z.object({runId:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/u),datasetHash:z.string(),evidenceHash:z.string()}).strict().parse(JSON.parse(await readFile('.local/verification-benchmark/latest.json','utf8')));
 const directory=`.local/verification-benchmark/${latest.runId}`;
 const raw=await readFile(new URL('../fixtures/verification-benchmark/v1.json',import.meta.url),'utf8');
 const snapshot=validatePreparedBenchmark(JSON.parse(await readFile(`${directory}/prepared.json`,'utf8')),latest,raw);
 return {snapshot,directory,maxRequests:snapshot.cases.filter(item=>item.evidence.evidence.length>=2).length};
}

export function validatePreparedBenchmark(input:unknown,latest:{datasetHash:string;evidenceHash:string},raw:string){
 const snapshot=PreparedBenchmark.parse(input);const fixture=BenchmarkDataset.parse(JSON.parse(raw));
 const hash=createHash('sha256').update(raw).digest('hex');
 const evidenceHash=createHash('sha256').update(JSON.stringify(snapshot.cases.map(item=>item.evidence))).digest('hex');
 if(hash!==snapshot.datasetHash||hash!==latest.datasetHash||evidenceHash!==snapshot.evidenceHash||evidenceHash!==latest.evidenceHash)throw new Error('Benchmark snapshot hashes differ. Prepare a new baseline.');
 if(snapshot.cases.length!==fixture.cases.length||snapshot.cases.some((item,index)=>item.id!==fixture.cases[index].id||item.expected!==fixture.cases[index].expected||item.rationale!==fixture.cases[index].rationale||item.evidence.claim!==fixture.cases[index].claim||JSON.stringify(item.evidence.evidence.map(source=>source.excerpt))!==JSON.stringify(fixture.cases[index].evidence)))throw new Error('Benchmark labels or source text differ from the fixture.');
 const age=Date.now()-Date.parse(snapshot.preparedAt);if(age<0||age>86400000)throw new Error('Prepared baseline is outside the 24-hour comparison window; prepare both arms again.');
 return snapshot;
}

export type BenchmarkRow={id:string;expected:z.infer<typeof outcome>;outcome:z.infer<typeof outcome>|null;status:'completed'|'precheck_abstained'|'failed'|'not_run';correct:boolean|null;falseDecisive:boolean;latencyMs:number;modelRequests:number;explanation:string;comparison?:z.infer<typeof EvidenceComparisonReport>};
export async function runPreparedComparisons(snapshot:Snapshot,interpreter:LanguageInterpreter,counter:()=>number,onProgress?:(rows:BenchmarkRow[])=>Promise<void>){
 const rows:BenchmarkRow[]=[];let stopped=false;
 for(const item of snapshot.cases){
  if(stopped){rows.push({id:item.id,expected:item.expected,outcome:null,status:'not_run',correct:null,falseDecisive:false,latencyMs:0,modelRequests:0,explanation:'Stopped after the first inference failure; no retry or cooldown wait.'});continue;}
  const before=counter();const start=performance.now();
  const result=await compareClaimEvidence(item.evidence,{mode:'llm',interpreter});
  const requests=counter()-before;const failed=result.method!=='llm'&&(requests>0||interpreter.canRequest?.()===false);
  const status=failed?'failed':result.method==='llm'?'completed':'precheck_abstained';
  rows.push({id:item.id,expected:item.expected,outcome:result.outcome,status,correct:failed?null:result.outcome===item.expected,falseDecisive:!failed&&result.outcome!=='inconclusive'&&result.outcome!==item.expected,latencyMs:performance.now()-start,modelRequests:requests,explanation:result.explanation,comparison:result});
  stopped=failed;await onProgress?.(rows);
 }
 return summarizeBenchmarkRows(rows,counter());
}

export function summarizeBenchmarkRows(rows:BenchmarkRow[],requests:number){
 const evaluated=rows.filter(row=>row.correct!==null);const completed=rows.filter(row=>row.status==='completed');
 return {status:rows.some(row=>row.status==='failed'||row.status==='not_run')?'incomplete':'completed',rows,summary:{totalCases:rows.length,evaluatedCases:evaluated.length,matchedExpected:evaluated.filter(row=>row.correct).length,matchRate:evaluated.length?evaluated.filter(row=>row.correct).length/evaluated.length:null,falseDecisive:evaluated.filter(row=>row.falseDecisive).length,inconclusiveRate:evaluated.length?evaluated.filter(row=>row.outcome==='inconclusive').length/evaluated.length:null,completedModelComparisons:completed.length,modelFailures:rows.filter(row=>row.status==='failed').length,notRun:rows.filter(row=>row.status==='not_run').length,modelRequests:requests,meanCompletedInferenceMs:completed.length?completed.reduce((sum,row)=>sum+row.latencyMs,0)/completed.length:null},notice:'Fixed fictional evidence, not live search or a holdout. Failed/unrun cases are excluded from verdict-match rates and reported separately. Precheck abstentions are pipeline results, not model inferences. Do not compare partial rates as a complete benchmark.'};
}
