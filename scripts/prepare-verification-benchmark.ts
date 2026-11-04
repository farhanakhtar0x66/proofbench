import {mkdir,writeFile} from 'node:fs/promises';
import {prepareVerificationBenchmark} from './verification-benchmark-lib';
const report=await prepareVerificationBenchmark();
const runId=report.preparedAt.replace(/[:.]/gu,'-');const directory=`.local/verification-benchmark/${runId}`;
await mkdir(directory,{recursive:true});await writeFile(`${directory}/prepared.json`,JSON.stringify(report,null,2),{flag:'wx'});
await writeFile('.local/verification-benchmark/latest.json',JSON.stringify({runId,datasetHash:report.datasetHash,evidenceHash:report.evidenceHash},null,2));
console.table(report.cases.map(item=>({id:item.id,expected:item.expected,rules:item.rules.outcome,correct:item.rules.correct})));
console.log(`Prepared ${report.cases.length} cases. Rules baseline completed; model arm pending. Zero real Gemini/Tavily requests.`);
console.log(`Report: ${directory}/prepared.json`);console.log(report.notice);
