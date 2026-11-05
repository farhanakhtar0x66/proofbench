import {expect,it,vi} from 'vitest';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';
import {compareClaimEvidence,comparisonSchemaFor} from '../packages/tavily/src/evidence-comparison';
import {referenceComparisonFor} from '../packages/tavily/src/comparison-references';
import {evidenceSearchPlan} from '../packages/tavily/src/search-plan';
import {selectSourcePassages,excerptBlockingWarning} from '../packages/tavily/src/source-passages';

function input(claim='A triangle has three sides.',publishedAt:string|undefined=undefined){
 const now=new Date().toISOString();
 return EvidenceRetrievalReport.parse({version:'1',claim,query:claim,searchScope:'current',mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,message:'Synthetic reference evidence',limitations:[],evidence:[0,1].map(i=>({url:`https://reference${i}.example/definition`,title:'Synthetic',excerpt:`A triangle has three sides. Reference description ${i}.`,retrievedAt:now,publishedAt:publishedAt?new Date(publishedAt).toISOString():undefined,retrieval:'tavily',relation:'context'}))});
}
function adapter(kind='stable',relation='supports'){
 return {interpret:vi.fn(),compareEvidence:vi.fn(async(text:string)=>({claimTimeSensitivity:kind,assessments:JSON.parse(text).sources.map((s:{sourceId:string;excerpt:string})=>({sourceId:s.sourceId,relation,quote:s.excerpt})),correction:null}))};
}
it.each([undefined,'2000-01-01'])('accepts corroborated stable reference evidence without inventing freshness: %s',async publishedAt=>{
 const result=await compareClaimEvidence(input(undefined,publishedAt),{mode:'llm',interpreter:adapter()});
 expect(result.outcome).toBe('supported');expect(result.freshness).toBe('unknown');expect(result.freshnessScore).toBeNull();
 expect(result.citations.every(c=>c.eligible&&c.dateReason?.includes('publication recency is unconfirmed'))).toBe(true);
});
it('can contradict a stable claim without using model memory as evidence',async()=>{
 const result=await compareClaimEvidence(input('A triangle has four sides.'),{mode:'llm',interpreter:adapter('stable','contradicts')});
 expect(result.outcome).toBe('contradicted');expect(result.correction).toBeNull();
});
it.each(['changing','uncertain'])('does not invent factual support for insufficient evidence: %s',async kind=>{
 const result=await compareClaimEvidence(input(),{mode:'llm',interpreter:adapter(kind,'insufficient')});
 expect(result.outcome).toBe('inconclusive');expect(result.freshnessScore).toBeNull();
});
it.each(['Acme Pro costs USD 20/month.','Ada is CEO of Acme.','Acme owns Orbit.','The latest release of Acme is 8.'])('compares old or undated changing evidence without manufacturing publication freshness: %s',async claim=>{
 const data=input(claim);for(const [i,source] of data.evidence.entries())source.excerpt=claim+' Source notice '+i+'.';
 const interpreter=adapter('changing');const result=await compareClaimEvidence(data,{mode:'llm',interpreter});
 expect(result.outcome).toBe('supported');expect(result.freshness).toBe('unknown');expect(result.freshnessScore).toBeNull();expect(interpreter.compareEvidence).toHaveBeenCalledOnce();
 expect(evidenceSearchPlan(claim,'current').dateWindow).toBeUndefined();
});
it.each(['2099-01-01','not-a-date'])('does not waive invalid or future publication: %s',async date=>{
 const data=input();for(const source of data.evidence)source.dateReason=date==='not-a-date'?'The publication date is invalid or unsupported.':undefined;
 if(date!=='not-a-date')for(const source of data.evidence)source.publishedAt=new Date(date).toISOString();
 const interpreter=adapter();expect((await compareClaimEvidence(data,{mode:'llm',interpreter})).outcome).toBe('inconclusive');expect(interpreter.compareEvidence).not.toHaveBeenCalled();
});
it('does not require a temporal classification for evidence comparison but still abstains on insufficient evidence',async()=>{
 const interpreter={interpret:vi.fn(),compareEvidence:vi.fn(async(text:string)=>({assessments:JSON.parse(text).sources.map((s:{sourceId:string;excerpt:string})=>({sourceId:s.sourceId,relation:'supports',quote:s.excerpt})),correction:null}))};
 expect((await compareClaimEvidence(input(),{mode:'llm',interpreter})).outcome).toBe('supported');
 expect((await compareClaimEvidence(input(),{mode:'llm',interpreter:adapter('stable','insufficient')})).outcome).toBe('inconclusive');
});
it('requires and preserves temporal interpretation through compact and full schemas',()=>{
 const context={claim:'A triangle has three sides.',temporalPolicy:'Classify time sensitivity.',sources:[{sourceId:'S1',excerpt:'A triangle has three sides.'},{sourceId:'S2',excerpt:'The definition describes a triangle with three sides.'}]};
 const text=JSON.stringify(context);const refs=referenceComparisonFor(text);
 expect(refs.schema.required).toContain('claimTimeSensitivity');expect(comparisonSchemaFor(text).required).toContain('claimTimeSensitivity');
 const response={claimTimeSensitivity:'stable',assessments:context.sources.map(s=>({sourceId:s.sourceId,relation:'supports'})),correctionId:'none'};
 expect(refs.parse(response)).toMatchObject({claimTimeSensitivity:'stable',assessments:context.sources.map(s=>({sourceId:s.sourceId,relation:'supports',quote:s.excerpt}))});
 expect(()=>refs.parse({...response,claimTimeSensitivity:undefined})).toThrow();
 expect(evidenceSearchPlan(context.claim,'current').dateWindow).toBeUndefined();
});
it('distinguishes coverage omissions from lost qualifications without removing warnings',()=>{
 const coverage=selectSourcePassages(Array.from({length:25},(_,i)=>`Reference ${i}: ${'A complete explanatory statement. '.repeat(15)}`).join('\n'),()=>5);
 expect(coverage.warning).toBeDefined();expect(coverage.omissionRisk).toBe('coverage');expect(excerptBlockingWarning(coverage)).toBeUndefined();
 const qualified=selectSourcePassages(`A direct statement.\nHowever, this is not the whole fact because ${'important qualifications '.repeat(200)}`,()=>5);
 expect(excerptBlockingWarning(qualified)).toBeDefined();
 expect(excerptBlockingWarning({warning:'Other relevant context omitted.'})).toBeDefined();
});

it('does not manufacture an update conflict from date-only midnight precision on the publication day',async()=>{
 const data=input();const now=new Date();const published=new Date(now.getTime()-86400000).toISOString();
 for(const source of data.evidence){source.publishedAt=published;source.updatedAt=published.slice(0,10)+'T00:00:00.000Z';}
 expect((await compareClaimEvidence(data,{mode:'llm',interpreter:adapter()})).outcome).toBe('supported');
 for(const source of data.evidence)source.updatedAt=new Date(Date.parse(published)-86400000).toISOString();
 const interpreter=adapter();const mismatch=await compareClaimEvidence(data,{mode:'llm',interpreter});expect(mismatch.outcome).toBe('supported');expect(mismatch.freshness).toBe('unknown');expect(mismatch.freshnessScore).toBeNull();
 for(const source of data.evidence)source.updatedAt='2099-01-01T00:00:00.000Z';
 const blocked=adapter();expect((await compareClaimEvidence(data,{mode:'llm',interpreter:blocked})).outcome).toBe('inconclusive');expect(blocked.compareEvidence).not.toHaveBeenCalled();
});
