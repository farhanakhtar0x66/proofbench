import {expect,it,vi} from 'vitest';
import {selectEvidenceExcerpt} from '../packages/tavily/src/excerpts';
import {validPassageBundle} from '../packages/tavily/src/source-passages';
import {retrieveClaimEvidence} from '../packages/tavily/src/general-retrieval';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {assessSourceDates} from '../packages/tavily/src/dates';
import {evidenceSearchPlan} from '../packages/tavily/src/search-plan';

const claim='Alex is CEO of Acme.';
it('finds a scoped statement in single-newline text after navigation and beyond the old 20k cutoff',()=>{
 const body=`${'Home\nMenu\nSearch\n'.repeat(2000)}Taylor is CEO of Acme.\nThis appointment is current.\nContact`;
 const selected=selectEvidenceExcerpt(claim,body);
 expect(selected.excerpt).toContain('Taylor is CEO of Acme.');expect(selected.selection.start).toBeGreaterThan(20000);
 expect(selected.selection.warning).toBeUndefined();expect(body.slice(selected.selection.start,selected.selection.end)).toBe(selected.excerpt);
});
it('does not omit separated opposing role statements and supplies verifiable exact-block offsets',()=>{
 const body=`Taylor is CEO of Acme.\n${'Unrelated background sentence. '.repeat(60)}\nTaylor is not CEO of Acme; Morgan now holds the role.`;
 const selected=selectEvidenceExcerpt(claim,body);
 expect(selected.excerpt).toContain('Taylor is CEO');expect(selected.excerpt).toContain('Taylor is not CEO');expect(selected.passages).toHaveLength(2);
 expect(validPassageBundle({excerpt:selected.excerpt,excerptPassages:selected.passages,excerptSelection:selected.selection})).toBe(true);
 for(const part of selected.passages!)expect(body.slice(part.start,part.end)).toBe(part.text);
 expect(selected.excerpt.length).toBeLessThanOrEqual(1200);
});
it('retains immediately following wrapped conditions or excludes a qualification too large to carry',()=>{
 const short=`${'Home\n'.repeat(400)}Taylor is CEO of Acme.\nHowever, this applies only if the board approves.\nThe appointment is conditional.`;
 expect(selectEvidenceExcerpt(claim,short).excerpt).toContain('only if the board approves');
 const long=`Taylor is CEO of Acme.\nHowever, ${'the conditions require review '.repeat(70)}before this can be treated as a current appointment.`;
 expect(selectEvidenceExcerpt(claim,long).selection.warning).toBeDefined();
});
it('includes opposing support blocks in one model input rather than silently selecting a positive passage',async()=>{
 const body=`Python 2 is supported by a commercial vendor.\n${'Unrelated background. '.repeat(100)}\nPython 2 is not supported by the upstream project.`;
 const source=selectEvidenceExcerpt('Python 2 is currently supported.',body);const stamp=new Date().toISOString();
 const fetched=await retrieveClaimEvidence({version:'1',claim:'Python 2 is currently supported.'},{mode:'live',allowPaidRequests:'true',apiKey:'fake',maxRequests:1,fetch:async()=>Response.json({results:[0,1].map(index=>({url:`https://source${index}.example`,content:body,published_date:stamp}))})});
 expect(fetched.evidence[0].excerptPassages).toEqual(source.passages);
 // Reject even plausible model labels when a composed quote's metadata is altered.
 fetched.evidence[0].excerptPassages![0].text='X'.repeat(fetched.evidence[0].excerptPassages![0].text.length);
 const model=vi.fn();const result=await compareClaimEvidence(fetched,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence:model}});
 expect(result.outcome).toBe('inconclusive');expect(model).not.toHaveBeenCalled();
});
it('scopes operative dates to selected evidence while keeping page update metadata checks',()=>{
 const published_date='2026-11-01';const now='2026-11-04T12:00:00Z';
 expect(assessSourceDates({published_date,content:'Unrelated archive: as of 2020-01-01.\nTaylor is CEO of Acme.',contextContent:'Taylor is CEO of Acme.'},now).eligible).toBe(true);
 expect(assessSourceDates({published_date,content:'Last updated on 03/11/2026.\nTaylor is CEO of Acme.',contextContent:'Taylor is CEO of Acme.'},now).eligible).toBe(false);
 expect(assessSourceDates({published_date,content:'The source describes effective leadership.'},now).eligible).toBe(true);
});
it.each(['January 1st, 2020','1 January 2020','January 1, 2020'])('parses explicit English effective dates without confusing them with publication: %s',date=>{
 const result=assessSourceDates({published_date:'2026-11-01',content:`This policy is effective from ${date}.`},'2026-11-04T12:00:00Z');
 expect(result.effectiveAt).toBe('2020-01-01T00:00:00.000Z');expect(result.eligible).toBe(true);
});
it('keeps invalid/future effective dates excluded and neutralizes explicit price searches without dropping scope',()=>{
 for(const date of ['February 30, 2026','November 10, 2026','next month'])expect(assessSourceDates({published_date:'2026-11-01',content:`Effective from ${date}.`},'2026-11-04T12:00:00Z').eligible).toBe(false);
 const plan=evidenceSearchPlan('Acme Pro costs USD 20/month.','current');
 expect(plan.query).toBe(evidenceSearchPlan('Acme Pro costs USD 25/month.','current').query);
 expect(plan.query).toContain('USD');expect(plan.dateWindow).toBeDefined();
});
