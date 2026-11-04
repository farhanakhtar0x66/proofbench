import {expect,it,vi} from 'vitest';
import {assessSourceDates} from '../packages/tavily/src/dates';
import {claimDateContext} from '../packages/tavily/src/claim-date-context';
import {retrieveClaimEvidence} from '../packages/tavily/src/general-retrieval';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';

const now='2026-11-04T12:00:00.000Z';
const background='There were 72 million children in the U.S. as of July 1, 2025, according to census data.';
it.each(['today','yesterday','Friday'])('anchors simple relative as-of dates to publication: %s',day=>{
 expect(assessSourceDates({published_date:'2026-11-02',content:`Aster owns Harbor as of ${day}.`,claim:'Aster owns Harbor.'},now).eligible).toBe(true);
});
it.each(['next Friday','Friday 2020','Friday last year','sometime','Friday in 2020'])('retains ambiguous or future relative dates: %s',day=>{
 expect(assessSourceDates({published_date:'2026-11-02',content:`Aster owns Harbor as of ${day}.`,claim:'Aster owns Harbor.'},now).eligible).toBe(false);
});
it('does not use a valid date to conceal an unparsed date in the same evidence',()=>{
 expect(assessSourceDates({published_date:'2026-11-02',content:'Aster owns Harbor as of 2026-11-01. This status applies as of sometime.'},now).eligible).toBe(false);
 expect(assessSourceDates({content:'Aster owns Harbor as of today.'},now).eligible).toBe(false);
});
it.each([
 'Aster owns Harbor.',
 'Cedar Pro costs USD 20/month.',
 'Maya Chen is CEO of Lumen Labs.',
 'Orbit API version 3 is supported.',
 'Aurora launched the Meridian satellite.',
])('separates an unrelated statistical date from the claim: %s',claim=>{
 const content=`${claim} ${background}`;
 expect(assessSourceDates({published_date:'2026-11-03',content,claim},now).eligible).toBe(true);
 expect(claimDateContext(claim,content)).toContain(claim);
 expect(content).toContain('July 1, 2025');
});
it.each([
 'As of July 1, 2025, Aster owns Harbor.',
 'As of July 1, 2025. Aster owns Harbor.',
 'Aster owns Harbor. This arrangement was recorded as of July 1, 2025.',
 'Aster owns Harbor. The status was recorded as of July 1, 2025.',
 'Aster owns Harbor. Its ownership was recorded as of July 1, 2025.',
 'Aster owns Harbor. Effective on 2027-01-01.',
 'Aster owns Harbor. Last updated on 2020-01-01.',
])('retains relevant, ambiguous and global date guards: %s',content=>{
 expect(assessSourceDates({published_date:'2026-11-03',content,claim:'Aster owns Harbor.'},now).eligible).toBe(false);
});
it('retains all date context when anchors are weak, absent or aliases cannot be established',()=>{
 const text=`It owns the company. ${background}`;
 expect(claimDateContext('The company has an owner.',text)).toBe(text);
 expect(claimDateContext(undefined,text)).toBe(text);
});
it.each([undefined,'2020-01-01','2027-01-01','not-a-date'])('does not bypass publication validation: %s',published_date=>{
 expect(assessSourceDates({published_date,content:`Aster owns Harbor. ${background}`,claim:'Aster owns Harbor.'},now).eligible).toBe(false);
});
it('preserves exact full evidence for model assessment while allowing separate-subject dates',async()=>{
 const claim='Aster owns Harbor.';const content=`${claim} ${background}`;
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json({results:[0,1].map(index=>({url:`https://source${index}.example/notice`,content:`${content} Notice ${index}.`,published_date:new Date().toISOString()}))}));
 const retrieval=await retrieveClaimEvidence({version:'1',claim,scope:'current'},{mode:'live',allowLiveRequests:'true',apiKey:'fake',maxRequests:1,fetch:fetcher});
 const compareEvidence=vi.fn(async(text:string)=>{
  const context=JSON.parse(text);
  expect(context.sources.every((source:{excerpt:string})=>source.excerpt.includes(background))).toBe(true);
  return {assessments:context.sources.map((source:{sourceId:string;excerpt:string})=>({sourceId:source.sourceId,quote:source.excerpt,relation:'supports'})),correction:null};
 });
 const result=await compareClaimEvidence(retrieval,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(result.outcome).toBe('supported');expect(compareEvidence).toHaveBeenCalledOnce();expect(fetcher).toHaveBeenCalledOnce();
 expect(result.citations.every(citation=>citation.quote.includes(background))).toBe(true);
});
it.each([
 'Aster owns Harbor as of July 1, 2025.',
 'Aster owns Harbor. The report was valid as of July 1, 2025.',
 'Aster owns Harbor. This arrangement was recorded as of July 1, 2025.',
 'Aster owns Harbor. Effective on 2099-01-01.',
])('still abstains before inference on unsafe temporal evidence: %s',async content=>{
 const fetcher:typeof fetch=async()=>Response.json({results:[0,1].map(index=>({url:`https://temporal${index}.example`,content:`${content} Notice ${index}.`,published_date:new Date().toISOString()}))});
 const retrieval=await retrieveClaimEvidence({version:'1',claim:'Aster owns Harbor.',scope:'current'},{mode:'live',allowLiveRequests:'true',apiKey:'fake',maxRequests:1,fetch:fetcher});
 const compareEvidence=vi.fn();
 const result=await compareClaimEvidence(retrieval,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(result.outcome).toBe('inconclusive');expect(compareEvidence).not.toHaveBeenCalled();
});
