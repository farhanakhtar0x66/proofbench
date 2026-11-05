import {practiceVerification} from './practice-lib';

const claim='Acme Pro costs USD 20/month.';
const demos=[
 {name:'1. Supported',sources:['Acme Pro costs USD 20/month.','The monthly price of Acme Pro is USD 20.'],expected:'supported',score:100},
 {name:'2. Contradicted',sources:['Acme Pro costs USD 25/month.','The monthly price of Acme Pro is USD 25.'],expected:'contradicted',score:0},
 {name:'3. Inconclusive',sources:['Acme Pro costs USD 20/month.','Acme Pro costs USD 25/month.'],expected:'inconclusive',score:null},
] as const;
console.log('OFFLINE DEMO: simulated source identities and dates. No Tavily, Ollama, keys or credit usage.');
console.log('This demonstrates comparison logic, not live factual correctness.\n');
for(const demo of demos){
 const result=await practiceVerification(claim,[...demo.sources]);
 console.log(demo.name);console.log(`Claim: ${claim}`);
 demo.sources.forEach((text,i)=>console.log(`Simulated source ${i+1}: ${text}`));
 console.log(`Result: ${result.outcome} / ${result.freshness}; score: ${result.freshnessScore??'unavailable'}`);
 console.log(`${result.explanation}\n`);
 if(result.outcome!==demo.expected||result.freshnessScore!==demo.score)throw new Error('Demo regression: result does not match the recorded expectation.');
}
console.log('All three demo outcomes matched. Scores are coarse validity indicators, not confidence percentages.');
