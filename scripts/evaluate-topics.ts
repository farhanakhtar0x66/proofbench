import {mkdir,writeFile} from 'node:fs/promises';
import {evaluateTopicValidation} from './topic-validation-lib';

const report=await evaluateTopicValidation();
for(const result of report.results)console.log(`${result.passed?'PASS':'FAIL'} ${result.id}: ${result.actual.join(', ')}`);
await mkdir('.local/topic-validation',{recursive:true});
await writeFile('.local/topic-validation/offline.json',JSON.stringify(report,null,2));
console.log(`${report.summary.passed}/${report.summary.total} scripted pipeline checks passed. Zero Tavily/Gemini requests. Live testing: not run.`);
console.log('Report: .local/topic-validation/offline.json');
if(report.summary.passed!==report.summary.total)process.exitCode=1;
