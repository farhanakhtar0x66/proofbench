import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {EvidenceComparisonReport} from '../packages/contracts/src/index';
import {currencyAmbiguityReason} from '../packages/tavily/src/claim-ambiguity';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import type {Snapshot,BenchmarkRow} from './run-verification-benchmark-lib';

const Previous=z.object({model:z.string(),datasetHash:z.string(),evidenceHash:z.string(),modelRequests:z.number().int().nonnegative(),realTavilyRequests:z.literal(0),result:z.object({status:z.literal('incomplete'),rows:z.array(z.object({id:z.string(),expected:z.enum(['supported','contradicted','inconclusive']),status:z.enum(['completed','precheck_abstained','failed','not_run']),modelRequests:z.number().int().nonnegative(),outcome:z.enum(['supported','contradicted','inconclusive']).nullable(),correct:z.boolean().nullable(),falseDecisive:z.boolean(),latencyMs:z.number().nonnegative(),explanation:z.string(),comparison:EvidenceComparisonReport.optional()}).passthrough())}).passthrough()}).passthrough();

/** Resume only the known currency failure; original completed calls are never repeated. */
export async function prepareBenchmarkContinuation(snapshot:Snapshot,raw:string){
 const previous=Previous.parse(JSON.parse(raw));
 if(previous.datasetHash!==snapshot.datasetHash||previous.evidenceHash!==snapshot.evidenceHash||previous.result.rows.length!==snapshot.cases.length)throw new Error('Previous benchmark uses different evidence.');
 if(previous.result.rows.some((row,index)=>row.id!==snapshot.cases[index].id||row.expected!==snapshot.cases[index].expected))throw new Error('Previous benchmark case ordering or labels differ.');
 if(previous.result.rows.reduce((sum,row)=>sum+row.modelRequests,0)!==previous.modelRequests)throw new Error('Previous attempt counts disagree.');
 const failures=previous.result.rows.filter(row=>row.status==='failed');
 if(failures.length!==1||failures[0].id!=='ambiguous-currency'||failures[0].modelRequests!==1)throw new Error('Only the single recorded currency failure can be continued.');
 const failedIndex=previous.result.rows.findIndex(row=>row.status==='failed');
 if(previous.result.rows.slice(0,failedIndex).some(row=>row.status!=='completed'&&row.status!=='precheck_abstained')||previous.result.rows.slice(failedIndex+1).some(row=>row.status!=='not_run'||row.modelRequests!==0))throw new Error('Previous benchmark was already continued or has an unexpected stop boundary.');
 const item=snapshot.cases[failedIndex];const ambiguity=currencyAmbiguityReason(item.evidence.claim);
 if(!ambiguity)throw new Error('Failed case is not covered by the deterministic currency guard.');
 const comparison=await compareClaimEvidence(item.evidence,{mode:'rules'});
 if(comparison.explanation!==ambiguity||comparison.outcome!=='inconclusive'||comparison.correction!==null)throw new Error('Currency guard did not safely resolve the failed case offline.');
 const reassessed:BenchmarkRow={id:item.id,expected:item.expected,status:'precheck_abstained',outcome:comparison.outcome,correct:comparison.outcome===item.expected,falseDecisive:false,latencyMs:0,modelRequests:0,explanation:comparison.explanation,comparison};
 const remaining=snapshot.cases.filter((_item,index)=>previous.result.rows[index].status==='not_run');
 const plannedTotal=snapshot.cases.filter(item=>item.evidence.evidence.length>=2).length;
 const maxRequests=remaining.filter(item=>item.evidence.evidence.length>=2).length;
 if(previous.modelRequests+maxRequests>plannedTotal)throw new Error('Continuation would exceed the original total model allowance.');
 return {previous,parentHash:createHash('sha256').update(raw).digest('hex'),maxRequests,remainingSnapshot:{...snapshot,cases:remaining},reassessed,merge(rows:BenchmarkRow[]){
  const newlyRun=new Map(rows.map(row=>[row.id,row]));
  return snapshot.cases.map((item,index)=>item.id===reassessed.id?reassessed:newlyRun.get(item.id)??previous.result.rows[index] as BenchmarkRow);
 }};
}

/** Complete untouched tail cases without retrying either recorded failure. */
export async function prepareBenchmarkTail(snapshot:Snapshot,originalRaw:string,continuationRaw:string){
 const original=await prepareBenchmarkContinuation(snapshot,originalRaw);
 const previous=Previous.parse(JSON.parse(continuationRaw));
 if(previous.datasetHash!==snapshot.datasetHash||previous.evidenceHash!==snapshot.evidenceHash||previous.model!==original.previous.model||previous.result.rows.length!==snapshot.cases.length||previous.parentReportHash!==original.parentHash)throw new Error('Continuation chain or evidence differs.');
 const priorRequests=z.number().int().nonnegative().parse(previous.priorModelRequests);
 const totalRequests=z.number().int().nonnegative().parse(previous.totalModelRequests);
 if(priorRequests!==original.previous.modelRequests||totalRequests!==priorRequests+previous.modelRequests)throw new Error('Continuation attempt totals differ.');
 if(previous.result.rows.some((row,index)=>row.id!==snapshot.cases[index].id||row.expected!==snapshot.cases[index].expected))throw new Error('Continuation case ordering differs.');
 const untouched=new Set(original.remainingSnapshot.cases.map(item=>item.id));
 if(previous.result.rows.filter(row=>untouched.has(row.id)).reduce((sum,row)=>sum+row.modelRequests,0)!==previous.modelRequests)throw new Error('Continuation request counts differ.');
 for(const row of original.previous.result.rows.filter(row=>row.status==='completed'||row.status==='precheck_abstained'))if(!isDeepStrictEqual(row,previous.result.rows.find(item=>item.id===row.id)))throw new Error('An earlier completed result was changed.');
 const currency=previous.result.rows.find(row=>row.id==='ambiguous-currency');
 if(currency?.status!=='precheck_abstained'||currency.modelRequests!==0||currency.outcome!=='inconclusive')throw new Error('Offline currency reassessment differs.');
 const failures=previous.result.rows.filter(row=>row.status==='failed');
 if(failures.length!==1||failures[0].id!=='historical-completed'||failures[0].modelRequests!==1)throw new Error('Unexpected continuation failure.');
 const boundary=previous.result.rows.findIndex(row=>row.status==='failed');
 if(previous.result.rows.slice(boundary+1).some(row=>row.status!=='not_run'||row.modelRequests!==0))throw new Error('Tail was already run.');
 const remaining=snapshot.cases.filter((_item,index)=>previous.result.rows[index].status==='not_run');
 const maxRequests=remaining.filter(item=>item.evidence.evidence.length>=2).length;
 if(totalRequests+maxRequests>snapshot.cases.filter(item=>item.evidence.evidence.length>=2).length)throw new Error('Original total allowance would be exceeded.');
 return {previous,parentHash:createHash('sha256').update(continuationRaw).digest('hex'),maxRequests,priorRequests:totalRequests,priorFailures:2,remainingSnapshot:{...snapshot,cases:remaining},merge(rows:BenchmarkRow[]){const newlyRun=new Map(rows.map(row=>[row.id,row]));return snapshot.cases.map((item,index)=>newlyRun.get(item.id)??previous.result.rows[index] as BenchmarkRow);}};
}
