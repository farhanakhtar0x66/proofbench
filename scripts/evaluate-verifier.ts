import {mkdir,writeFile} from 'node:fs/promises';
import {practiceVerification} from './practice-lib';

type Outcome='supported'|'contradicted'|'inconclusive';
type Scenario={id:string;claim:string;evidence:[string,string];expected:Outcome;note:string};
const scenarios:Scenario[]=[
 {id:'price-unchanged',claim:'Acme Pro costs USD 20/month.',evidence:['Acme Pro costs USD 20/month.','The monthly price of Acme Pro is USD 20.'],expected:'supported',note:'Equivalent monthly pricing.'},
 {id:'price-changed',claim:'Acme Pro costs USD 20/month.',evidence:['Acme Pro costs USD 25/month.','The monthly price of Acme Pro is USD 25.'],expected:'contradicted',note:'Same currency and period, different amount.'},
 {id:'ceo-unchanged',claim:'Maya Chen is the CEO of Cedar Labs.',evidence:['The current CEO of Cedar Labs is Maya Chen.','Maya Chen is the CEO of Cedar Labs.'],expected:'supported',note:'Different word order.'},
 {id:'ceo-changed',claim:'Maya Chen is the CEO of Cedar Labs.',evidence:['The current CEO of Cedar Labs is Arjun Rao.','Arjun Rao is the CEO of Cedar Labs.'],expected:'contradicted',note:'Same organization, different leader.'},
 {id:'version-changed',claim:"Orbit's latest API version is v3.2.",evidence:['Orbit latest API version is 4.0.','Orbit’s latest API version is v4.0.'],expected:'contradicted',note:'Different current version.'},
 {id:'compound-source',claim:'Acme Pro costs USD 20/month.',evidence:['Acme Pro costs USD 25/month and Maya Chen is the CEO of Cedar Labs.','Acme Pro costs USD 25/month; Maya Chen is the CEO of Cedar Labs.'],expected:'contradicted',note:'Fact appears inside compound source evidence.'},
 {id:'currency-ambiguous',claim:'Acme Pro costs $20/month.',evidence:['Acme Pro costs USD 20/month.','Acme Pro costs USD 20/month.'],expected:'inconclusive',note:'A bare dollar symbol does not establish currency.'},
 {id:'period-mismatch',claim:'Acme Pro costs USD 20/month.',evidence:['Acme Pro costs USD 20/year.','The annual price of Acme Pro is USD 20.'],expected:'inconclusive',note:'Different billing scope.'},
 {id:'source-disagreement',claim:'Acme Pro costs USD 20/month.',evidence:['Acme Pro costs USD 20/month.','Acme Pro costs USD 25/month.'],expected:'inconclusive',note:'Sources conflict.'},
 {id:'evidence-missing',claim:'Acme Pro costs USD 20/month.',evidence:['',''],expected:'inconclusive',note:'No sample evidence.'},
 {id:'pronoun-unresolved',claim:'Acme Pro costs USD 20/month.',evidence:['It costs USD 25/month.','The monthly price is USD 25.'],expected:'inconclusive',note:'Evidence does not name the entity.'},
 {id:'hinglish-gap',claim:'Acme Pro ka price 20 dollar hai.',evidence:['Acme Pro costs USD 25/month.','Acme Pro costs USD 25/month.'],expected:'inconclusive',note:'Hindi/Hinglish understanding is not implemented.'},
 {id:'law-gap',claim:'The Example Act currently requires 30 days notice.',evidence:['The Example Act currently requires 60 days notice.','The Example Act currently requires 60 days notice.'],expected:'inconclusive',note:'Legal interpretation is outside current comparison templates.'},
 {id:'pricing-paraphrase-gap',claim:'Subscribers pay twenty US dollars monthly for Acme Pro.',evidence:['Acme Pro costs USD 25/month.','Acme Pro costs USD 25/month.'],expected:'inconclusive',note:'Spelled numbers and this paraphrase are unsupported.'},
];

const results=[];
for(const scenario of scenarios){
 const result=await practiceVerification(scenario.claim,scenario.evidence);
 const passed=result.outcome===scenario.expected;
 results.push({...scenario,actual:result.outcome,score:result.freshnessScore,explanation:result.explanation,passed});
 console.log(`${passed?'PASS':'FAIL'} ${scenario.id}: ${result.outcome} — ${scenario.note}`);
}
const assessed=results.filter(item=>item.actual!=='inconclusive').length;
const matched=results.filter(item=>item.passed).length;
const summary={total:results.length,matched,assessed,abstained:results.length-assessed,verdictCoverage:assessed/results.length};
const report={simulated:true,createdAt:new Date().toISOString(),notice:'Synthetic development regression, not independent accuracy evaluation. Source identity and dates are simulated; no real-world facts were checked. Coverage is specific to this chosen scenario set.',summary,results};
await mkdir('.local/verifier-evaluation',{recursive:true});
await writeFile('.local/verifier-evaluation/report.json',JSON.stringify(report,null,2));
console.log(`\n${matched}/${results.length} expectations matched. ${assessed}/${results.length} cases received a verdict; ${summary.abstained} were inconclusive.`);
console.log('Synthetic regression only — not an accuracy estimate. Report: .local/verifier-evaluation/report.json');
if(matched!==results.length)process.exitCode=1;
