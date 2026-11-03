import {expect,it,vi} from 'vitest';
import {supportClaimSubject} from '../packages/tavily/src/support-scope';
import {evidenceSearchPlan} from '../packages/tavily/src/search-plan';
import {retrieveClaimEvidence} from '../packages/tavily/src/general-retrieval';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {SearchBudget} from '../packages/tavily/src/budget';

it.each([
 ['Python 2 is currently supported.','Python 2'],
 ['Python 2 is not currently supported.','Python 2'],
 ['Python 2 is no longer supported.','Python 2'],
 ['Node.js 18 is supported.','Node.js 18'],
 ['Acme SDK 2.1 is not supported.','Acme SDK 2.1'],
])('searches explicit lifecycle claims neutrally without a recent-publication filter: %s',(claim,subject)=>{
 expect(supportClaimSubject(claim)).toBe(subject);
 expect(evidenceSearchPlan(claim,'current')).toEqual({query:`${subject} support status end of life official documentation`,dateWindow:undefined});
 expect(evidenceSearchPlan(claim).query).toBe(claim);
});
it.each([
 'If approved, Python 2 is supported.',
 'According to the report, Python 2 is currently supported.',
 'Python 2 was supported in 2019.',
 'Python 2 might be supported.',
 'Python 2 is supported only under a vendor contract.',
 'Python 2 is supported in India.',
 'Python 2 in 2019 is supported.',
 'Python 2 and Acme SDK are supported.',
 'It is supported.',
])('does not silently remove conditions, time, attribution or ambiguity: %s',claim=>{
 expect(supportClaimSubject(claim)).toBeUndefined();
 const plan=evidenceSearchPlan(claim,'current');expect(plan.query).toBe(`${claim} current official sources`);expect(plan.dateWindow).toBeDefined();
});
it('leaves pricing and role recency windows in place',()=>{
 expect(evidenceSearchPlan('Acme Pro costs USD 20/month.','current').dateWindow).toBeDefined();
 expect(evidenceSearchPlan('Alex is captain of Acme FC.','current').dateWindow).toBeDefined();
});
it('retrieves older lifecycle announcements with warnings, preserves the claim and reuses the existing cache',async()=>{
 const claim='Python 2 is currently supported.';
 const raw=['first.example','second.example'].map(host=>({url:`https://${host}/announcement`,title:'Historical support announcement',content:'Python 2 reached end of life in 2020 and is no longer supported upstream.',published_date:'2020-01-01'}));
 const fetcher=vi.fn<typeof fetch>(async(_url,init)=>{
  const body=JSON.parse(String(init?.body));expect(body.query).toBe('Python 2 support status end of life official documentation');expect(body.search_depth).toBe('basic');expect(body.auto_parameters).toBe(false);expect(body.include_published_date).toBe(true);expect(body.max_results).toBe(3);
  for(const key of ['start_date','end_date','filter_by_published_date'])expect(body).not.toHaveProperty(key);
  return Response.json({results:raw});
 });
 const options={mode:'live',allowPaidRequests:'true',apiKey:'fake',maxRequests:1,budget:new SearchBudget(),fetch:fetcher};
 const report=await retrieveClaimEvidence({version:'1',claim,scope:'current'},options);
 expect(report.claim).toBe(claim);expect(report.searchScope).toBe('current');expect(report.searchWindow).toBeUndefined();expect(report.evidence).toHaveLength(2);
 expect(report.evidence.every(source=>source.publishedAt==='2020-01-01T00:00:00.000Z'&&source.dateReason?.includes('older than 30 days')&&source.sourceTier==='unreviewed'&&source.relation==='context')).toBe(true);
 expect(report.limitations.join(' ')).toContain('no publication-date filter');
 const compareEvidence=vi.fn();const result=await compareClaimEvidence(report,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(result.outcome).toBe('inconclusive');expect(result.correction).toBeNull();expect(result.citations.every(source=>!source.eligible)).toBe(true);expect(compareEvidence).not.toHaveBeenCalled();
 await retrieveClaimEvidence({version:'1',claim,scope:'current'},options);expect(fetcher).toHaveBeenCalledOnce();
});
