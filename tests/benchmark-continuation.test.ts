import {expect,it} from 'vitest';
import {prepareVerificationBenchmark} from '../scripts/verification-benchmark-lib';
import {PreparedBenchmark} from '../scripts/run-verification-benchmark-lib';
import {prepareBenchmarkContinuation,prepareBenchmarkTail} from '../scripts/resume-verification-benchmark';

async function fixture(){
 const snapshot=PreparedBenchmark.parse(await prepareVerificationBenchmark());
 const previous={model:'gemini/test',datasetHash:snapshot.datasetHash,evidenceHash:snapshot.evidenceHash,modelRequests:5,realTavilyRequests:0,result:{status:'incomplete',rows:snapshot.cases.map((item,index)=>({id:item.id,expected:item.expected,status:index<4?'completed':index===4?'failed':'not_run',modelRequests:index<5?1:0,outcome:index<4?item.expected:index===4?'inconclusive':null,correct:index<4?true:null,falseDecisive:false,latencyMs:1,explanation:'Synthetic previous run'}))}};
 return {snapshot,previous};
}
it('continues only five unrun cases within the four remaining calls and resolves currency offline',async()=>{
 const {snapshot,previous}=await fixture();const continuation=await prepareBenchmarkContinuation(snapshot,JSON.stringify(previous));
 expect(continuation.maxRequests).toBe(4);expect(continuation.remainingSnapshot.cases).toHaveLength(5);expect(continuation.reassessed.status).toBe('precheck_abstained');expect(continuation.reassessed.modelRequests).toBe(0);expect(continuation.parentHash).toMatch(/^[a-f0-9]{64}$/u);
 expect(continuation.remainingSnapshot.cases.map(item=>item.id)).not.toContain('ambiguous-currency');expect(continuation.merge([]).slice(0,4)).toEqual(previous.result.rows.slice(0,4));
});
it('rejects changed evidence, mismatched counts and an unrelated failure',async()=>{
 const {snapshot,previous}=await fixture();
 await expect(prepareBenchmarkContinuation(snapshot,JSON.stringify({...previous,evidenceHash:'changed'}))).rejects.toThrow('evidence');
 await expect(prepareBenchmarkContinuation(snapshot,JSON.stringify({...previous,modelRequests:6}))).rejects.toThrow('counts');
 previous.result.rows[4].id='other-failure';await expect(prepareBenchmarkContinuation(snapshot,JSON.stringify(previous))).rejects.toThrow();
});
it('finishes only untouched tail cases without retrying either prior failure',async()=>{
 const {snapshot,previous}=await fixture();const raw=JSON.stringify(previous);const first=await prepareBenchmarkContinuation(snapshot,raw);
 const rows=structuredClone(previous.result.rows);
 rows[4]={...rows[4],status:'precheck_abstained',modelRequests:0,correct:true};
 for(const index of [5,6])rows[index]={...rows[index],status:'completed',modelRequests:1,outcome:'inconclusive',correct:true};
 rows[7]={...rows[7],status:'failed',modelRequests:1,outcome:'inconclusive'};
 const stage={...previous,modelRequests:3,priorModelRequests:5,totalModelRequests:8,parentReportHash:first.parentHash,result:{status:'incomplete',rows}};
 const tail=await prepareBenchmarkTail(snapshot,raw,JSON.stringify(stage));
 expect(tail.maxRequests).toBe(1);expect(tail.priorRequests).toBe(8);expect(tail.priorFailures).toBe(2);expect(tail.remainingSnapshot.cases.map(item=>item.id)).toEqual(['missing-evidence','pricing-paraphrase']);
 expect(tail.merge([])[7].status).toBe('failed');
 await expect(prepareBenchmarkTail(snapshot,raw,JSON.stringify({...stage,totalModelRequests:7}))).rejects.toThrow('totals');
});
