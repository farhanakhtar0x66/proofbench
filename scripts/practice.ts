import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {practiceVerification} from './practice-lib';

console.log('OFFLINE PRACTICE — no Tavily requests, credits, API key or saved report.');
console.log('Two sample source statements will be treated as separate, recently published simulated sources.');
console.log('English pricing, CEO and version patterns only. Blank evidence is allowed and cannot confirm a claim.\n');

let claim:string;let sources:[string,string];
if(process.argv.includes('--example')){
 claim='Acme Pro costs USD 20/month.';
 sources=['The monthly price of Acme Pro is USD 25.','Acme Pro currently costs USD 25 per month.'];
}else{
 const prompt=createInterface({input:stdin,output:stdout});
 try{
  claim=await prompt.question('AI claim: ');
  sources=[await prompt.question('Sample evidence 1: '),await prompt.question('Sample evidence 2: ')];
 }finally{prompt.close();}
}
try{
 const result=await practiceVerification(claim,sources);
 console.log(JSON.stringify(result,null,2));
}catch{
 console.error('Could not run practice. Enter a nonempty claim of at most 2,000 characters.');
 process.exitCode=1;
}
