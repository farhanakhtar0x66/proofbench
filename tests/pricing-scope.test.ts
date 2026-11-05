import {expect,it} from 'vitest';
import {parsePrice} from '../packages/tavily/src/pricing';
import {compareEvidence} from '../packages/tavily/src/comparison';
import {practiceVerification} from '../scripts/practice-lib';
import {canonicalInterpretation} from '../packages/tavily/src/interpretation';

const now='2026-11-03T00:00:00.000Z';
it.each([
 ['Acme Pro costs USD 20/month in India.','The monthly price of Acme Pro is USD 20 in India.','supports'],
 ["Acme’s Pro plan costs USD 20/month in US.",'Acme Pro costs USD 25/month in United States.','contradicts'],
 ['Acme Pro costs USD 20/month in India.','Acme Pro costs USD 20/month in US.','context'],
 ['Acme Pro costs USD 20/month in India.','Acme Pro costs USD 20/month.','context'],
 ['Acme Pro costs USD 20/month.','Acme Basic costs USD 20/month.','context'],
 ['Acme Pro costs USD 20/month.','Acme costs USD 20/month.','context'],
 ['Acme Pro costs USD 20/month.','Acme Pro costs USD 20/year.','context'],
 ['Acme Pro costs USD 20/month.','Acme Pro costs EUR 20/month.','context'],
 ['Acme Pro costs USD 20/month billed annually.','Acme Pro costs USD 20/month.','context'],
 ['Acme Pro costs USD 20/month billed annually.','Acme Pro costs USD 20/month billed monthly.','context'],
 ['Acme Pro costs USD 20/month billed annually in India.','Acme Pro costs USD 25/month in India billed yearly.','contradicts'],
 ['Acme API costs USD 5 per million input tokens.','Acme API costs USD 15 per million output tokens.','context'],
 ['Acme Team costs USD 20 per user per month.','Acme Team costs USD 20/month.','context'],
 ['Acme Team costs USD 20 per user per month.','Acme Team costs USD 25 per user per month.','contradicts'],
])('compares only matching price scope: %s',(claim,content,expected)=>{
 expect(compareEvidence(claim,{content,published_date:now},now)).toBe(expected);
});
it.each([
 'Acme Pro costs $20/month in India.',
 'Acme Pro costs USD 20/month excluding tax.',
 'Acme Pro costs USD 20/month with a discount.',
 'Acme Pro costs USD 20/month for a trial.',
 'Acme Pro costs USD 20/month billed quarterly.',
 'Acme Pro costs USD 20/month starting tomorrow.',
])('abstains for ambiguous or unsupported price qualifiers: %s',claim=>{
 expect(parsePrice(claim)).toBeUndefined();
});
it('preserves exact plan identity while normalizing explicit plan labels',()=>{
 expect(parsePrice("Acme's Pro plan costs USD 20/month.")?.entity).toBe('acme pro');
 expect(parsePrice('Acme Basic plan costs USD 20/month.')?.entity).toBe('acme basic');
});
it('does not allow model normalization to erase a billing qualifier',()=>{
 const output={entity:'Acme Pro',kind:'price',value:'20',currency:'USD',period:'month',time:null,region:null,tier:null};
 expect(canonicalInterpretation('Acme Pro costs USD 20 per month billed annually.',output)).toBeUndefined();
});
it('uses region-aware comparisons in the offline practice pipeline',async()=>{
 const result=await practiceVerification('Acme Pro costs USD 20/month in India.',['Acme Pro costs USD 25/month in India.','The monthly price of Acme Pro is USD 25 in India.']);
 expect(result.outcome).toBe('contradicted');expect(result.freshnessScore).toBe(0);
 const unrelated=await practiceVerification('Acme Pro costs USD 20/month in India.',['Acme Pro costs USD 25/month in US.','Acme Pro costs USD 25/month in US.']);
 expect(unrelated.outcome).toBe('inconclusive');expect(unrelated.freshnessScore).toBeNull();
});
