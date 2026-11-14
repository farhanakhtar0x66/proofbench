import {expect,it,vi} from 'vitest';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';

function evidence(){
 const now=new Date().toISOString();
 return EvidenceRetrievalReport.parse({version:'1',claim:'Alex is CEO of Acme.',query:'Acme current CEO',mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,message:'Simulated',limitations:[],evidence:[0,1].map(index=>({url:`https://source${index}.example/notice`,title:'Synthetic',excerpt:`Alex is CEO of Acme. Notice ${index}.`,publishedAt:now,retrievedAt:now,retrieval:'tavily',relation:'context'}))});
}
it.each(['dates','context','quality','scope','duplicate','one_group'] as const)('returns a precise blocked reason without requesting inference: %s',kind=>{
 const input=evidence();
 const expected={dates:'source_dates_uncertain',context:'source_context_incomplete',quality:'source_context_incomplete',scope:'source_scope_mismatch',duplicate:'duplicate_sources',one_group:'insufficient_sources'}[kind];
 if(kind==='dates')for(const source of input.evidence)source.publishedAt='2020-01-01T00:00:00.000Z';
 if(kind==='context')for(const source of input.evidence)source.excerptSelection={start:0,end:source.excerpt.length,sourceLength:5000,reason:'Selected block',warning:'Other relevant context was omitted.'};
 if(kind==='quality')for(const source of input.evidence)source.excerpt='data:image/png;base64,'+'a'.repeat(250);
 if(kind==='scope')for(const source of input.evidence)source.excerpt='Taylor is captain of another club.';
 if(kind==='duplicate')input.evidence[1].url=input.evidence[0].url;
 if(kind==='one_group')input.evidence[1].url='https://source0.example/another-notice';
 const compareEvidence=vi.fn();
 return compareClaimEvidence(input,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}}).then(result=>{
  expect(result).toMatchObject({outcome:'inconclusive',reasonCode:expected,verificationStatus:'blocked'});
  expect(result.shortReason).toBeTruthy();expect(result.shortReason!.length).toBeLessThan(181);expect(compareEvidence).not.toHaveBeenCalled();
 });
});
it.each([1,0])('distinguishes a completed uncertain assessment with %s agreeing groups from a model failure',async agreeing=>{
 const input=evidence();
 const result=await compareClaimEvidence(input,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence:async()=>({assessments:input.evidence.map((source,index)=>({sourceId:`S${index+1}`,relation:index<agreeing?'supports':'insufficient',quote:source.excerpt})),correction:null})}});
 expect(result).toMatchObject({outcome:'inconclusive',reasonCode:'insufficient_evidence',verificationStatus:'completed'});
 expect(result.shortReason).toContain(agreeing?'Only one':'do not directly establish');
});
