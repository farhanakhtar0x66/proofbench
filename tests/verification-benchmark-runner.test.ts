import {expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {prepareVerificationBenchmark} from '../scripts/verification-benchmark-lib';
import {PreparedBenchmark,runPreparedComparisons,validatePreparedBenchmark} from '../scripts/run-verification-benchmark-lib';

it('validates locked snapshot integrity and rejects changed labels/evidence/dataset or stale baselines',async()=>{
 const prepared=await prepareVerificationBenchmark();const raw=await readFile(new URL('../fixtures/verification-benchmark/v1.json',import.meta.url),'utf8');
 expect(validatePreparedBenchmark(prepared,prepared,raw).cases).toHaveLength(10);
 const changedLabel=structuredClone(prepared);changedLabel.cases[0].expected='contradicted';
 expect(()=>validatePreparedBenchmark(changedLabel,prepared,raw)).toThrow('labels');
 const changedEvidence=structuredClone(prepared);changedEvidence.cases[0].evidence.evidence[0].excerpt='Different source.';
 expect(()=>validatePreparedBenchmark(changedEvidence,prepared,raw)).toThrow('hashes');
 expect(()=>validatePreparedBenchmark(prepared,prepared,raw+' ')).toThrow('hashes');
 expect(()=>validatePreparedBenchmark({...prepared,preparedAt:new Date(Date.now()-2*86400000).toISOString()},prepared,raw)).toThrow('24-hour');
});

it('stops on inference failure, preserves rows and excludes failed/unrun cases from verdict metrics',async()=>{
 const snapshot=PreparedBenchmark.parse(await prepareVerificationBenchmark());snapshot.cases=snapshot.cases.slice(0,3);
 let calls=0;let blocked=false;let checkpoints=0;
 const interpreter={interpret:async()=>null,canRequest:()=>!blocked,unavailableReason:()=>blocked?'Simulated gateway failure':undefined,compareEvidence:async(text:string)=>{
  const context=JSON.parse(text);expect(context).not.toHaveProperty('expected');expect(context).not.toHaveProperty('rationale');
  calls++;if(calls===2){blocked=true;throw new Error('simulated failure');}
  return {assessments:context.sources.map((source:{sourceId:string;excerpt:string})=>({sourceId:source.sourceId,quote:source.excerpt,relation:'contradicts'})),correction:null};
 }};
 const report=await runPreparedComparisons(snapshot,interpreter,()=>calls,async rows=>{checkpoints++;expect(rows.length).toBe(checkpoints);});
 expect(calls).toBe(2);expect(checkpoints).toBe(2);expect(report.status).toBe('incomplete');
 expect(report.rows.map(row=>row.status)).toEqual(['completed','failed','not_run']);
 expect(report.rows.map(row=>row.correct)).toEqual([false,null,null]);expect(report.summary.evaluatedCases).toBe(1);expect(report.summary.falseDecisive).toBe(1);expect(report.summary.modelFailures).toBe(1);expect(report.summary.notRun).toBe(1);expect(report.summary.modelRequests).toBe(2);
});

it('counts precheck abstention separately from completed model comparisons',async()=>{
 const snapshot=PreparedBenchmark.parse(await prepareVerificationBenchmark());snapshot.cases=[snapshot.cases.find(item=>item.id==='missing-evidence')!,snapshot.cases[0]];
 let calls=0;
 const report=await runPreparedComparisons(snapshot,{interpret:async()=>null,canRequest:()=>true,compareEvidence:async text=>{
  calls++;const context=JSON.parse(text);return {assessments:context.sources.map((source:{sourceId:string;excerpt:string})=>({sourceId:source.sourceId,quote:source.excerpt,relation:'supports'})),correction:null};
 }},()=>calls);
 expect(report.status).toBe('completed');expect(report.rows.map(row=>row.status)).toEqual(['precheck_abstained','completed']);expect(report.summary.modelRequests).toBe(1);expect(report.summary.completedModelComparisons).toBe(1);expect(report.summary.matchedExpected).toBe(2);
});
