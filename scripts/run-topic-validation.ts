import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {TopicDataset} from './topic-validation-lib';
import {runLiveTopicBatch} from './live-topic-validation-lib';
import {bifrostSettings,hostedReadiness} from '../packages/tavily/src/bifrost-interpreter';
import {checkBifrostStack} from '../packages/tavily/src/bifrost-status';

const required={RUN_TOPIC_VALIDATION:'true',LANGUAGE_MODE:'bifrost',CLAIM_EXTRACTION_MODE:'rules',EVIDENCE_COMPARISON_MODE:'llm',TAVILY_MODE:'live',ALLOW_PAID_REQUESTS:'true',TAVILY_MAX_REQUESTS:'9',BIFROST_LLM_MAX_REQUESTS:'9'};
if(Object.entries(required).some(([key,value])=>process.env[key]!==value))throw new Error('Explicit live topic-test consent, rules extraction and nine-attempt ceilings required');
const settings=bifrostSettings();
if(settings.provider!=='gemini'||hostedReadiness(process.env,settings))throw new Error('Configured free-tier Gemini model is not ready');
if(!process.env.TAVILY_API_KEY?.trim())throw new Error('Tavily key missing');
await checkBifrostStack();
const raw=await readFile(new URL('../fixtures/topic-validation/v1.json',import.meta.url),'utf8');
const dataset=TopicDataset.parse(JSON.parse(raw));
const datasetHash=createHash('sha256').update(raw).digest('hex');
await mkdir('.local/topic-validation',{recursive:true});
const directory=await mkdtemp('.local/topic-validation/live-');
const createdAt=new Date().toISOString();
const report=await runLiveTopicBatch({
 cases:dataset.cases.map(({id,claim,expected})=>({id,claim,expected})),dataDir:`${directory}/data`,endpoint:settings.endpoint,limits:{tavily:9,model:9},
 checkpoint:async result=>{
  await writeFile(`${directory}/result.json`,JSON.stringify({createdAt,datasetHash,referenceCheckedOn:dataset.referenceCheckedOn,model:settings.model,...result,notice:'Real-source development test, not independent accuracy or billing audit. Basic search attempts are expected credits; startup model-catalog metadata calls are separate. Inconclusive known facts are coverage limitations, not accuracy passes.'},null,2));
 },
});
for(const item of report.results)console.log(JSON.stringify({id:item.id,status:item.status,expected:item.expected,actual:item.actual,explanation:item.report?.results[0]?.comparison.explanation}));
console.log(JSON.stringify({status:report.status,stopReason:report.stopReason,attempts:report.attempts,summary:report.summary,report:`${directory}/result.json`}));
// Completion is not a quality pass: abstention on a known fact is a coverage miss.
if(report.status!=='completed'||report.summary.exactMatches!==dataset.cases.length)process.exitCode=1;
