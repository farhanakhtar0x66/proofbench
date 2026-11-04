import {readFile} from 'node:fs/promises';
import {expect,it,vi} from 'vitest';
import {prepareFocusedRecheck,buildFocusedPlan,FocusSelection,compareFocusedBaseline} from '../scripts/focused-recheck-lib';
import {TopicDataset,evaluateTopicValidation} from '../scripts/topic-validation-lib';
import type {TopicBatchReport} from '../scripts/live-topic-validation-lib';

it('prepares exactly three prior misses and one historical control with no network or environment changes',async()=>{
 const upstream=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No real requests allowed'));
 const env={...process.env};
 try{
  const plan=await prepareFocusedRecheck();
  expect(plan.status).toBe('prepared_not_run');expect(plan.externalRequests).toBe(0);expect(plan.limits).toEqual({tavily:4,model:4});
  expect(plan.cases.map(item=>item.id)).toEqual(['leadership-current','pricing-explicit-currency','sports-wrong-player-limit','law-application-date']);
  expect(plan.cases.filter(item=>item.baselineOutcome==='inconclusive')).toHaveLength(3);
  expect(plan.cases.at(-1)).toMatchObject({baselineOutcome:'supported',expected:'supported',requiredFreshness:'unknown'});
  expect(plan.cases.at(-1)?.searchPlan.dateWindow).toBeUndefined();
  expect(plan.cases.slice(0,3).every(item=>!!item.searchPlan.dateWindow)).toBe(true);
  expect(plan.cases.every(item=>!('simulatedSources' in item)&&!('simulatedRelation' in item))).toBe(true);
  expect(plan.datasetHash).toMatch(/^[a-f0-9]{64}$/u);expect(plan.selectionHash).toMatch(/^[a-f0-9]{64}$/u);
  expect(upstream).not.toHaveBeenCalled();expect(process.env).toEqual(env);
 }finally{upstream.mockRestore();}
});
it('rejects duplicate and unknown selected case IDs',async()=>{
 const dataset=TopicDataset.parse(JSON.parse(await readFile(new URL('../fixtures/topic-validation/v1.json',import.meta.url),'utf8')));
 const selection=FocusSelection.parse(JSON.parse(await readFile(new URL('../fixtures/topic-validation/focused-recheck-v1.json',import.meta.url),'utf8')));
 const duplicate=structuredClone(selection);duplicate.cases[1].id=duplicate.cases[0].id;
 expect(FocusSelection.safeParse(duplicate).success).toBe(false);
 selection.cases[0].id='missing-case';expect(()=>buildFocusedPlan(dataset,selection)).toThrow('Unknown focused case');
});
it('compares completed model-backed results and does not count unrun or inconclusive cases as recovered',async()=>{
 const plan=await prepareFocusedRecheck();const offline=await evaluateTopicValidation();
 const report:TopicBatchReport={status:'completed',stopReason:null,attempts:{tavily:0,model:0},limits:plan.limits,summary:{completed:4,exactMatches:4,wrongDecisive:0,inconclusiveKnownFacts:0,notRun:0},results:plan.cases.map(item=>{
  const result=offline.results.find(candidate=>candidate.id===item.id)!;
  return {id:item.id,expected:item.expected,status:'completed',actual:result.actual[0],elapsedMs:0,report:result.report};
 })};
 const comparison=compareFocusedBaseline(plan,report);
 expect(comparison.filter(item=>item.recovered)).toHaveLength(3);expect(comparison.some(item=>item.lostBaselineMatch)).toBe(false);
 expect(comparison.every(item=>item.meetsTarget)).toBe(true);
 report.results[3].report!.results[0].comparison.freshness='current';
 expect(compareFocusedBaseline(plan,report)[3]).toMatchObject({meetsTarget:false,freshnessMatches:false,lostBaselineMatch:false});
 report.results[3].report!.results[0].comparison.freshness='unknown';
 report.results[0]={...report.results[0],status:'not_run',actual:null,report:null};
 report.results[1]={...report.results[1],actual:'inconclusive'};
 report.results[3]={...report.results[3],actual:'inconclusive'};
 const changed=compareFocusedBaseline(plan,report);
 expect(changed[0]).toMatchObject({status:'not_run',actual:null,recovered:false,lostBaselineMatch:false});
 expect(changed[1].recovered).toBe(false);expect(changed[3].lostBaselineMatch).toBe(true);
},20000);
