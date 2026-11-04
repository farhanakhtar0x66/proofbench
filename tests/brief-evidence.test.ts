import {expect,it,vi} from 'vitest';
import {briefEvidence} from '../packages/tavily/src/brief-evidence';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {EvidenceRetrievalReport,EvidenceComparisonReport} from '../packages/contracts/src/index';

const claim='Aster is the parent company of Harbor.';
const citation=(quote:string,index=0)=>({sourceId:`S${index+1}`,url:`https://source${index}.example/notice`,quote,eligible:true,relation:'supports'});
it('returns an exact short sentence with its original source, retaining the full citation separately',()=>{
 const text=`${claim} ${'Additional corporate background is described here. '.repeat(12)}`;
 const result=briefEvidence(claim,'supported',[citation(text)]);
 expect(result).toEqual([{sourceId:'S1',url:'https://source0.example/notice',quote:claim}]);expect(text).toContain(result[0].quote);
});
it.each([
 'However, this relationship ended in 2020.',
 'This applies only if a proposed merger completes.',
 'The relationship is not current.',
])('does not hide a qualification outside a proposed preview: %s',qualification=>{
 const text=`${claim} ${'Additional background. '.repeat(20)} ${qualification}`;
 expect(briefEvidence(claim,'supported',[citation(text)])).toEqual([]);
});
it('keeps a short qualified source intact rather than removing its caveat',()=>{
 const text=`${claim} However, the relationship is disputed.`;
 expect(briefEvidence(claim,'supported',[citation(text)])[0].quote).toBe(text);
});
it('omits previews for inconclusive, ineligible and nonmatching assessments',()=>{
 expect(briefEvidence(claim,'inconclusive',[citation(claim)])).toEqual([]);
 expect(briefEvidence(claim,'supported',[{...citation(claim),eligible:false}])).toEqual([]);
 expect(briefEvidence(claim,'contradicted',[citation(claim)])).toEqual([]);
});
it('bounds previews to two source groups without inventing a condensed quote',()=>{
 const result=briefEvidence(claim,'supported',[citation(claim),{...citation(claim,1),url:'https://source0.example/another'},citation(claim,2)]);
 expect(result).toHaveLength(2);expect(result[0].sourceId).toBe('S1');expect(result[1].sourceId).toBe('S3');
});
it('validates preview lineage and rejects invented or mismatched evidence in the API schema',async()=>{
 const now=new Date().toISOString();const text='Alex is CEO of Acme.';
 const retrieval=EvidenceRetrievalReport.parse({version:'1',claim:text,query:text,mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,message:'Synthetic',limitations:[],evidence:[0,1].map(index=>({url:`https://source${index}.example`,title:'Synthetic',excerpt:`${text} Note ${index}.`,publishedAt:now,retrievedAt:now,retrieval:'tavily',relation:'context'}))});
 const result=await compareClaimEvidence(retrieval,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence:async()=>({assessments:retrieval.evidence.map((source,index)=>({sourceId:`S${index+1}`,relation:'supports',quote:source.excerpt})),correction:null})}});
 expect(result.outcome).toBe('supported');expect(result.evidenceBrief).toHaveLength(2);
 expect(()=>EvidenceComparisonReport.parse({...result,evidenceBrief:[{sourceId:'S1',url:'https://invented.example',quote:'Invented evidence.'}]})).toThrow();
 expect(()=>EvidenceComparisonReport.parse({...result,outcome:'inconclusive',freshnessScore:null,freshness:'unknown'})).toThrow();
});
