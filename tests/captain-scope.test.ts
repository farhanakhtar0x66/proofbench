import {expect,it,vi} from 'vitest';
import {sourceScopeReason,compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';

const claim='Alex is captain of Example FC.';
it.each(['I started as captain for the second time.','Sometimes I get the armband at the end of the match.','The goalkeeper served as captain against Club B.'])('does not confuse temporary captaincy with ongoing role: %s',excerpt=>expect(sourceScopeReason(claim,excerpt)).toContain('Match-specific'));
it('allows explicitly match-scoped claims to proceed to semantic assessment',()=>{
 expect(sourceScopeReason('Alex was captain against Club B in that match.','Alex started as captain.')).toBeUndefined();
});
it('does not reject an explicit club appointment solely because the article also discusses a game',()=>{
 expect(sourceScopeReason(claim,'Alex is the club captain. Alex started as captain against Club B.')).toBeUndefined();
 expect(sourceScopeReason('Alex is CEO of Example Corp.','Alex served as captain against Club B.')).toBeUndefined();
});
it('abstains on two dated match reports before inference and returns scope warnings',async()=>{
 const now=new Date().toISOString();const compareEvidence=vi.fn();
 const input=EvidenceRetrievalReport.parse({version:'1',claim,query:claim,mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,message:'Synthetic match coverage',limitations:[],evidence:['I started as captain for the second time.','The goalkeeper served as captain against Club B.'].map((excerpt,i)=>({url:`https://${i?'second':'first'}.example`,title:'Match report',excerpt,relation:'context',retrieval:'tavily',publishedAt:now,retrievedAt:now}))});
 const result=await compareClaimEvidence(input,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence}});
 expect(result.outcome).toBe('inconclusive');expect(result.correction).toBeNull();expect(result.citations.every(c=>!c.eligible&&!!c.scopeReason)).toBe(true);expect(compareEvidence).not.toHaveBeenCalled();
});
