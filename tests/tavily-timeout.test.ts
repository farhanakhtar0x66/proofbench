import {afterEach,expect,it,vi} from 'vitest';
import {searchTavily,tavilyTimeoutMs,TavilyConfigurationError} from '../packages/tavily/src/index';
import {TavilyRetrievalError} from '../packages/tavily/src/retrieval-errors';
import {retrieveClaimEvidence} from '../packages/tavily/src/general-retrieval';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {SearchBudget} from '../packages/tavily/src/budget';
function fakeDeadlines(){
 vi.useFakeTimers();vi.spyOn(AbortSignal,'timeout').mockImplementation(ms=>{const controller=new AbortController();setTimeout(()=>controller.abort(new DOMException('deadline','TimeoutError')),ms);return controller.signal;});
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.useRealTimers();});
it('uses a bounded 20-second default and honors explicit configuration',()=>{
 vi.stubEnv('TAVILY_TIMEOUT_MS',undefined);expect(tavilyTimeoutMs()).toBe(20000);expect(tavilyTimeoutMs('30000')).toBe(30000);expect(tavilyTimeoutMs(1000)).toBe(1000);
});
it.each(['0','999','30001','Infinity','not-a-number','2.5',''])('rejects an unsafe timeout without sending a request: %s',async timeoutMs=>{
 const fetcher=vi.fn();await expect(searchTavily('Synthetic','fake',fetcher,{timeoutMs})).rejects.toBeInstanceOf(TavilyConfigurationError);expect(fetcher).not.toHaveBeenCalled();
});
it('allows a single 12-second response rather than cutting it off at the old 10-second deadline',async()=>{
 fakeDeadlines();vi.stubEnv('TAVILY_TIMEOUT_MS',undefined);
 const fetcher=vi.fn<typeof fetch>((_url,init)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>resolve(Response.json({results:[]})),12000);
  init?.signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(init.signal!.reason);},{once:true});
 }));
 const pending=searchTavily('Synthetic','fake',fetcher);let resolved=false;void pending.then(()=>{resolved=true;});
 await vi.advanceTimersByTimeAsync(10000);expect(resolved).toBe(false);
 await vi.advanceTimersByTimeAsync(2000);expect(await pending).toEqual([]);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('keeps the deadline active during a stalled response body and reports its configured duration',async()=>{
 fakeDeadlines();
 const fetcher=vi.fn<typeof fetch>(async(_url,init)=>new Response(new ReadableStream({start(controller){init?.signal?.addEventListener('abort',()=>controller.error(init.signal!.reason),{once:true});}})));
 const result=searchTavily('Synthetic','fake',fetcher,{timeoutMs:1000}).catch(error=>error);
 await vi.advanceTimersByTimeAsync(1000);const error=await result;
 expect(error).toBeInstanceOf(TavilyRetrievalError);expect(error.message).toContain('configured deadline: 1s');expect(error.message).toContain('No retry');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('charges only one attempt on timeout and never calls a model without retrieved evidence',async()=>{
 fakeDeadlines();vi.stubEnv('TAVILY_TIMEOUT_MS','1000');
 const fetcher=vi.fn<typeof fetch>((_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(init.signal!.reason),{once:true})));
 const options={mode:'live',allowLiveRequests:'true',apiKey:'fake',maxRequests:1,budget:new SearchBudget(),fetch:fetcher};
 const pending=retrieveClaimEvidence({version:'1',claim:'A synthetic claim.',scope:'current'},options);
 await vi.advanceTimersByTimeAsync(1000);const report=await pending;
 expect(report.status).toBe('unavailable');expect(report.message).toContain('configured deadline: 1s');
 const interpreter={interpret:vi.fn(),compareEvidence:vi.fn()};const comparison=await compareClaimEvidence(report,{mode:'llm',interpreter});
 expect(comparison).toMatchObject({outcome:'inconclusive',verificationStatus:'failed',reasonCode:'retrieval_timeout'});expect(comparison.freshnessScoreReason).toContain('retrieval failed');expect(interpreter.compareEvidence).not.toHaveBeenCalled();
 const next=await retrieveClaimEvidence({version:'1',claim:'A different claim.',scope:'current'},options);expect(next.status).toBe('budget_exhausted');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('validates configuration before consuming an allowance',async()=>{
 vi.stubEnv('TAVILY_TIMEOUT_MS','0');const budget=new SearchBudget();const fetcher=vi.fn();
 await expect(retrieveClaimEvidence({version:'1',claim:'Synthetic'},{mode:'live',allowLiveRequests:'true',apiKey:'fake',maxRequests:1,budget,fetch:fetcher})).rejects.toBeInstanceOf(TavilyConfigurationError);
 expect(budget.snapshot(1)).toEqual({used:0,limit:1,remaining:1});expect(fetcher).not.toHaveBeenCalled();
});
