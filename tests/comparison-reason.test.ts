import {expect,it} from 'vitest';
import {comparisonReason} from '../packages/tavily/src/comparison-reason';
import {createBifrostInterpreter} from '../packages/tavily/src/bifrost-interpreter';
import {compareGeneralClaim} from '../packages/tavily/src/analysis';
import {SearchBudget} from '../packages/tavily/src/budget';

it.each([
 ['Cannot connect to Bifrost. Start the local gateway.','model_unavailable','failed'],
 ['The model gateway reported a rate limit.','rate_limited','failed'],
 ['The model provider is temporarily unavailable or busy (HTTP 503). No verdict was reached.','provider_busy','failed'],
 ['The model request timed out at the client.','model_timeout','failed'],
 ['The model returned an invalid or incomplete structured response.','invalid_model_response','failed'],
 ['The hosted model request budget is exhausted.','budget_exhausted','blocked'],
 ['Fewer than two distinct source groups pass checks.','insufficient_sources','blocked'],
])('reports an actionable reason for %s',(explanation,code,status)=>{
 const result=comparisonReason('inconclusive',explanation);
 expect(result.reasonCode).toBe(code);expect(result.verificationStatus).toBe(status);expect(result.shortReason.length).toBeLessThan(181);
});
it('distinguishes uncertain evidence from a failed verification attempt',()=>{
 expect(comparisonReason('inconclusive','Source assessments conflict.',true)).toMatchObject({reasonCode:'conflicting_evidence',verificationStatus:'completed'});
 expect(comparisonReason('supported','',true)).toMatchObject({reasonCode:'supported',verificationStatus:'completed'});
 expect(comparisonReason('inconclusive','',false,true).reasonCode).toBe('offline');
});
it('exposes a safe connection error without leaking underlying exception content',async()=>{
 const env={BIFROST_LLM_PROVIDER:'gemini',BIFROST_LLM_MODEL:'gemini/test',GEMINI_API_KEY:'fake',BIFROST_FREE_TIER_CONFIRMED:'true',BIFROST_LLM_MAX_REQUESTS:'1'};
 const adapter=createBifrostInterpreter(env,async()=>{throw new Error('private credentials must not appear');});
 await expect(adapter.interpret('Example')).rejects.toThrow();
 expect(adapter.unavailableReason?.()).toContain('Cannot connect to Bifrost');
 expect(adapter.unavailableReason?.()).not.toContain('private credentials');
});
it('does not spend a Tavily search when the gateway health check fails',async()=>{
 const requests:string[]=[];
 const adapter=createBifrostInterpreter({BIFROST_LLM_PROVIDER:'gemini',BIFROST_LLM_MODEL:'gemini/test',GEMINI_API_KEY:'fake',BIFROST_FREE_TIER_CONFIRMED:'true',BIFROST_LLM_MAX_REQUESTS:'1'},async url=>{requests.push(String(url));throw new Error('Connection refused');});
 const result=await compareGeneralClaim({version:'1',claim:'An unfamiliar company owns another company.'},{tavilyMode:'live',budget:new SearchBudget(),interpreter:adapter,extractionMode:'rules',comparisonMode:'llm'});
 expect(requests).toEqual(['http://127.0.0.1:8080/health']);
 expect(result.comparison).toMatchObject({outcome:'inconclusive',reasonCode:'model_unavailable',verificationStatus:'failed'});
});
