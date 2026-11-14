import {expect,it,vi} from 'vitest';
import {evidenceOverlapTracker} from '../packages/tavily/src/evidence-overlap';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';

const passage='The company announced that the revised subscription price applies to all new monthly customers in the specified region under the newly announced subscription policy, while existing annual agreements retain their previously agreed terms.';

it('detects a substantial shared sentence despite different surrounding reporting',()=>{
 const overlaps=evidenceOverlapTracker();
 expect(overlaps(`Company announcement. ${passage}`)).toBe(false);
 expect(overlaps(`${passage} The reporter added a separate comment.`)).toBe(true);
});
it('normalizes case, whitespace and Unicode presentation for duplicate passages',()=>{
 const overlaps=evidenceOverlapTracker();
 expect(overlaps(passage)).toBe(false);
 expect(overlaps(`Other context. ${passage.toUpperCase().replaceAll(' ','  ')}`)).toBe(true);
});
it('does not treat a short shared factual sentence as copying',()=>{
 const overlaps=evidenceOverlapTracker();
 expect(overlaps('Acme Pro costs USD 25/month. One report provides regional detail.')).toBe(false);
 expect(overlaps('Acme Pro costs USD 25/month. Another report describes the effective date.')).toBe(false);
});
it('does not claim to detect paraphrases or unrelated long passages',()=>{
 const overlaps=evidenceOverlapTracker();overlaps(passage);
 expect(overlaps('Under the new policy, subscribers joining on monthly terms will pay the updated amount; annual contracts are unchanged.')).toBe(false);
});
it('keeps overlap state isolated to one comparison',()=>{
 const first=evidenceOverlapTracker();first(passage);
 expect(evidenceOverlapTracker()(passage)).toBe(false);
});

function input(excerpts:string[]){
 const now=new Date().toISOString();
 return EvidenceRetrievalReport.parse({version:'1',claim:'Acme changed its subscription terms.',query:'Acme subscription terms',mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,message:'Synthetic test sources',limitations:[],evidence:excerpts.map((excerpt,index)=>({url:`https://source${index}.example/story`,title:'Report',excerpt,relation:'context',retrieval:'tavily',publishedAt:now,retrievedAt:now}))});
}
it('retains both citations but avoids inference when repeated reporting is the only corroboration',async()=>{
 const compareEvidence=vi.fn();
 const result=await compareClaimEvidence(input([`Announcement. ${passage}`,`${passage} Additional commentary.`]),{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(result.outcome).toBe('inconclusive');expect(result.correction).toBeNull();
 expect(result.citations).toHaveLength(2);expect(result.citations[0].eligible).toBe(true);expect(result.citations[1].eligible).toBe(false);
 expect(result.citations[1].dateReason).toContain('substantial shared sentence');
 expect(compareEvidence).not.toHaveBeenCalled();
});
it('allows a third distinct report to proceed without counting the overlapping report',async()=>{
 const data=input([`Announcement. ${passage}`,`${passage} Additional commentary.`,'A separate report explicitly describes the subscription terms and confirms the change.']);
 const compareEvidence=vi.fn(async()=>({assessments:data.evidence.map((source,index)=>({sourceId:`S${index+1}`,quote:source.excerpt,relation:'supports'})),correction:null}));
 const result=await compareClaimEvidence(data,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(compareEvidence).toHaveBeenCalledOnce();expect(result.outcome).toBe('supported');
 expect(result.citations.map(source=>source.eligible)).toEqual([true,false,true]);
});
