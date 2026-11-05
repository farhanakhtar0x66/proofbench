import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {TopicDataset} from './topic-validation-lib';
import {evidenceSearchPlan} from '../packages/tavily/src/search-plan';
import {completedEventClaim} from '../packages/tavily/src/completed-event';
import type {TopicBatchReport} from './live-topic-validation-lib';

export const FocusSelection=z.object({
 version:z.literal('1'),baselineRun:z.string().min(1),baselineStage:z.string().min(1),
 cases:z.array(z.object({id:z.string().min(1),baselineOutcome:z.enum(['supported','contradicted','inconclusive']),purpose:z.string().min(1)}).strict()).length(4),
}).strict().refine(value=>new Set(value.cases.map(item=>item.id)).size===4,'Unique case IDs required');

export function buildFocusedPlan(dataset:ReturnType<typeof TopicDataset.parse>,selection:ReturnType<typeof FocusSelection.parse>,now=new Date()){
 return {
  version:'1',status:'prepared_not_run',createdAt:now.toISOString(),externalRequests:0,
  referenceCheckedOn:dataset.referenceCheckedOn,baselineRun:selection.baselineRun,baselineStage:selection.baselineStage,
  limits:{tavily:4,model:4},extraction:'rules',scope:'current',
  cases:selection.cases.map(selected=>{
   const item=dataset.cases.find(candidate=>candidate.id===selected.id);
   if(!item)throw new Error(`Unknown focused case: ${selected.id}`);
   return {id:item.id,claim:item.claim,expected:item.expected,reference:item.reference,rationale:item.rationale,baselineOutcome:selected.baselineOutcome,purpose:selected.purpose,requiredFreshness:completedEventClaim(item.claim,now.toISOString())?'unknown' as const:null,searchPlan:evidenceSearchPlan(item.claim,'current',now)};
  }),
  notice:'Preparation only: zero searches/inference and no live authorization. Prior reference labels must be reviewed before a live run. No synthetic evidence, labels, rationales or baseline results may enter verification prompts. Compare evidence eligibility and context as well as verdicts; do not lower safeguards to obtain a pass. Gateway startup metadata calls are separate from model comparisons.',
 };
}

export async function prepareFocusedRecheck(){
 const raw=await readFile(new URL('../fixtures/topic-validation/v1.json',import.meta.url),'utf8');
 const selectionRaw=await readFile(new URL('../fixtures/topic-validation/focused-recheck-v1.json',import.meta.url),'utf8');
 const plan=buildFocusedPlan(TopicDataset.parse(JSON.parse(raw)),FocusSelection.parse(JSON.parse(selectionRaw)));
 const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
 return {...plan,datasetHash:hash(raw),selectionHash:hash(selectionRaw)};
}

export function compareFocusedBaseline(plan:Awaited<ReturnType<typeof prepareFocusedRecheck>>,report:TopicBatchReport){
 return plan.cases.map(item=>{
  const current=report.results.find(result=>result.id===item.id);
  const completed=current?.status==='completed';const actual=completed?current.actual:null;
  const comparison=current?.report?.results[0]?.comparison;
  const freshnessMatches=item.requiredFreshness===null||comparison?.freshness===item.requiredFreshness&&comparison.freshnessScore===null;
  const meetsTarget=!!(completed&&actual===item.expected&&comparison?.method==='llm'&&freshnessMatches);
  return {id:item.id,baselineOutcome:item.baselineOutcome,actual,expected:item.expected,status:current?.status??'not_run',
   meetsTarget,freshnessMatches,recovered:item.baselineOutcome==='inconclusive'&&meetsTarget,
   lostBaselineMatch:completed&&item.baselineOutcome===item.expected&&actual!==item.expected,
  };
 });
}
