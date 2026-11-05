import {expect,it,vi} from 'vitest';
import {selectEvidenceExcerpt,excerptQualityReason} from '../packages/tavily/src/excerpts';
import {supportTableExcerpt} from '../packages/tavily/src/support-table';
import {validPassageBundle,SOURCE_SCAN_LIMIT} from '../packages/tavily/src/source-passages';
import {publicationEstimateConflict} from '../packages/tavily/src/publication-metadata';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';
const claim='Lumen 2 is currently supported upstream.';
const table='Status of Lumen versions\nSupported versions\nBranch | Status | End of life\n3.1 | security | 2030-01-01\nUnsupported versions\nBranch | Status | End of life\n2.7 | end-of-life | 2020-01-01\n2.6 | end-of-life | 2019-01-01\n';
it('recovers family status rows with column/product context rather than selecting navigation',()=>{
 const content='Skip to content\n'+('Navigation item\n'.repeat(200))+table;
 const selected=selectEvidenceExcerpt(claim,content);
 expect(selected.excerpt).toContain('Status of Lumen versions');expect(selected.excerpt).toContain('2.7 | end-of-life');expect(selected.excerpt).toContain('2.6 | end-of-life');expect(selected.excerpt).toContain('Branch | Status');expect(selected.excerpt).not.toContain('Navigation item');expect(excerptQualityReason(claim,selected.excerpt)).toBeUndefined();
 expect(validPassageBundle({excerpt:selected.excerpt,excerptPassages:selected.passages,excerptSelection:selected.selection})).toBe(true);
 for(const part of selected.passages??[])expect(content.slice(part.start,part.end)).toBe(part.text);
});
it('retains conflicting statuses within a claimed family and preceding support conditions',()=>{
 const content=table.replace('Unsupported versions','Only vendor customers receive these updates.\nUnsupported versions').replace('2.6 | end-of-life','2.9 | security');
 const selected=supportTableExcerpt(claim,content)!;
 expect(selected.excerpt).toContain('Only vendor customers');expect(selected.excerpt).toContain('2.7 | end-of-life');expect(selected.excerpt).toContain('2.9 | security');
});
it.each([table.replaceAll('Lumen','Orbit'),table.replaceAll('2.7','20.7').replaceAll('2.6','20.6'),'Lumen supports products.\n2.7 | end-of-life | 2020-01-01',table+'x'.repeat(SOURCE_SCAN_LIMIT)])('refuses unsafe or unmatched table context',content=>expect(supportTableExcerpt(claim,content)).toBeUndefined());
it('does not treat a neighboring minor version as an exact match',()=>expect(supportTableExcerpt('Lumen 2.7 is supported.',table.replaceAll('2.7','2.70'))).toBeUndefined());
it('supports flattened table cells without inventing product names in each row',()=>{
 const content='Status of Lumen versions\nUnsupported versions\nBranch\nSchedule\nStatus\nFirst release\nEnd of life\n2.7\nSpecification A\nend-of-life\n2010-01-01\n2020-01-01\n2.6\nSpecification B\nend-of-life\n2009-01-01\n2019-01-01';
 const result=supportTableExcerpt(claim,content)!;expect(result.excerpt).toContain('2.7\nSpecification A\nend-of-life');expect(excerptQualityReason(claim,result.excerpt)).toBeUndefined();
});
const at='2026-11-05T10:00:00.000Z';
it('treats only past update/publication estimate ordering as a recency issue',()=>{
 const source={publishedAt:'2026-10-29T10:00:00Z',updatedAt:'2026-05-27T00:00:00Z',dateReason:'The update date conflicts with publication or current time.'};
 expect(publicationEstimateConflict(source,'Recent publication; dates are compatible.',at)).toBe(true);
 for(const dateReason of ['An explicit source date is invalid.','The text explicitly scopes this fact to a historical or future date.','An explicit effective or as-of date could not be parsed; its temporal scope is uncertain.'])expect(publicationEstimateConflict({...source,dateReason},dateReason,at)).toBe(false);
 expect(publicationEstimateConflict({...source,updatedAt:'2099-01-01'},source.dateReason,at)).toBe(false);
});
it('compares matching table evidence while keeping conflicting publication estimates unscored',async()=>{
 const data=EvidenceRetrievalReport.parse({version:'1',claim,query:claim,searchScope:'current',mode:'live',status:'retrieved',createdAt:new Date().toISOString(),retrievedAt:new Date().toISOString(),message:'Synthetic',limitations:[],evidence:[0,1].map(i=>({url:`https://source${i}.example/versions`,title:'Synthetic',excerpt:table,retrievedAt:new Date().toISOString(),publishedAt:'2026-10-29T10:00:00.000Z',updatedAt:'2026-05-27T00:00:00.000Z',dateReason:'The update date conflicts with publication or current time.',retrieval:'tavily',relation:'context'}))});
 // Avoid counting substantially copied pages as independent corroboration.
 data.evidence[1].excerpt=table.replace('2.6 | end-of-life | 2019-01-01','2.5 | retired | 2018-01-01');
 const interpreter={interpret:vi.fn(),compareEvidence:vi.fn(async(text:string)=>({assessments:JSON.parse(text).sources.map((s:{sourceId:string;excerpt:string})=>({sourceId:s.sourceId,quote:s.excerpt,relation:'contradicts'})),correction:null}))};
 const result=await compareClaimEvidence(data,{mode:'llm',interpreter});expect(interpreter.compareEvidence).toHaveBeenCalledOnce();expect(result.citations[0].eligible).toBe(true);expect(result.freshnessScore).toBeNull();expect(result.freshness).toBe('unknown');
 expect(result.citations[0].dateReason).toContain('publication recency is unconfirmed');
 data.searchScope='as_stated';expect((await compareClaimEvidence(data,{mode:'llm',interpreter})).outcome).toBe('inconclusive');
});

it('uses an actual product heading rather than a product name appearing only inside a link',()=>{
 const content=table.replace('Status of Lumen versions','Status of Lumen versions\n(See older versions at example.org/Lumen.)');
 expect(supportTableExcerpt(claim,content)?.excerpt).toContain('Status of Lumen versions');
 expect(supportTableExcerpt(claim,table.replace('Status of Lumen versions','Older versions at example.org/Lumen.'))).toBeUndefined();
});
