import {mkdir,writeFile} from 'node:fs/promises';
import {prepareFocusedRecheck} from './focused-recheck-lib';

const plan=await prepareFocusedRecheck();
await mkdir('.local/topic-validation',{recursive:true});
await writeFile('.local/topic-validation/focused-plan.json',JSON.stringify(plan,null,2));
for(const item of plan.cases)console.log(`${item.id}: previous=${item.baselineOutcome}; target=${item.expected}; ${item.claim}`);
console.log('PREPARED ONLY. No Tavily/Gemini requests. Future live ceiling: 4 Basic searches and 4 model comparisons; gateway metadata is separate.');
console.log('Plan: .local/topic-validation/focused-plan.json');
