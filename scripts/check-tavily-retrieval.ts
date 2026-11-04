import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';

// Explicitly metered live smoke check. Run only after approving one search.
if(process.env.TAVILY_MODE!=='live'||process.env.ALLOW_LIVE_REQUESTS!=='true'||process.env.TAVILY_MAX_REQUESTS!=='1'||process.env.LANGUAGE_MODE!=='rules'||process.env.BIFROST_LLM_MAX_REQUESTS!=='0')throw new Error('Check blocked: requires explicit live consent, exactly one Tavily request, rules-only language mode and zero hosted-model allowance.');
const upstream=globalThis.fetch;
let attempts=0;let reportedCredits:number|null=null;
const checks:{name:string;passed:boolean}[]=[];
let result:unknown=null;
globalThis.fetch=async(input,init)=>{
 if(String(input)!=='https://api.tavily.com/search'||attempts>=1)throw new Error('Unexpected destination or extra external request blocked');
 attempts++;
 const response=await upstream(input,{...init,redirect:'error'});
 try{const usage=(await response.clone().json()).usage;if(typeof usage?.credits==='number')reportedCredits=usage.credits;}catch{/* Missing usage is unknown, never zero. */}
 return response;
};
const directory=await mkdtemp(join(tmpdir(),'b05-live-tavily-'));
let app:Awaited<ReturnType<typeof createApp>>|undefined;
try{
 app=await createApp({implementation:'mock',tavilyMode:'live',dataDir:directory});
 const payload={version:'1',claim:'Cristiano Ronaldo is captain of Real Madrid.'};
 const first=await app.inject({method:'POST',url:'/api/claims/retrieve',payload});
 assert.equal(first.statusCode,200);
 const report=EvidenceRetrievalReport.parse(first.json());result=report;
 assert.equal(report.status,'retrieved');assert.ok(report.evidence.length>0);assert.equal(attempts,1);
 checks.push({name:'live_retrieval',passed:true});
 const second=await app.inject({method:'POST',url:'/api/claims/retrieve',payload});
 assert.equal(second.statusCode,200);
 const cached=EvidenceRetrievalReport.parse(second.json());
 assert.deepEqual(cached.evidence,report.evidence);assert.equal(cached.retrievedAt,report.retrievedAt);assert.equal(attempts,1);
 checks.push({name:'identical_request_uses_cache',passed:true});
 const blocked=await app.inject({method:'POST',url:'/api/claims/retrieve',payload:{version:'1',claim:'A different factual statement.'}});
 assert.equal(blocked.json().status,'budget_exhausted');assert.equal(attempts,1);
 checks.push({name:'different_query_blocked_by_budget',passed:true});
 console.log(`PASS live retrieval: ${report.evidence.length} source excerpts`);
 console.log('PASS identical request reused cache; different query blocked by budget');
}catch{
 console.error('Live retrieval check blocked or failed. No external retry was made. Inspect the local report; do not repeat automatically.');process.exitCode=1;
}finally{
 globalThis.fetch=upstream;
 try{await app?.close();}finally{await rm(directory,{recursive:true,force:true});}
 await mkdir('.local/tavily-live-check',{recursive:true});
 await writeFile('.local/tavily-live-check/report.json',JSON.stringify({createdAt:new Date().toISOString(),passed:checks.length===3,checks,externalSearchAttempts:attempts,expectedCredits:attempts?1:0,reportedCredits,modelRequests:0,result,notice:'Evidence retrieval and budget/cache checks only; sample claim has not been judged true or false. Expected credits are not an account billing audit.'},null,2));
 console.log(`${attempts} external search attempt(s), zero model requests. Report: .local/tavily-live-check/report.json`);
}
