import {readFile} from 'node:fs/promises';
import {expect,it,vi} from 'vitest';
import {evaluateTopicValidation,TopicDataset} from '../scripts/topic-validation-lib';

it('exercises ten current-scope topic cases with no upstream calls and preserves caller settings',async()=>{
 const original=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Real requests forbidden'));
 const previous=process.env.BIFROST_LLM_MAX_REQUESTS;
 process.env.BIFROST_LLM_MAX_REQUESTS='0';
 try{
  const report=await evaluateTopicValidation();
  expect(report.summary).toMatchObject({total:10,passed:10});
  expect(report.externalRequests).toBe(0);expect(original).not.toHaveBeenCalled();
  expect(globalThis.fetch).toBe(original);expect(process.env.BIFROST_LLM_MAX_REQUESTS).toBe('0');
  expect(new Set(report.cases.map(item=>item.topic)).size).toBe(5);
  expect(new Set(report.results.flatMap(item=>item.actual))).toEqual(new Set(['supported','contradicted','inconclusive']));
  expect(report.results.every(item=>item.report.scope==='current')).toBe(true);
  expect(report.results.reduce((sum,item)=>sum+item.simulatedSearches,0)).toBe(9);
  expect(report.results.reduce((sum,item)=>sum+item.simulatedModelCalls,0)).toBe(9);
  expect(report.results.find(item=>item.id==='pricing-ambiguous-currency')).toMatchObject({simulatedSearches:0,simulatedModelCalls:0});
  expect(report.live).toMatchObject({status:'not_run',requestsMade:0});
  expect(report.datasetHash).toMatch(/^[a-f0-9]{64}$/u);
 }finally{
  original.mockRestore();if(previous===undefined)delete process.env.BIFROST_LLM_MAX_REQUESTS;else process.env.BIFROST_LLM_MAX_REQUESTS=previous;
 }
},30000);

it('rejects duplicate topic IDs and unexpected fixture fields',async()=>{
 const dataset=JSON.parse(await readFile(new URL('../fixtures/topic-validation/v1.json',import.meta.url),'utf8'));
 expect(TopicDataset.safeParse(dataset).success).toBe(true);
 const duplicate=structuredClone(dataset);duplicate.cases[1].id=duplicate.cases[0].id;
 expect(TopicDataset.safeParse(duplicate).success).toBe(false);
 expect(TopicDataset.safeParse({...dataset,apiKey:'must-not-be-a-fixture-setting'}).success).toBe(false);
});
