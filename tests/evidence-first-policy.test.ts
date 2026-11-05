import {afterEach,expect,it,vi} from 'vitest';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {configuredPrimaryDirect} from '../packages/tavily/src/primary-source';
import {SearchBudget} from '../packages/tavily/src/budget';
import {createApp} from '../apps/api/src/app';
const claim='Ada is CEO of Lumen.';
function input(count=2){const now=new Date().toISOString();return EvidenceRetrievalReport.parse({version:'1',claim,query:claim,searchScope:'current',mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,message:'Synthetic',limitations:[],evidence:Array.from({length:count},(_,i)=>({url:i?'https://other.example/leadership':'https://lumen.example/team',title:'Synthetic',excerpt:claim+` Notice ${i}.`,retrievedAt:now,retrieval:'tavily',relation:'context'}))});}
function adapter(relation='supports'){return {interpret:vi.fn(),compareEvidence:vi.fn(async(text:string)=>({assessments:JSON.parse(text).sources.map((s:{sourceId:string;excerpt:string})=>({sourceId:s.sourceId,quote:s.excerpt,relation})),correction:null}))};}
afterEach(()=>vi.unstubAllEnvs());
it('compares one unreviewed source but cannot promote it into a decisive verdict',async()=>{
 const interpreter=adapter();const result=await compareClaimEvidence(input(1),{mode:'llm',interpreter});expect(interpreter.compareEvidence).toHaveBeenCalledOnce();expect(result.outcome).toBe('inconclusive');expect(result.citations[0].relation).toBe('supports');
});
it.each(['supports','contradicts'])('allows one operator-bound primary source after exact evidence assessment: %s',async relation=>{
 vi.stubEnv('TAVILY_PRIMARY_SOURCES',JSON.stringify([{entity:'Lumen',urlPrefix:'https://lumen.example/team'}]));
 const data=input(1);const result=await compareClaimEvidence(data,{mode:'llm',interpreter:adapter(relation)});
 expect(result.outcome).toBe(relation==='supports'?'supported':'contradicted');expect(result.freshness).toBe('unknown');expect(result.freshnessScore).toBeNull();expect(result.explanation).toContain('one source, not independent corroboration');
});
it('does not upgrade an imitation domain, another entity, path prefix collision or invalid binding',()=>{
 const raw=JSON.stringify([{entity:'Lumen',urlPrefix:'https://lumen.example/team'}]);
 for(const url of ['https://lumen.example.evil.test/team','https://lumen.example/teammate','http://lumen.example/team'])expect(configuredPrimaryDirect(claim,{url,excerpt:claim},raw)).toBe(false);
 expect(configuredPrimaryDirect('Ada leads Orbit.',{url:'https://lumen.example/team',excerpt:claim},raw)).toBe(false);
 expect(configuredPrimaryDirect(claim,{url:'https://lumen.example/team',excerpt:claim},'bad json')).toBe(false);
});
it('retains explicit historical-date and conflicting evidence safeguards',async()=>{
 const data=input();for(const source of data.evidence)source.excerpt='As of 2020-01-01, '+source.excerpt;
 const interpreter=adapter();expect((await compareClaimEvidence(data,{mode:'llm',interpreter})).outcome).toBe('inconclusive');expect(interpreter.compareEvidence).not.toHaveBeenCalled();
 const mixed={interpret:vi.fn(),compareEvidence:vi.fn(async(text:string)=>({assessments:JSON.parse(text).sources.map((s:{sourceId:string;excerpt:string},i:number)=>({sourceId:s.sourceId,quote:s.excerpt,relation:i?'contradicts':'supports'})),correction:null}))};
 expect((await compareClaimEvidence(input(),{mode:'llm',interpreter:mixed})).outcome).toBe('inconclusive');
});
it('does not infer a present role merely because an undated source exists',async()=>{
 const result=await compareClaimEvidence(input(),{mode:'llm',interpreter:adapter('insufficient')});expect(result.outcome).toBe('inconclusive');expect(result.correction).toBeNull();
});
it('reports the remaining allowance without consuming requests or permitting a higher ceiling',async()=>{
 const budget=new SearchBudget();expect(budget.snapshot(3)).toEqual({used:0,limit:3,remaining:3});
 await budget.search('a','fake',1,async()=>[]);expect(budget.snapshot(3)).toEqual({used:1,limit:1,remaining:0});
 vi.stubEnv('LANGUAGE_MODE','rules');vi.stubEnv('TAVILY_MAX_REQUESTS','3');
 const forbidden=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Network forbidden'));const app=await createApp({tavilyMode:'mock'});
 try{expect((await app.inject('/api/analysis/readiness')).json()).toMatchObject({mode:'mock',searchAllowance:{used:0,limit:3,remaining:3},modelCanRequest:false});expect(forbidden).not.toHaveBeenCalled();}finally{await app.close();forbidden.mockRestore();}
});
