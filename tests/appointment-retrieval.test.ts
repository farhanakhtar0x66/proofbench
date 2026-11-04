import {expect,it,vi} from 'vitest';
import {evidenceSearchPlan} from '../packages/tavily/src/search-plan';
import {captainClaimScope,captainEvidenceHint} from '../packages/tavily/src/captain-scope';
import {retrieveClaimEvidence} from '../packages/tavily/src/general-retrieval';
import {compareClaimEvidence,sourceScopeReason} from '../packages/tavily/src/evidence-comparison';
import {SearchBudget} from '../packages/tavily/src/budget';

const target='Acme FC current club captains captaincy appointment official sources';
it.each([
 'Alex is captain of Acme FC.',
 'Alex is not the captain of Acme FC.',
 'Alex is currently the club captain of Acme FC.',
 'Alex serves as captain for Acme FC.',
 "Acme FC's current captain is Alex.",
 'Acme FC’s club captain is not Alex.',
])('seeks the ongoing appointment neutrally for %s',claim=>{
 expect(evidenceSearchPlan(claim,'current').query).toBe(target);
 expect(evidenceSearchPlan(claim).query).toBe(claim);
});
it.each([
 'Alex was captain of Acme FC in 2018.',
 'If approved, Alex is captain of Acme FC.',
 'According to the report, Alex is captain of Acme FC.',
 'Alex might be captain of Acme FC.',
 'Alex will be captain of Acme FC.',
])('keeps qualified/uncertain statements literal rather than inventing an appointment: %s',claim=>expect(evidenceSearchPlan(claim,'current').query).toBe(`${claim} current official sources`));
it('retains object-side qualifiers and does not add a club-appointment scope to a match claim',()=>{
 expect(evidenceSearchPlan('Alex is captain of Acme FC in India in 2026.','current').query).toBe('Acme FC in India in 2026 current club captains captaincy appointment official sources');
 const match='Alex is captain of Acme FC against Club B.';
 expect(captainClaimScope(match)).toBe('event');expect(evidenceSearchPlan(match,'current').query).toBe('Acme FC against Club B current captain official sources');
 expect(captainClaimScope('Alex is acting captain of Acme FC.')).toBe('event');
 expect(captainClaimScope('Alex is the club captain and played against Club B.')).toBe('appointment');
});
it('does not promote a one-game nomination into a permanent role',()=>{
 const match='Alex was named captain for this match.';
 expect(captainEvidenceHint(match)).toBe('match_only');expect(sourceScopeReason('Alex is captain of Acme FC.',match)).toBeDefined();
 expect(captainEvidenceHint('Alex was named captain for the new season.')).toBe('appointment');
 expect(captainEvidenceHint('Alex is the club captain.')).toBe('appointment');
 expect(captainEvidenceHint('Alex discussed team spirit.')).toBe('unspecified');
});
it('ranks appointment excerpts first without removing context, changing text or spending an extra search',async()=>{
 const now=new Date().toISOString();const claim='Alex is captain of Acme FC.';
 const raw=[
  {url:'https://match.example/story',title:'Match report',content:'The goalkeeper started as captain against Club B.',published_date:now},
  {url:'https://context.example/story',title:'Team news',content:'The squad discussed its preparations.',published_date:now},
  {url:'https://appointment.example/story',title:'Club announcement',content:'Taylor is the club captain for this season.',published_date:now},
 ];
 const fetcher=vi.fn<typeof fetch>(async(_url,init)=>{const body=JSON.parse(String(init?.body));expect(body.query).toBe(target);expect(body.search_depth).toBe('basic');expect(body.max_results).toBe(6);return Response.json({results:raw});});
 const options={mode:'live',allowPaidRequests:'true',apiKey:'fake',maxRequests:1,budget:new SearchBudget(),fetch:fetcher};
 const report=await retrieveClaimEvidence({version:'1',claim,scope:'current'},options);
 expect(report.claim).toBe(claim);expect(report.evidence.map(source=>source.scopeHint)).toEqual(['appointment','unspecified','match_only']);
 expect(report.evidence).toHaveLength(3);expect(report.evidence.every(source=>source.sourceTier==='unreviewed'&&source.relation==='context')).toBe(true);
 expect(report.evidence.map(source=>source.excerpt).sort()).toEqual(raw.map(source=>source.content).sort());
 await retrieveClaimEvidence({version:'1',claim,scope:'current'},options);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('keeps literal retrieval order and still abstains if all current results concern a match',async()=>{
 const claim='Alex is captain of Acme FC.';const now=new Date().toISOString();
 const raw=['first.example','second.example'].map((host,i)=>({url:`https://${host}/story`,title:`Source ${i}`,content:`Player ${i} served as captain against Club B.`,published_date:now}));
 const fetcher:typeof fetch=async()=>Response.json({results:raw});
 const literal=await retrieveClaimEvidence({version:'1',claim},{mode:'live',allowPaidRequests:'true',apiKey:'fake',maxRequests:1,fetch:fetcher,budget:new SearchBudget()});
 expect(literal.evidence.map(source=>source.url)).toEqual(raw.map(source=>source.url));expect(literal.evidence.every(source=>source.scopeHint===undefined)).toBe(true);
 const current=await retrieveClaimEvidence({version:'1',claim,scope:'current'},{mode:'live',allowPaidRequests:'true',apiKey:'fake',maxRequests:1,fetch:fetcher,budget:new SearchBudget()});
 const compareEvidence=vi.fn();const result=await compareClaimEvidence(current,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(result.outcome).toBe('inconclusive');expect(compareEvidence).not.toHaveBeenCalled();expect(result.citations.every(source=>!!source.scopeReason)).toBe(true);
});
