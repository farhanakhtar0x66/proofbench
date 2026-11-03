import {expect,it,vi} from 'vitest';
import {roleClaimAnchors,sourceRelevanceReason} from '../packages/tavily/src/evidence-relevance';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';

it.each([
 ['Alex is captain of Acme FC.','Acme FC',['captain','captains','captaincy']],
 ['Alex is not currently the club captain of Acme FC.','Acme FC',['captain','captains','captaincy']],
 ['Ada serves as CEO for Acme Corp.','Acme Corp',['CEO','chief executive officer']],
 ['Acme Corp’s current CEO is Ada.','Acme Corp',['CEO','chief executive officer']],
 ['Alex is prime minister of Exampleland.','Exampleland',['prime minister']],
])('recognizes explicit role anchors without assuming a holder is correct: %s',(claim,entity,roles)=>expect(roleClaimAnchors(claim as string)).toEqual({entity,roles}));

it.each([
 'If approved, Alex is captain of Acme FC.',
 'According to a report, Ada is CEO of Acme Corp.',
 'Alex was captain of Acme FC in 2020.',
 'Alex might be captain of Acme FC.',
 'Alex is captain of Acme FC against Club B.',
 'Ada is CEO of Acme Corp in India in 2026.',
 'Ada is CEO of Acme and Alex is president of Other Corp.',
 'The Moon has a rocky surface.',
])('defers unsupported or qualified wording instead of inventing entity boundaries: %s',claim=>expect(roleClaimAnchors(claim)).toBeUndefined());

it('accepts relevant alternative holders and explicit denial for later semantic comparison',()=>{
 expect(sourceRelevanceReason('Alex is captain of Acme FC.','Taylor is the captain of Acme FC.')).toBeUndefined();
 expect(sourceRelevanceReason('Alex is captain of Acme FC.','Alex is not the captain of Acme FC.')).toBeUndefined();
 expect(sourceRelevanceReason('Ada is CEO of Acme Corp.','ACME CORP named Taylor its chief executive officer.')).toBeUndefined();
});
it.each([
 'Acme FC announced a dispute with a league president.',
 'The captain of Other FC is Alex.',
 'Acme FC played today. Other FC captain Alex spoke afterwards.',
 'Acme FCX named Alex captain.',
])('does not count tangential organization or role mentions as corroboration: %s',excerpt=>{
 expect(sourceRelevanceReason('Alex is captain of Acme FC.',excerpt)).toContain('cannot count as corroboration');
});
it('leaves semantic sufficiency to comparison even when both anchors occur',()=>expect(sourceRelevanceReason('Alex is captain of Acme FC.','Acme FC discussed the captain role without naming the holder.')).toBeUndefined());

function input(excerpts:string[]){
 const now=new Date().toISOString();
 return EvidenceRetrievalReport.parse({version:'1',claim:'Alex is captain of Acme FC.',query:'Acme FC captain',mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,limitations:[],message:'Synthetic evidence',evidence:excerpts.map((excerpt,index)=>({url:`https://source${index}.example/article`,title:'Report',excerpt,relation:'context',retrieval:'tavily',publishedAt:now,retrievedAt:now}))});
}
it('retains irrelevant citations with scope warnings and abstains before inference',async()=>{
 const compareEvidence=vi.fn();
 const result=await compareClaimEvidence(input(['Acme FC published an official statement about league leadership.','Other FC captain Alex discussed the award shortlist.']),{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(result.outcome).toBe('inconclusive');expect(result.correction).toBeNull();expect(result.citations).toHaveLength(2);
 expect(result.citations.every(source=>!source.eligible&&!!source.scopeReason&&source.relation==='insufficient')).toBe(true);expect(compareEvidence).not.toHaveBeenCalled();
});
it('does not allow an irrelevant second source to corroborate a single relevant report',async()=>{
 const compareEvidence=vi.fn();const result=await compareClaimEvidence(input(['Taylor is the club captain of Acme FC.','Acme FC has announced its next match.']),{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(result.citations.map(source=>source.eligible)).toEqual([true,false]);expect(result.outcome).toBe('inconclusive');expect(compareEvidence).not.toHaveBeenCalled();
});
it('allows two relevant reports to reach semantic assessment while keeping an irrelevant third source ineligible',async()=>{
 const data=input(['Taylor is the club captain of Acme FC.','Acme FC captain Taylor addressed the team.','Acme FC discussed ticket sales.']);
 const compareEvidence=vi.fn(async()=>({assessments:data.evidence.map((source,index)=>({sourceId:`S${index+1}`,quote:source.excerpt,relation:'contradicts'})),correction:null}));
 const result=await compareClaimEvidence(data,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(compareEvidence).toHaveBeenCalledOnce();expect(result.outcome).toBe('contradicted');expect(result.citations.map(source=>source.eligible)).toEqual([true,true,false]);
});
