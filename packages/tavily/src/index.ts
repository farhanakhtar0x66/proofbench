import {randomUUID} from 'node:crypto';
import {VerifyRequest,VerificationReport,ClaimVerification} from '../../contracts/src/index';
import cases from '../../../fixtures/freshness-cases/v1.json';
// Offline exact-fixture lookup is deliberately conservative. It does not perform semantic verification.
export async function verifyAnswer(input:VerifyRequest):Promise<VerificationReport> {
 const request=VerifyRequest.parse(input);const now=new Date().toISOString();
 const claims=request.claims ?? request.text.split(/(?<=[.!?])\s+|\n+/u).filter(Boolean).slice(0,50).map(text=>({text,asOf:undefined}));
 return VerificationReport.parse({version:'1',id:randomUUID(),mode:'mock',createdAt:now,text:request.text,claims:claims.map(({text,asOf})=>{
  const fixture=asOf?undefined:cases.find(c=>c.statement===text.trim());
  return ClaimVerification.parse({version:'1',id:randomUUID(),text,timeSensitive:fixture?.timeSensitive??'unknown',outcome:fixture?.expectedOutcome??'inconclusive',freshness:fixture?.expectedFreshness??'unknown',asOf:asOf??now,uncertainty:fixture?`Offline fixture, not live Tavily evidence. ${fixture.uncertainty}`:asOf?'Explicit date scope requires temporal evidence; mock cannot verify this date.':'No exact offline fixture. Claim extraction is sentence-based; current truth has not been established.',evidence:fixture&&fixture.expectedOutcome!=='inconclusive'?[{url:fixture.source,title:`Offline reference: ${fixture.id}`,retrievedAt:null,recordedAt:'2026-11-02T00:00:00.000Z',excerpt:fixture.reference,relation:fixture.expectedOutcome==='supported'?'supports':'contradicts',retrieval:'fixture'}]:[]});
 })});
}
