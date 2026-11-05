import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {evaluateGeneralScenarios,type Scenario} from './general-evaluation-lib';

const Verdict=z.enum(['supported','contradicted','inconclusive']);
export const TopicDataset=z.object({
 version:z.literal('1'),referenceCheckedOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),notice:z.string().min(1),
 cases:z.array(z.object({
  id:z.string().min(1),topic:z.enum(['leadership','pricing','software','sports','law']),
  claim:z.string().min(1),expected:Verdict,reference:z.string().url(),rationale:z.string().min(1),
  simulatedSources:z.array(z.string().min(1)).max(3),simulatedRelation:z.enum(['supports','contradicts','insufficient']).optional(),
  simulatedSearches:z.number().int().min(0).max(1),simulatedModels:z.number().int().min(0).max(1),
 }).strict()).length(10),
}).strict().superRefine((dataset,context)=>{
 if(new Set(dataset.cases.map(item=>item.id)).size!==dataset.cases.length)context.addIssue({code:'custom',message:'Case IDs must be unique'});
});

export async function evaluateTopicValidation(){
 const raw=await readFile(new URL('../fixtures/topic-validation/v1.json',import.meta.url),'utf8');
 const dataset=TopicDataset.parse(JSON.parse(raw));
 const scenarios:Scenario[]=dataset.cases.map(item=>({
  id:item.id,text:item.claim,scope:'current',sources:item.simulatedSources.map(text=>({text})),
  relations:item.simulatedSources.map(()=>item.simulatedRelation??'insufficient'),
  expected:[item.expected],searches:item.simulatedSearches,models:item.simulatedModels,note:item.rationale,
 }));
 const offline=await evaluateGeneralScenarios(scenarios);
 return {
  ...offline,datasetHash:createHash('sha256').update(raw).digest('hex'),referenceCheckedOn:dataset.referenceCheckedOn,
  notice:dataset.notice+' Offline model relations are scripted. A pass measures API/guard behavior, not real model understanding or live accuracy.',
  cases:dataset.cases.map(item=>({id:item.id,topic:item.topic,claim:item.claim,expected:item.expected,reference:item.reference,rationale:item.rationale})),
  live:{status:'not_run',requestsMade:0,requiredScope:'current',extraction:'rules',
   maximumTavilySearches:9,maximumModelComparisons:9,
   note:'Planning ceilings only, not authorization. Recheck references; run a bounded batch without retries or paid fallback. Use only live retrieved excerpts, never simulated sources or expected labels. Stop on provider failure; record unrun cases. No cache savings are assumed.',
  },
 };
}
