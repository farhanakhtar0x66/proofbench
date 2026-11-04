import {expect,it,vi} from 'vitest';
import {selectEvidenceExcerpt,excerptQualityReason} from '../packages/tavily/src/excerpts';
import {retrieveClaimEvidence} from '../packages/tavily/src/general-retrieval';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {SearchBudget} from '../packages/tavily/src/budget';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';

const claim='Python 2 is currently supported.';
const statement='Python 2.7 reached end of life on January 1, 2020. It is no longer supported upstream.';
const packages=Array.from({length:45},(_item,index)=>`purl: pkg:deb/example/python3.${index}`).join('\n');

it('selects readable role passages instead of page navigation while retaining scope checks',()=>{
 const text=`Skip to main content\n${'Navigation item\n'.repeat(180)}\nThe President of the United States is Jordan Taylor.\nThe statement was published today.`;
 const result=selectEvidenceExcerpt('Alex is President of USA.',text);
 expect(result.excerpt).toContain('The President of the United States is Jordan Taylor.');
 expect(result.excerpt).not.toContain('Skip to main content');
});

it('finds a directly scoped paragraph after a long package list without rewriting or fetching a page',()=>{
 const content=`${packages}\n\n${statement}\n\nThis statement refers to upstream support; third-party contracts have separate terms.`;
 const result=selectEvidenceExcerpt(claim,content);
 expect(result.excerpt).toContain(statement);expect(result.excerpt).toContain('third-party contracts');expect(result.excerpt.length).toBeLessThanOrEqual(2400);
 expect(content.slice(result.selection.start,result.selection.end)).toBe(result.excerpt);expect(result.selection.warning).toBeUndefined();
});
it('retains all short source text, including denial, conditions, attribution and dates',()=>{
 const content='  According to the notice, Python 2 is not supported unless a separate vendor contract applies.\n\nThat vendor policy applies only in India from 2026.  ';
 const result=selectEvidenceExcerpt(claim,content);expect(result.excerpt).toBe(content.trim());expect(content.slice(result.selection.start,result.selection.end)).toBe(result.excerpt);
});
it('preserves paragraph qualifiers and abstains when the paragraph cannot fit',()=>{
 const content=`Python 2 is supported ${'under separately negotiated conditions '.repeat(90)}only by an independent vendor, not by the upstream project.`;
 const result=selectEvidenceExcerpt(claim,content);expect(result.excerpt).toHaveLength(2400);expect(result.selection.warning).toContain('cuts a paragraph');
});
it('keeps separated opposing passages together with explicit omission metadata',()=>{
 const content=`Python 2 is supported by Vendor A.\n\n${'Unrelated context '.repeat(180)}\n\nPython 2 is not supported upstream.`;
 const selected=selectEvidenceExcerpt(claim,content);
 expect(selected.excerpt).toContain('supported by Vendor A');expect(selected.excerpt).toContain('not supported upstream');
 expect(selected.passages).toHaveLength(2);expect(selected.excerpt).toContain('[...]');
});
it.each([
 packages,
 'Python 3 is supported with security fixes.',
 'Cloud client libraries are compatible with current Python versions.',
 'Python 2.7 has package identifiers listed here.',
])('flags weak product/version support context: %s',excerpt=>expect(excerptQualityReason(claim,excerpt)).toBeDefined());
it.each(['Python 2.7 reached end of life in 2020.','Python2 is not supported upstream.','Python 2 is supported only under an independent vendor agreement.'])('leaves semantic judgment to comparison for explicit scope: %s',excerpt=>expect(excerptQualityReason(claim,excerpt)).toBeUndefined());
it('selects role evidence without requiring the originally asserted person to appear',()=>{
 const content=`${'General navigation links '.repeat(70)}\n\nTaylor is the club captain of Acme FC.\n\nThe appointment applies for this season.`;
 const result=selectEvidenceExcerpt('Alex is captain of Acme FC.',content);expect(result.excerpt).toContain('Taylor is the club captain');expect(result.selection.warning).toBeUndefined();
});
it('bounds source inspection and discloses unseen context',()=>{
 const result=selectEvidenceExcerpt(claim,'x'.repeat(210000));expect(result.excerpt).toHaveLength(2400);expect(result.selection.warning).toContain('200,000');
});
it('reuses cached raw search text to select a useful passage and sends no additional search',async()=>{
 const content=`${packages}\n\n${statement}`;const now=new Date().toISOString();
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json({results:[{url:'https://example.com/python',content,published_date:now}]}));
 const options={mode:'live',allowLiveRequests:'true',apiKey:'fake',maxRequests:1,budget:new SearchBudget(),fetch:fetcher};
 const first=await retrieveClaimEvidence({version:'1',claim},options);const cached=await retrieveClaimEvidence({version:'1',claim},{...options,cacheOnly:true});
 expect(fetcher).toHaveBeenCalledOnce();expect(first.evidence).toEqual(cached.evidence);expect(first.evidence[0].excerpt).toBe(statement);
 const selection=first.evidence[0].excerptSelection!;expect(content.slice(selection.start,selection.end)).toBe(statement);
 expect(first.evidence[0].publishedAt).toBe(now);expect(first.evidence[0].relation).toBe('context');
});
it('keeps weak citations visible and avoids inference when only one support-scoped source remains',async()=>{
 const now=new Date().toISOString();const excerpts=[packages.slice(0,1100),'Cloud libraries support currently active Python versions.',statement];
 const evidence=EvidenceRetrievalReport.parse({version:'1',claim,query:claim,mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,message:'Simulated excerpts',limitations:[],evidence:excerpts.map((excerpt,index)=>({url:`https://source${index}.example`,title:'Source',excerpt,relation:'context',retrieval:'tavily',publishedAt:now,retrievedAt:now}))});
 const compareEvidence=vi.fn();const result=await compareClaimEvidence(evidence,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(result.outcome).toBe('inconclusive');expect(result.citations.map(source=>source.eligible)).toEqual([false,false,true]);expect(result.citations).toHaveLength(3);expect(compareEvidence).not.toHaveBeenCalled();
});
