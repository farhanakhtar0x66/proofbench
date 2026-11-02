import {writeFile,mkdir} from 'node:fs/promises';
import cases from '../fixtures/freshness-cases/v1.json';
import {verifyAnswer} from '../packages/tavily/src/index';
const results=await Promise.all(cases.map(async c=>{
 const result=await verifyAnswer({version:'1',text:c.statement});const actual=result.claims[0];
 return {id:c.id,domain:c.domain,expected:c.expectedOutcome,actual:actual.outcome,expectedFreshness:c.expectedFreshness,actualFreshness:actual.freshness,passed:actual.outcome===c.expectedOutcome&&actual.freshness===c.expectedFreshness,uncertainty:c.uncertainty};
}));
await mkdir('.local/evaluation',{recursive:true});
await writeFile('.local/evaluation/report.json',JSON.stringify({mode:'offline-fixture-regression',warning:'Fixtures are the mock lookup source; this is plumbing regression, not independent accuracy validation.',total:results.length,failures:results.filter(r=>!r.passed),results},null,2));
console.log(`${results.filter(r=>r.passed).length}/${results.length} offline fixture regressions passed. Not an accuracy estimate. Report: .local/evaluation/report.json`);
if(results.some(r=>!r.passed))process.exitCode=1;
