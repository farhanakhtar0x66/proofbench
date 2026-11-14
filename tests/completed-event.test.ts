import {expect,it,vi} from 'vitest';
import {completedEventClaim,completedEventAssessment} from '../packages/tavily/src/completed-event';
import {evidenceSearchPlan} from '../packages/tavily/src/search-plan';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';

const now='2026-11-04T12:00:00.000Z';
const claim='The Acme Regulation became applicable on 25 May 2018.';
it('searches dated completed events without a recent window or the asserted date',()=>{
 const other='The Acme Regulation became applicable on 25 May 2020.';
 expect(evidenceSearchPlan(claim,'current',new Date(now))).toEqual({query:'The Acme Regulation became applicable date official documentation',dateWindow:undefined});
 expect(evidenceSearchPlan(other,'current',new Date(now))).toEqual(evidenceSearchPlan(claim,'current',new Date(now)));
 expect(evidenceSearchPlan(claim).query).toBe(claim);
});
it.each(['2018-05-25','25 May 2018','May 25, 2018'])('normalizes a completed event date: %s',date=>{
 expect(completedEventClaim(`Acme was founded on ${date}.`,now)?.eventAt).toBe('2018-05-25T00:00:00.000Z');
});
it.each(['If approved, The Acme Regulation became applicable on 25 May 2018.','According to the vendor, Acme was founded on 25 May 2018.','Acme was released on February 30, 2020.','Acme was released on 2027-01-01.','Alex is CEO of Acme.'])('preserves unknown/qualified/current scopes: %s',text=>{
 expect(completedEventClaim(text,now)).toBeUndefined();expect(evidenceSearchPlan(text,'current',new Date(now)).dateWindow).toBeUndefined();
});
function evidence(texts:string[]){const retrievedAt=new Date().toISOString();return EvidenceRetrievalReport.parse({version:'1',claim,query:claim,mode:'live',status:'retrieved',createdAt:retrievedAt,retrievedAt,message:'SIMULATED old reports',limitations:[],evidence:texts.map((excerpt,index)=>({url:`https://source${index}.example/history`,title:'SIMULATED',excerpt,relation:'context',retrieval:'tavily',publishedAt:'2019-01-01T00:00:00.000Z',retrievedAt}))});}
it('allows corroborated old completed-event evidence only with unknown freshness, and preserves contrary dates',async()=>{
 const texts=[`${claim} This historical notice records the completed application milestone.`,`The Acme Regulation became applicable on 25 May 2018. This report distinguishes application from earlier adoption.`];
 const input=evidence(texts);
 const model=(relation:string)=>({interpret:vi.fn(),compareEvidence:vi.fn(async()=>({assessments:texts.map((quote,index)=>({sourceId:`S${index+1}`,relation,quote})),correction:null}))});
 const supported=await compareClaimEvidence(input,{mode:'llm',interpreter:model('supports')});
 expect(supported.outcome).toBe('supported');expect(supported.freshness).toBe('unknown');expect(supported.freshnessScore).toBeNull();
 const contradicted=await compareClaimEvidence({...input,claim:'The Acme Regulation became applicable on 25 May 2020.'},{mode:'llm',interpreter:model('contradicts')});
 expect(contradicted.outcome).toBe('contradicted');expect(contradicted.freshnessScore).toBeNull();
});
it('does not override undated, future-publication, schedule, update conflicts or wrong-entity evidence',()=>{
 for(const [text,published] of [[claim,undefined],[claim,'2027-01-01'],[claim,'2017-01-01'],[`If approved, ${claim}`,'2019-01-01'],[`${claim} Updated on 2017-01-01`,'2019-01-01'],['Another Regulation became applicable on 25 May 2018.','2019-01-01']] as const)expect(completedEventAssessment(claim,text,published,now)).toBeUndefined();
});
it('accepts an explicitly jurisdiction-bound acronym and date-first completed wording',()=>{
 const claim='The EU GDPR became applicable on 25 May 2018.';
 const quote='On 25 May 2018, the General Data Protection Regulation (GDPR) became applicable across the European Union (EU).';
 expect(completedEventAssessment(claim,quote,'2020-01-01',now)?.eligible).toBe(true);
 expect(completedEventAssessment(claim,'The GDPR is a European Union regulation. The GDPR became applicable on 25 May 2018.','2020-01-01',now)?.eligible).toBe(true);
 expect(completedEventAssessment(claim,'The European Union has separate rules. The UK GDPR became applicable on 1 January 2021.','2022-01-01',now)).toBeUndefined();
 expect(completedEventAssessment(claim,'The GDPR became applicable on 25 May 2018.','2020-01-01',now)).toBeUndefined();
});
it('does not admit an expected/scheduled event or reports predating a dated event through an acronym alias',()=>{
 const claim='The EU GDPR became applicable on 25 May 2018.';
 expect(completedEventAssessment(claim,'The European Union GDPR was expected to become applicable on 25 May 2018.','2020-01-01',now)).toBeUndefined();
 expect(completedEventAssessment(claim,'The EU GDPR became applicable on 25 May 2018.','2016-01-01',now)).toBeUndefined();
});
