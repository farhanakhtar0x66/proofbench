import {expect,it,vi} from 'vitest';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {priceCurrencyEvidenceReason} from '../packages/tavily/src/claim-ambiguity';
import {supportedQuantityReason} from '../packages/tavily/src/quantity-evidence';
import {excerptQualityReason} from '../packages/tavily/src/excerpts';

function evidence(claim:string,texts:string[]){
 const now=new Date().toISOString();
 return EvidenceRetrievalReport.parse({version:'1',claim,query:claim,mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,message:'Synthetic regression',limitations:[],evidence:texts.map((excerpt,index)=>({url:`https://source${index}.example/notice`,title:'SIMULATED',excerpt,relation:'context',retrieval:'tavily',publishedAt:now,retrievedAt:now}))});
}
function adapter(texts:string[],relation='supports'){
 return {interpret:vi.fn(),compareEvidence:vi.fn(async()=>({assessments:texts.map((quote,index)=>({sourceId:`S${index+1}`,relation,quote})),correction:null}))};
}
it('does not count model support for twelve players when both excerpts specify eleven',async()=>{
 const claim='Under the standard rules, a team may have at most twelve players on the field.';
 const texts=['Each team is limited to eleven players. The goalkeeper is part of that count.','The maximum is 11 players on the field per side. Substitutes wait off the field.'];
 const model=adapter(texts);const result=await compareClaimEvidence(evidence(claim,texts),{mode:'llm',interpreter:model});
 expect(model.compareEvidence).toHaveBeenCalledOnce();expect(result.method).toBe('llm');
 expect(result.outcome).toBe('inconclusive');expect(result.correction).toBeNull();
 expect(result.citations.every(item=>item.relation==='supports'&&!item.eligible&&item.scopeReason?.includes('numeric count'))).toBe(true);
});
it('keeps word/digit-equivalent counts and model-assessed contradictions available',async()=>{
 const texts=['Each team is limited to eleven players. A goalkeeper is included.','The limit is 11 players per side on the field. Bench substitutes are separate.'];
 const supported='A team may have at most eleven players on the field.';
 expect((await compareClaimEvidence(evidence(supported,texts),{mode:'llm',interpreter:adapter(texts)})).outcome).toBe('supported');
 const contradicted='A team may have at most twelve players on the field.';
 expect((await compareClaimEvidence(evidence(contradicted,texts),{mode:'llm',interpreter:adapter(texts,'contradicts')})).outcome).toBe('contradicted');
});
it.each([
 ['A plan permits a maximum of twelve users.','This plan allows 12 users.',false],
 ['A plan permits a minimum of three seats.','The stated minimum is 4 seats.',true],
 ['A plan permits at least two requests.','Two requests are required.',false],
 ['A team may have at most twelve players.','There are eleven players.',true],
 ['If approved, a team may have at most twelve players.','There are eleven players.',false],
])('bounds numeric support without inventing opposite verdicts: %s',(claim,text,blocked)=>{
 expect(!!supportedQuantityReason(claim,text)).toBe(blocked);
});
it('blocks currency inference from dollar symbols even if a model would support the USD claim',async()=>{
 const claim='Acme Team costs USD 4 per user/month.';
 const texts=['Acme Team costs $4 per user/month. Add-ons are charged separately.','The Acme Team base subscription is $4 monthly per user. Usage fees are extra.'];
 const model=adapter(texts);const result=await compareClaimEvidence(evidence(claim,texts),{mode:'llm',interpreter:model});
 expect(result.outcome).toBe('inconclusive');expect(model.compareEvidence).not.toHaveBeenCalled();
 expect(result.citations.every(item=>!item.eligible&&item.scopeReason?.includes('USD'))).toBe(true);
});
it.each(['USD 4','US$4','4 US dollars','4 U.S. dollars'])('accepts an explicit USD marker as a currency anchor, not proof of price: %s',amount=>{
 expect(priceCurrencyEvidenceReason('Acme Team costs USD 4/month.',`Acme Team costs ${amount}/month.`)).toBeUndefined();
});
it('does not substitute another currency and requires the product/version for update claims',()=>{
 expect(priceCurrencyEvidenceReason('Acme Team costs CAD 4/month.','Acme Team costs USD 4/month.')).toContain('CAD');
 expect(excerptQualityReason('Python 2 currently receives upstream security updates.','PHP 8.2 receives security updates.')).toContain('matching product/version');
 expect(excerptQualityReason('Python 2 currently receives upstream security updates.','Python 2 no longer receives upstream security updates.')).toBeUndefined();
});
