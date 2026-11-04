import {expect,it,vi} from 'vitest';
import {retrieveClaimEvidence} from '../packages/tavily/src/general-retrieval';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {searchTavily} from '../packages/tavily/src/index';
import {SearchBudget} from '../packages/tavily/src/budget';
import {retrievalRanking} from '../packages/tavily/src/retrieval-ranking';

const claim='Alex is CEO of Acme.';
const now=new Date().toISOString();
const settings={mode:'live',allowPaidRequests:'true',apiKey:'fake',maxRequests:1};
const page=(url:string,raw_content:string,content='Image: Alex on stage.')=>({url,title:'Acme leadership',content,raw_content,published_date:now});
it('recovers complete role passages from page text in one Basic search and reuses the same cache',async()=>{
 const texts=['Taylor is CEO of Acme. This is the current leadership profile.','Acme names Taylor as its current CEO. The appointment is described in this leadership notice.'];
 const raw=texts.map((text,index)=>page(`https://source${index}.example/profile`,text));
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
  expect(String(url)).toBe('https://api.tavily.com/search');
  expect(JSON.parse(String(init?.body))).toMatchObject({search_depth:'basic',include_raw_content:'text',auto_parameters:false});
  return Response.json({results:raw});
 });
 const options={...settings,fetch:fetcher,budget:new SearchBudget()};
 const report=await retrieveClaimEvidence({version:'1',claim,scope:'current'},options);
 expect(report.evidence.map(source=>source.excerpt)).toEqual(texts);
 expect(report.evidence.every(source=>source.excerptSelection?.reason.includes('returned page text')&&!source.excerptSelection.warning)).toBe(true);
 const compareEvidence=vi.fn(async()=>({assessments:texts.map((quote,index)=>({sourceId:`S${index+1}`,relation:'contradicts',quote})),correction:null}));
 expect((await compareClaimEvidence(report,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}})).outcome).toBe('contradicted');
 await retrieveClaimEvidence({version:'1',claim:'Taylor is CEO of Acme.',scope:'current'},options);
 expect(fetcher).toHaveBeenCalledOnce();expect(compareEvidence).toHaveBeenCalledOnce();
});
it('does not hide full-page conditions behind a cleaner search snippet',async()=>{
 const raw='Taylor is CEO of Acme only if the board approves. The appointment remains conditional.';
 const report=await retrieveClaimEvidence({version:'1',claim,scope:'current'},{...settings,fetch:async()=>Response.json({results:[page('https://source.example',raw,'Taylor is CEO of Acme.')]})});
 expect(report.evidence[0].excerpt).toBe(raw);
});
it('retains snippet fallback and can use a raw-only result without fabricating missing page text',async()=>{
 const results=[{url:'https://one.example',content:'Taylor is CEO of Acme.',raw_content:null,published_date:now},{url:'https://two.example',content:null,raw_content:'Taylor is CEO of Acme. The profile is current.',published_date:now}];
 const report=await retrieveClaimEvidence({version:'1',claim},{...settings,fetch:async()=>Response.json({results})});
 expect(report.evidence).toHaveLength(2);expect(report.evidence[0].excerptSelection?.reason).toContain('snippet; page text unavailable');
 expect(report.evidence[1].excerptSelection?.reason).toContain('returned page text');
});
it('keeps full-text date warnings after passage selection omits the date label',async()=>{
 const raw=`Taylor is CEO of Acme.\n\n${'Unrelated housekeeping information. '.repeat(40)}\n\nLast updated on 03/11/2026`;
 const results=[0,1].map(index=>page(`https://source${index}.example`,raw));
 const report=await retrieveClaimEvidence({version:'1',claim,scope:'current'},{...settings,fetch:async()=>Response.json({results})});
 expect(report.evidence[0].dateReason).toContain('could not be parsed');expect(report.evidence[0].excerpt).not.toContain('03/11/2026');
 const model=vi.fn();const comparison=await compareClaimEvidence(report,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence:model}});
 expect(comparison.citations.every(source=>!source.eligible)).toBe(true);expect(model).not.toHaveBeenCalled();
});
it('retains scan-limit warnings instead of treating a bounded raw scan as a full-page review',async()=>{
 const raw=`Taylor is CEO of Acme.\n\n${'Background. '.repeat(2000)}`;
 const report=await retrieveClaimEvidence({version:'1',claim},{...settings,fetch:async()=>Response.json({results:[page('https://source.example',raw)]})});
 expect(report.evidence[0].excerptSelection?.warning).toContain('20,000');
 expect(report.evidence[0].excerptSelection?.sourceLength).toBe(raw.length);
});
it('prefers a matching website hint only after relevance/quality, without promoting source authority',async()=>{
 const results=[page('https://unrelated.example','An unrelated sports report.','Unrelated'),page('https://secondary.example','Taylor is CEO of Acme. This report describes current leadership.'),page('https://acme.com/leadership','Taylor is CEO of Acme. This profile describes current leadership.'),page('https://third.example','Acme has Taylor as its current CEO. This is a company leadership notice.')];
 const report=await retrieveClaimEvidence({version:'1',claim,scope:'current'},{...settings,fetch:async()=>Response.json({results})});
 expect(report.evidence[0].url).toBe('https://acme.com/leadership');
 expect(report.evidence.every(source=>source.sourceTier==='unreviewed'&&source.relation==='context')).toBe(true);
 expect(report.evidence[0].sourceReason).toContain('not verified ownership');
 expect(report.evidence.some(source=>source.url.includes('unrelated'))).toBe(false);
});
it('does not infer ownership from a title, an insecure/lookalike hostname or a query holder name',()=>{
 for(const url of ['http://acme.com/leadership','https://acme.fake.com/leadership','https://acme-news.com/leadership'])expect(retrievalRanking(claim,{url,title:'Acme leadership',excerpt:'Taylor is CEO of Acme.'},now).identityHint).toBe(false);
 const source={url:'https://acme.com/leadership',title:'Acme leadership',excerpt:'Taylor is CEO of Acme.'};
 expect(retrievalRanking(claim,source,now)).toEqual(retrievalRanking('Taylor is CEO of Acme.',source,now));
});
it('bounds raw responses, consumes no retry and leaves the legacy search profile unchanged',async()=>{
 const fetcher=vi.fn<typeof fetch>(async(_url,init)=>{
  expect(JSON.parse(String(init?.body))).toMatchObject({include_raw_content:false,max_results:3});
  return Response.json({results:[{url:'https://source.example',raw_content:'x'.repeat(2*1024*1024)}]});
 });
 await expect(searchTavily(claim,'fake',fetcher)).rejects.toThrow('invalid evidence');expect(fetcher).toHaveBeenCalledOnce();
});
