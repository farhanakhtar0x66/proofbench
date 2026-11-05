import {expect,it} from 'vitest';
import {ClaimVerification} from '../packages/contracts/src/index';
import {verifyAnswer} from '../packages/tavily/src/index';
import {freshnessScore} from '../packages/tavily/src/freshness';

const base={version:'1' as const,id:'test',text:'Acme latest version is 2.',timeSensitive:'yes' as const,outcome:'supported' as const,freshness:'current' as const,asOf:'2026-11-02T00:00:00.000Z',uncertainty:'test',evidence:[]};
it('accepts legacy claims and validates numeric score bounds',()=>{
 expect(ClaimVerification.safeParse(base).success).toBe(true);
 for(const score of [null,0,100])expect(ClaimVerification.safeParse({...base,freshnessScore:score}).success).toBe(true);
 for(const score of [-1,101,50.5,'100',NaN,Infinity])expect(ClaimVerification.safeParse({...base,freshnessScore:score}).success).toBe(false);
});
it('does not invent scores for fixtures or unsupported verdicts',async()=>{
 const report=await verifyAnswer({version:'1',text:'Python 2 is currently supported.'},{mode:'mock'});
 expect(report.claims[0].freshnessScore).toBeNull();
 expect(freshnessScore(base,'live')).toBeNull();
});
it('requires recent corroboration and rejects conflicting evidence',()=>{
 const evidence=[0,1].map(i=>({url:`https://source${i}.example/page`,title:'test',retrievedAt:base.asOf,publishedAt:base.asOf,excerpt:'test',relation:'supports' as const,retrieval:'tavily' as const}));
 expect(freshnessScore({...base,evidence},'live')).toBe(100);
 expect(freshnessScore({...base,evidence},'mock')).toBeNull();
 expect(freshnessScore({...base,evidence:evidence.map(item=>({...item,publishedAt:'2020-01-01T00:00:00.000Z'}))},'live')).toBeNull();
 expect(freshnessScore({...base,evidence:[...evidence,{...evidence[0],relation:'contradicts'}]},'live')).toBeNull();
});
