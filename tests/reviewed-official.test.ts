import {expect,it,vi} from 'vitest';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';
import {compareClaimEvidence,comparisonSchemaFor} from '../packages/tavily/src/evidence-comparison';
import {referenceComparisonFor} from '../packages/tavily/src/comparison-references';
import {reviewedOfficialDirect} from '../packages/tavily/src/reviewed-official';
import {evidenceSearchPlan} from '../packages/tavily/src/search-plan';
import {selectEvidenceExcerpt} from '../packages/tavily/src/excerpts';

const claim='Arjun Sharma is Prime Minister of India.';
const url='https://www.pmindia.gov.in/en/news_updates/example';
const quote='Prime Minister Arjun Sharma addressed the public today.';
function evidence(text=quote,sourceUrl=url,published=new Date().toISOString()){
 const now=new Date().toISOString();
 return EvidenceRetrievalReport.parse({version:'1',claim,query:claim,mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,message:'Simulated',limitations:[],evidence:[{url:sourceUrl,title:'Synthetic government page',excerpt:text,relation:'context',retrieval:'tavily',publishedAt:published,retrievedAt:now}]});
}
const model=(relation='supports')=>({interpret:vi.fn(),compareEvidence:vi.fn(async()=>({assessments:[{sourceId:'S1',relation,quote}],correction:null}))});
it('accepts one directly named reviewed official source, with no fabricated score or correction',async()=>{
 const interpreter=model();const result=await compareClaimEvidence(evidence(),{mode:'llm',interpreter});
 expect(result.outcome).toBe('supported');expect(result.explanation).toContain('One reviewed official');
 expect(result.freshnessScore).toBeNull();expect(result.correction).toBeNull();expect(interpreter.compareEvidence).toHaveBeenCalledOnce();
});
it('can contradict a different named holder only when the model assesses the direct source',async()=>{
 const input=evidence();input.claim='Ravi Singh is PM of India.';
 const result=await compareClaimEvidence(input,{mode:'llm',interpreter:model('contradicts')});
 expect(result.outcome).toBe('contradicted');expect(result.correction).toBeNull();
});
it.each([
 ['https://www.pmindia.gov.in.evil.example/en/news_updates/example',quote],
 ['http://www.pmindia.gov.in/en/news_updates/example',quote],
 ['https://www.pmindia.gov.in/other/example',quote],
 [url,'PRIME MINISTER OF INDIA'],
 [url,'Former Prime Minister Arjun Sharma spoke in 2010.'],
 [url,'Prime Minister Arjun Sharma may be appointed next year.'],
 [url,'Prime Minister Arjun Sharma is not the current office holder.'],
])('does not treat a lookalike, unrelated path, masthead or former holder as direct evidence: %s',(sourceUrl,text)=>{
 expect(reviewedOfficialDirect(claim,{url:sourceUrl,excerpt:text})).toBe(false);
});
it('does not allow stale, clipped, forged-tier or model-insufficient evidence to become a verdict',async()=>{
 const old=evidence(quote,url,'2020-01-01T00:00:00.000Z');old.evidence[0].sourceTier='official_direct';
 const interpreter=model();expect((await compareClaimEvidence(old,{mode:'llm',interpreter})).outcome).toBe('inconclusive');expect(interpreter.compareEvidence).not.toHaveBeenCalled();
 const clipped=evidence();clipped.evidence[0].excerptSelection={start:0,end:quote.length,sourceLength:5000,reason:'Clipped',warning:'Relevant context omitted.'};
 expect((await compareClaimEvidence(clipped,{mode:'llm',interpreter:model()})).outcome).toBe('inconclusive');
 expect((await compareClaimEvidence(evidence(),{mode:'llm',interpreter:model('insufficient')})).outcome).toBe('inconclusive');
 const fake=evidence(quote,'https://lookalike.example/en/news_updates/example');fake.evidence[0].sourceTier='official_direct';
 expect((await compareClaimEvidence(fake,{mode:'llm',interpreter:model()})).outcome).toBe('inconclusive');
});
it('supports one-source wire schemas and chooses a direct passage without rewriting the claim',()=>{
 const context=JSON.stringify({claim,sources:[{sourceId:'S1',excerpt:quote}]});
 expect(comparisonSchemaFor(context).properties.assessments.minItems).toBe(1);
 expect(referenceComparisonFor(context).parse({assessments:[{sourceId:'S1',relation:'supports'}],correctionId:'none'}).assessments[0].quote).toBe(quote);
 const content=`${'Navigation\n'.repeat(300)}${quote}\nThe office published this notice.`;
 expect(selectEvidenceExcerpt(claim,content,url).excerpt).toContain(quote);
 expect(evidenceSearchPlan('Ravi Singh is PM of India.','current').query).toBe('India current prime minister official sources');
});
