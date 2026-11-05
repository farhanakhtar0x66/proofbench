import {afterEach,expect,it,vi} from 'vitest';
import {EvidenceComparisonReport,EvidenceRetrievalReport} from '../packages/contracts/src/index';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';

const now='2026-11-04T12:00:00.000Z';
const day=86400000;
afterEach(()=>vi.useRealTimers());
async function compare(ages:(number|null)[],relations=ages.map(()=>'supports')){
 vi.useFakeTimers();vi.setSystemTime(new Date(now));
 const input=EvidenceRetrievalReport.parse({version:'1',claim:'Acme Pro costs USD 20/month.',query:'Acme price',mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,message:'Simulated recency test',limitations:[],evidence:ages.map((age,index)=>({url:`https://source${index}.example/pricing`,title:'Simulated source',excerpt:`Acme Pro costs USD 20/month. Source ${index} describes its pricing notice.`,relation:'context',retrieval:'tavily',retrievedAt:now,...(age===null?{}:{publishedAt:new Date(Date.parse(now)-age*day).toISOString()})}))});
 const compareEvidence=vi.fn(async()=>({assessments:input.evidence.map((source,index)=>({sourceId:`S${index+1}`,relation:relations[index],quote:source.excerpt})),correction:null}));
 const result=await compareClaimEvidence(input,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 return {result,compareEvidence};
}

it.each([
 [[0,0],100],[[1,15],50],[[30,2],0],[[0,29],3],
] as const)('scores the oldest qualifying supporting publication for ages %j',async(ages,expected)=>{
 const {result}=await compare([...ages]);
 expect(result.outcome).toBe('supported');expect(result.freshness).toBe('current');
 expect(result.freshnessScore).toBe(expected);expect(result.freshnessScoreReason).toContain('not truth confidence');
});
it('does not let a fresh third source refresh older corroboration',async()=>{
 const {result}=await compare([15,15,0]);expect(result.freshnessScore).toBe(50);
});
it('ignores excluded supporting dates and unrelated source dates in scoring',async()=>{
 expect((await compare([1,15,31])).result.freshnessScore).toBe(50);
 expect((await compare([1,1,29],['supports','supports','insufficient'])).result.freshnessScore).toBe(96);
});
it.each([[0,null],[0,-1],[0,30.001]])('keeps insufficient date coverage unscored for %j',async(...ages)=>{
 const {result,compareEvidence}=await compare(ages);
 expect(result.outcome).toBe('inconclusive');expect(result.freshnessScore).toBeNull();expect(compareEvidence).not.toHaveBeenCalled();
});
it.each([['supports','contradicts'],['contradicts','contradicts'],['insufficient','insufficient']])('keeps conflict, contradiction and uncertainty unscored: %j',async(...relations)=>{
 const {result}=await compare([0,0],relations);expect(result.freshnessScore).toBeNull();
 expect(result.freshnessScoreReason).toContain(result.outcome==='contradicted'?'previously true':'insufficient or conflicting');
});
it('keeps the assessment-time score stable when a saved report is read later',async()=>{
 const {result}=await compare([1,15]);vi.setSystemTime(new Date(Date.parse(now)+60*day));
 const saved=EvidenceComparisonReport.parse(JSON.parse(JSON.stringify(result)));
 expect(saved.freshnessScore).toBe(50);expect(saved.assessedAt).toBe(now);
});
it('accepts old null-score reports but rejects invalid or misleading numeric scores',async()=>{
 const {result}=await compare([0,0]);
 const legacy={...result,freshnessScore:null};delete legacy.freshnessScoreReason;
 expect(EvidenceComparisonReport.safeParse(legacy).success).toBe(true);
 for(const freshnessScore of [-1,101,50.5,'100',NaN,Infinity])expect(EvidenceComparisonReport.safeParse({...result,freshnessScore}).success).toBe(false);
 for(const change of [{outcome:'inconclusive'},{outcome:'contradicted'},{freshness:'unknown'},{method:'rules_fallback'},{freshnessScoreReason:undefined}])expect(EvidenceComparisonReport.safeParse({...result,...change}).success).toBe(false);
});
