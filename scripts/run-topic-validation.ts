import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {TopicDataset} from './topic-validation-lib';
import {runLiveTopicBatch} from './live-topic-validation-lib';
import {bifrostSettings,hostedReadiness} from '../packages/tavily/src/bifrost-interpreter';
import {checkBifrostStack} from '../packages/tavily/src/bifrost-status';
import {prepareFocusedRecheck,compareFocusedBaseline} from './focused-recheck-lib';

const focused=process.argv.includes('--focused');const limit=focused?4:9;
const required={RUN_TOPIC_VALIDATION:'true',LANGUAGE_MODE:'bifrost',CLAIM_EXTRACTION_MODE:'rules',EVIDENCE_COMPARISON_MODE:'llm',TAVILY_MODE:'live',ALLOW_PAID_REQUESTS:'true',TAVILY_MAX_REQUESTS:String(limit),BIFROST_LLM_MAX_REQUESTS:String(limit)};
if(Object.entries(required).some(([key,value])=>process.env[key]!==value))throw new Error(`Explicit live topic-test consent, rules extraction and ${limit}-attempt ceilings required`);
const settings=bifrostSettings();
if(settings.provider!=='gemini'||hostedReadiness(process.env,settings))throw new Error('Configured free-tier Gemini model is not ready');
if(!process.env.TAVILY_API_KEY?.trim())throw new Error('Tavily key missing');
await checkBifrostStack();
const raw=await readFile(new URL('../fixtures/topic-validation/v1.json',import.meta.url),'utf8');
const dataset=TopicDataset.parse(JSON.parse(raw));
const datasetHash=createHash('sha256').update(raw).digest('hex');
const focus=focused?await prepareFocusedRecheck():null;
if(focus&&focus.datasetHash!==datasetHash)throw new Error('Dataset changed during focused preparation');
const cases=focus?.cases??dataset.cases;
await mkdir('.local/topic-validation',{recursive:true});
const directory=await mkdtemp(`.local/topic-validation/${focused?'focused-live':'live'}-`);
const createdAt=new Date().toISOString();
const report=await runLiveTopicBatch({
 cases:cases.map(({id,claim,expected})=>({id,claim,expected})),dataDir:`${directory}/data`,endpoint:settings.endpoint,limits:{tavily:limit,model:limit},
 checkpoint:async result=>{
  await writeFile(`${directory}/result.json`,JSON.stringify({createdAt,datasetHash,referenceCheckedOn:dataset.referenceCheckedOn,model:settings.model,...result,...(focus?{focus,baselineComparison:compareFocusedBaseline(focus,result)}:{}),notice:'Real-source development test, not independent accuracy or billing audit. Basic search attempts are expected credits; startup model-catalog metadata calls are separate. Inconclusive known facts are coverage limitations, not accuracy passes.'},null,2));
 },
});
for(const item of report.results)console.log(JSON.stringify({id:item.id,status:item.status,expected:item.expected,actual:item.actual,explanation:item.report?.results[0]?.comparison.explanation}));
console.log(JSON.stringify({status:report.status,stopReason:report.stopReason,attempts:report.attempts,summary:report.summary,...(focus?{baselineComparison:compareFocusedBaseline(focus,report)}:{}),report:`${directory}/result.json`}));
// Completion is not a quality pass: abstention on a known fact is a coverage miss.
if(report.status!=='completed'||report.summary.exactMatches!==cases.length)process.exitCode=1;
if(focus&&!compareFocusedBaseline(focus,report).every(item=>item.meetsTarget))process.exitCode=1;
