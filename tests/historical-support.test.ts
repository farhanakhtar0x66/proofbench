import {expect,it,vi} from 'vitest';
import {datedEndOfLifeClaim,historicalSupportAssessment} from '../packages/tavily/src/historical-support';
import {evidenceSearchPlan} from '../packages/tavily/src/search-plan';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';

const claim='Acme SDK 2 reached end of life on 2020-01-01.';
const excerpt='The upstream project confirms: Acme SDK 2 reached end of life on 2020-01-01.';
const now='2026-11-04T00:00:00Z';
it('admits an explicitly completed historical event with publication after the event',()=>{
 expect(historicalSupportAssessment(claim,excerpt,'2020-02-01',now)?.eligible).toBe(true);
 expect(datedEndOfLifeClaim('Acme SDK 2 reached end of life on January 1, 2020.')?.eventAt).toBe('2020-01-01T00:00:00.000Z');
 expect(historicalSupportAssessment(claim,excerpt.replace('2020-01-01','January 1, 2020'),'2020-02-01',now)?.eligible).toBe(true);
 expect(datedEndOfLifeClaim('It reached end of life on 2020-01-01.')).toBeUndefined();
 expect(evidenceSearchPlan(claim,'current').dateWindow).toBeUndefined();expect(evidenceSearchPlan(claim).query).toBe(claim);
});
it.each([
 'The upstream project says Acme SDK 2 is scheduled to reach end of life on 2020-01-01.',
 'The upstream project says Acme SDK 2 will reach end of life on 2020-01-01.',
 'According to a vendor, Acme SDK 2 reached end of life on 2020-01-01.',
 'The vendor confirms Acme SDK 2 reached end of life on 2020-01-01.',
 'The upstream project confirms Acme SDK 2 never reached end of life on 2020-01-01.',
 'The upstream project confirms Acme SDK 2 reached end of life on 2020-01-01 but support resumed.',
 'The upstream project confirms Other SDK 2 reached end of life on 2020-01-01.',
 'The upstream project confirms Acme SDK 20 reached end of life on 2020-01-01.',
 'The upstream project confirms Acme SDK 2 reached end of life on 2020-02-31.',
 'The upstream project confirms Acme SDK 2 reached end of life on 2020-01-01 and Acme SDK 2 reached end of life on 2020-02-01.',
])('refuses unsafe completion/scope evidence: %s',text=>expect(historicalSupportAssessment(claim,text,'2020-03-01',now)).toBeUndefined());
it.each([undefined,'not a date','2019-12-01','2099-01-01'])('refuses missing, invalid, pre-event or future publication: %s',published=>expect(historicalSupportAssessment(claim,excerpt,published,now)).toBeUndefined());
it('does not convert historical event proof into current support proof',()=>{
 const result=historicalSupportAssessment('Acme SDK 2 is currently supported.',excerpt,'2020-02-01',now);
 expect(result?.eligible).toBe(false);expect(result?.reason).toContain('today’s support');
 expect(historicalSupportAssessment('Acme SDK 2 is currently supported.',excerpt,'2026-11-03',now)).toBeUndefined();
});
it('escapes product punctuation instead of matching a different product',()=>{
 const subject='Node.js 18';const event=`${subject} reached end of life on 2020-01-01.`;
 expect(historicalSupportAssessment(event,`The upstream project: ${event}`,'2020-02-01',now)?.eligible).toBe(true);
 expect(historicalSupportAssessment(event,'The upstream project: NodeXjs 18 reached end of life on 2020-01-01.','2020-02-01',now)).toBeUndefined();
});
function input(text=claim){const retrieved=new Date().toISOString();return EvidenceRetrievalReport.parse({version:'1',claim:text,query:text,mode:'live',status:'retrieved',createdAt:retrieved,retrievedAt:retrieved,message:'Synthetic historical evidence',limitations:[],evidence:['first.example','second.example'].map((host,index)=>({url:`https://${host}`,title:'Past announcement',excerpt:`${excerpt} Report ${index} records this completed lifecycle event.`,relation:'context',retrieval:'tavily',publishedAt:'2020-02-01T00:00:00Z',retrievedAt:retrieved}))});}
it('allows two historical groups through model assessment but keeps freshness unknown',async()=>{
 const data=input();const compareEvidence=vi.fn(async()=>({assessments:data.evidence.map((source,index)=>({sourceId:`S${index+1}`,relation:'supports',quote:source.excerpt})),correction:null}));
 const result=await compareClaimEvidence(data,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(compareEvidence).toHaveBeenCalledOnce();expect(result.outcome).toBe('supported');expect(result.freshness).toBe('unknown');expect(result.freshnessScore).toBeNull();expect(result.citations.every(source=>source.eligible&&source.dateReason.includes('historical'))).toBe(true);
});
it('still abstains on today’s support and on incomplete-context excerpts before inference',async()=>{
 const compareEvidence=vi.fn();
 const current=await compareClaimEvidence(input('Acme SDK 2 is currently supported.'),{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(current.outcome).toBe('inconclusive');expect(current.citations.every(source=>!source.eligible&&source.scopeReason?.includes('historical context'))).toBe(true);
 const data=input();data.evidence[0].excerptSelection={start:0,end:data.evidence[0].excerpt.length,sourceLength:2000,reason:'Selection',warning:'Other relevant passages omitted.'};
 const incomplete=await compareClaimEvidence(data,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(incomplete.outcome).toBe('inconclusive');expect(compareEvidence).not.toHaveBeenCalled();
 delete data.evidence[0].excerptSelection;data.evidence[0].dateReason='An explicit source date is invalid.';
 const warned=await compareClaimEvidence(data,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(warned.outcome).toBe('inconclusive');expect(compareEvidence).not.toHaveBeenCalled();
});
