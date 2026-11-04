import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {currencyAmbiguityReason} from '../packages/tavily/src/claim-ambiguity';
import {createApp} from '../apps/api/src/app';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {prepareVerificationBenchmark} from '../scripts/verification-benchmark-lib';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it.each(['Acme Pro costs $20/month.','Acme Pro costs $ 20/month in the US.','In the US $20 is the monthly price.','Acme costs $20 and Beta costs USD $25.'])('requires each dollar amount to state its own currency: %s',claim=>expect(currencyAmbiguityReason(claim)).toContain('explicit currency'));
it.each(['Acme Pro costs USD 20/month.','Acme Pro costs USD $20/month.','Acme Pro costs US$20/month.','Acme Pro costs $20 USD per month.','Acme Pro costs $20/month (CAD).','Acme costs AUD $20 and Beta costs CAD $25.'])('keeps explicitly identified currency for normal comparison: %s',claim=>expect(currencyAmbiguityReason(claim)).toBeUndefined());
it('retains existing evidence and abstains before invoking an overconfident model',async()=>{
 const snapshot=await prepareVerificationBenchmark();const input=snapshot.cases.find(item=>item.id==='ambiguous-currency')!.evidence;
 const compareEvidence=vi.fn();const result=await compareClaimEvidence(input,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(result.outcome).toBe('inconclusive');expect(result.correction).toBeNull();expect(result.explanation).toContain('currency');expect(result.citations).toHaveLength(2);expect(compareEvidence).not.toHaveBeenCalled();
});
it('makes no new search/model call for ambiguous analysis with live mode configured',async()=>{
 const env={LANGUAGE_MODE:'bifrost',CLAIM_EXTRACTION_MODE:'rules',EVIDENCE_COMPARISON_MODE:'llm',BIFROST_LLM_PROVIDER:'gemini',BIFROST_LLM_MODEL:'gemini/test',BIFROST_FREE_TIER_CONFIRMED:'true',BIFROST_LLM_MAX_REQUESTS:'1',GEMINI_API_KEY:'fake',ALLOW_PAID_REQUESTS:'true',TAVILY_API_KEY:'fake',TAVILY_MAX_REQUESTS:'1'};
 for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Forbidden'));
 const directory=await mkdtemp(join(tmpdir(),'b05-currency-'));const app=await createApp({implementation:'mock',tavilyMode:'live',dataDir:directory});
 try{
  const response=await app.inject({method:'POST',url:'/api/analysis',payload:{version:'1',text:'Acme Pro costs $20/month.'}});
  expect(response.statusCode).toBe(201);const result=response.json().results[0].comparison;
  expect(result.outcome).toBe('inconclusive');expect(result.correction).toBeNull();expect(result.explanation).toContain('explicit currency');expect(network).not.toHaveBeenCalled();
 }finally{await app.close();await rm(directory,{recursive:true,force:true});}
},20000);
