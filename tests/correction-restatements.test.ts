import {expect,it,vi} from 'vitest';
import {isClaimRestatement,sharedReplacementSentences} from '../packages/tavily/src/correction-candidates';
import {compareClaimEvidence,comparisonSchemaFor} from '../packages/tavily/src/evidence-comparison';
import {referenceComparisonFor} from '../packages/tavily/src/comparison-references';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';

const claim='Acme SDK 2 reached end of life on 2020-01-01.';
const repeated=`The upstream project confirms ${claim}`;
function fixture(sentence=repeated){
 const now=new Date().toISOString();
 return EvidenceRetrievalReport.parse({version:'1',claim,query:claim,mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,message:'Synthetic historical evidence',limitations:[],evidence:[0,1].map(index=>({url:`https://source${index}.example`,title:'Synthetic notice',excerpt:`${sentence} Notice ${index}.`,relation:'context',retrieval:'tavily',publishedAt:'2020-03-01T00:00:00Z',retrievedAt:now}))});
}
function response(data=fixture(),relation='supports',text=repeated,ids=['S1','S2']){return {assessments:data.evidence.map((source,index)=>({sourceId:`S${index+1}`,relation,quote:source.excerpt})),correction:{text,sourceIds:ids}};}

it('excludes a literal claim restatement from both correction wire formats',()=>{
 const data=fixture();const sources=data.evidence.map((source,index)=>({sourceId:`S${index+1}`,excerpt:source.excerpt}));const input=JSON.stringify({claim,sources});
 expect(sharedReplacementSentences(claim,sources.map(source=>source.excerpt))).toEqual([]);
 expect(comparisonSchemaFor(input).properties.correction).toEqual({type:'null'});
 expect(referenceComparisonFor(input).schema.properties.correctionId.enum).toEqual(['none']);
});
it.each([
 `The upstream project confirms ${claim} if the migration is approved.`,
 'The upstream project confirms Acme SDK 2 did not reach end of life on 2020-01-01.',
 'The upstream project confirms Acme SDK 2 reached end of life on 2020-02-01.',
 'The vendor denies that Acme SDK 2 reached end of life on 2020-01-01.',
])('does not normalize away changed dates, negation, conditions or unknown attribution: %s',text=>expect(isClaimRestatement(claim,text)).toBe(false));
it.each(['supports','insufficient','conflicting'])('omits a verified redundant correction while preserving %s assessments',async relation=>{
 const data=fixture();const compareEvidence=vi.fn(async()=>response(data,relation));
 const result=await compareClaimEvidence(data,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(result.method).toBe('llm');expect(result.outcome).toBe(relation==='supports'?'supported':'inconclusive');expect(result.correction).toBeNull();expect(result.freshness).toBe('unknown');expect(result.explanation).toContain('restatement');
 expect(result.citations.map(source=>source.quote)).toEqual(data.evidence.map(source=>source.excerpt));expect(compareEvidence).toHaveBeenCalledOnce();
});
it.each(['unknown-reference','duplicate-reference','rewritten-text','altered-quote'])('does not ignore malformed corrections just because a restatement was offered: %s',scenario=>{
 const data=fixture();const output=response(data);
 if(scenario==='unknown-reference')output.correction.sourceIds=['S1','S3'];
 if(scenario==='duplicate-reference')output.correction.sourceIds=['S1','S1'];
 if(scenario==='rewritten-text')output.correction.text='The upstream project confirms '+claim.replace('2020-01-01','2020-02-01');
 if(scenario==='altered-quote')output.assessments[0].quote=claim;
 return compareClaimEvidence(data,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence:async()=>output}}).then(result=>{expect(result.method).toBe('rules_fallback');expect(result.outcome).toBe('inconclusive');expect(result.correction).toBeNull();});
});
it('rejects a contradictory verdict paired with a correction that repeats the claim',async()=>{
 const result=await compareClaimEvidence(fixture(),{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence:async()=>response(fixture(),'contradicts')}});
 expect(result.method).toBe('rules_fallback');expect(result.outcome).toBe('inconclusive');expect(result.explanation).toContain('repeats the claim');
});
it('preserves a genuine source-backed date correction',async()=>{
 const corrected=repeated.replace('2020-01-01','2020-02-01');const data=fixture(corrected);
 expect(sharedReplacementSentences(claim,data.evidence.map(source=>source.excerpt))).toEqual([corrected]);
 const result=await compareClaimEvidence(data,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence:async()=>response(data,'contradicts',corrected)}});
 expect(result.method).toBe('llm');expect(result.outcome).toBe('contradicted');expect(result.correction?.text).toBe(corrected);
});
