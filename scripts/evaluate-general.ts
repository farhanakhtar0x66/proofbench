import {mkdir,writeFile} from 'node:fs/promises';
import {evaluateGeneralScenarios} from './general-evaluation-lib';
const report=await evaluateGeneralScenarios();
for(const result of report.results)console.log(`${result.passed?'PASS':'FAIL'} ${result.id}: ${result.actual.join(', ')||'no claims'} (simulated search/model calls ${result.simulatedSearches}/${result.simulatedModelCalls})`);
await mkdir('.local/general-evaluation',{recursive:true});await writeFile('.local/general-evaluation/report.json',JSON.stringify(report,null,2));
console.log(`${report.summary.passed}/${report.summary.total} synthetic expectations matched. Zero real API requests. Report: .local/general-evaluation/report.json`);
console.log(report.notice);
if(report.summary.passed!==report.summary.total)process.exitCode=1;
