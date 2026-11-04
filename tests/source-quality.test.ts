import {expect,it,vi} from 'vitest';
import {excerptQualityReason,selectEvidenceExcerpt} from '../packages/tavily/src/excerpts';
import {retrieveClaimEvidence} from '../packages/tavily/src/general-retrieval';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {SearchBudget} from '../packages/tavily/src/budget';

const claim='Alex is CEO of Acme.';
const svg="%3Cpath d='M16.0001 7.9996c0 4.418-3.5815 7.9996' fill='url(%23paint1_radial)'/%3E".repeat(10);
const login='Create new account. See more on Facebook. Email or phone number. Password. Log In. Forgot account?';
const caption='Image: Acme CEO Taylor on stage (Photo by Example photographer).';
const content='Taylor is CEO of Acme. The company announced the appointment in its leadership notice.';
const recent=new Date(Date.now()-86400000).toISOString();
const options={mode:'live',allowPaidRequests:'true',apiKey:'fake',maxRequests:1};

it.each([svg,login,caption])('flags unreadable/walled/caption-only text without rewriting it',text=>{
 expect(excerptQualityReason(claim,text)).toBeDefined();
 const selected=selectEvidenceExcerpt(claim,text);expect(selected.excerpt).toBe(text);expect(selected.selection.warning).toBeDefined();
});
it('detects a login form even when padded with unrelated feed text',()=>{
 const text=`${'Unrelated market headline. '.repeat(27)}\n\n${login}`;
 expect(excerptQualityReason(claim,text)).toContain('login or subscription');
});
it.each([
 'The company reported that customers must log in to view invoices. Taylor is CEO of Acme.',
 '<b>Taylor</b> is CEO of Acme. The announcement preserves ordinary formatting.',
 `Image: Taylor on stage.\n\n${content}`,
 `${content} ${'Company operations and products are discussed. '.repeat(20)} Sign in. Create account. Forgot password?`,
])('does not reject readable text merely mentioning login, formatting or an accompanying caption',text=>expect(excerptQualityReason(claim,text)).toBeUndefined());
it('chooses a fitting passage after an equally relevant oversized one but retains the omitted-context warning',()=>{
 const original=`Acme CEO discussion ${'with important qualifications '.repeat(60)}\n\n${content}`;
 const selected=selectEvidenceExcerpt(claim,original);
 expect(selected.excerpt).toBe(content);expect(selected.selection.start).toBeGreaterThan(1200);
 expect(selected.selection.warning).toContain('Other potentially relevant');expect(original.slice(selected.selection.start,selected.selection.end)).toBe(selected.excerpt);
});
it('uses one six-candidate Basic search and selects readable scoped evidence without guessing the asserted holder',async()=>{
 const raw=[svg,login,caption,content,`${content} A separate publication records this appointment.`,content].map((text,index)=>({url:`https://source${index}.example/notice`,title:'Unreviewed source',content:text,...(index===5?{}:{published_date:recent})}));
 const fetcher=vi.fn<typeof fetch>(async(_url,init)=>{
  const body=JSON.parse(String(init?.body));expect(body.max_results).toBe(6);expect(body.search_depth).toBe('basic');expect(body.auto_parameters).toBe(false);expect(body.include_raw_content).toBe('text');expect(body.exclude_domains).toEqual(['facebook.com']);
  return Response.json({results:raw});
 });
 const settings={...options,fetch:fetcher,budget:new SearchBudget()};
 const first=await retrieveClaimEvidence({version:'1',claim,scope:'current'},settings);
 const alternate=await retrieveClaimEvidence({version:'1',claim:'Taylor is CEO of Acme.',scope:'current'},settings);
 expect(fetcher).toHaveBeenCalledOnce();expect(first.evidence.map(source=>source.url)).toEqual(raw.slice(3).map(source=>source.url));
 expect(alternate.evidence.map(source=>source.url)).toEqual(first.evidence.map(source=>source.url));
 expect(first.evidence.every(source=>source.sourceTier==='unreviewed'&&source.relation==='context')).toBe(true);
 expect(first.evidence[2].publishedAt).toBeUndefined();expect(first.evidence[2].dateReason).toContain('missing');
 expect(first.limitations.join(' ')).toContain('Omitted candidates are not assessed');
});
it('prefers distinct source groups rather than filling all slots with one hostname family',async()=>{
 const results=['https://news.example.com/a','https://news.example.com/b','https://docs.example.com/c','https://second.example/notice','https://third.example/notice'].map(url=>({url,content,published_date:recent}));
 const report=await retrieveClaimEvidence({version:'1',claim,scope:'current'},{...options,fetch:async()=>Response.json({results})});
 expect(report.evidence.map(source=>source.url)).toEqual([results[0].url,results[3].url,results[4].url]);
});
it('preserves literal provider order when as_stated scope is selected',async()=>{
 const results=[svg,content,content,content].map((text,index)=>({url:`https://source${index}.example`,content:text,published_date:recent}));
 const report=await retrieveClaimEvidence({version:'1',claim,scope:'as_stated'},{...options,fetch:async()=>Response.json({results})});
 expect(report.evidence.map(source=>source.url)).toEqual(results.slice(0,3).map(source=>new URL(source.url).href));expect(report.evidence[0].excerptSelection?.warning).toContain('markup');
});
it('keeps unusable excerpts visible and ineligible even if the provider ignores domain exclusion',async()=>{
 const results=[svg,login,caption].map((text,index)=>({url:`https://source${index}.example/Acme-CEO-Alex`,title:'Acme CEO Alex official announcement',content:text,published_date:recent}));
 const retrieved=await retrieveClaimEvidence({version:'1',claim,scope:'current'},{...options,fetch:async()=>Response.json({results})});
 // Remove selection warnings to check the independent comparison quality guard.
 for(const source of retrieved.evidence)delete source.excerptSelection;
 const compareEvidence=vi.fn();const result=await compareClaimEvidence(retrieved,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(result.outcome).toBe('inconclusive');expect(result.citations).toHaveLength(3);expect(result.citations.every(source=>!source.eligible)).toBe(true);expect(compareEvidence).not.toHaveBeenCalled();
});
it('does not reuse an older search profile or bypass the shared search budget',async()=>{
 const budget=new SearchBudget();await budget.search(claim,'fake',1,async()=>[]);
 const fetcher=vi.fn();const report=await retrieveClaimEvidence({version:'1',claim},{...options,budget,fetch:fetcher});
 expect(report.status).toBe('budget_exhausted');expect(fetcher).not.toHaveBeenCalled();
});
