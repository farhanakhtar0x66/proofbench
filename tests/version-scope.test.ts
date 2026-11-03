import {expect,it} from 'vitest';
import {parseVersion} from '../packages/tavily/src/versions';
import {compareEvidence} from '../packages/tavily/src/comparison';
import {canonicalInterpretation} from '../packages/tavily/src/interpretation';
import {practiceVerification} from '../scripts/practice-lib';

const now='2026-11-03T00:00:00.000Z';
it.each([
 ['Acme’s latest API version is v3.','acme','version/api/unspecified','3'],
 ["The latest version of Acme's API is 3.",'acme','version/api/unspecified','3'],
 ['Acme SDK’s current stable release is 2.1.','acme','version/sdk/stable','2.1'],
 ['Acme’s beta app version is 5.','acme','version/app/beta','5'],
 ['Acme latest mobile application version is 5.','acme','version/mobile app/unspecified','5'],
 ['Acme latest SDK version is v2.1-beta.1.','acme','version/sdk/beta','2.1-beta.1'],
])('parses %s',(text,entity,scope,value)=>expect(parseVersion(text)).toEqual({entity,kind:'version',scope,value}));
it.each([
 ['Acme latest API version is 3.','Acme latest app version is 5.'],
 ['Acme latest SDK version is 3.','Acme latest API version is 5.'],
 ['Acme latest stable API version is 3.','Acme latest beta API version is 5.'],
 ['Acme latest API version is 3.','Acme latest stable API version is 3.'],
 ['Acme latest API version is 3.','Acme latest version is 3.'],
 ['Acme latest mobile app version is 3.','Acme latest desktop app version is 5.'],
])('does not compare mismatched or omitted scopes: %s',(claim,content)=>{
 expect(compareEvidence(claim,{content,published_date:now},now)).toBe('context');
});
it('matches paraphrases with the same scope and detects changed values',()=>{
 expect(compareEvidence("The latest version of Acme's API is v3.",{content:'Acme latest API version is 4.',published_date:now},now)).toBe('contradicts');
 expect(compareEvidence('Acme SDK’s current stable release is 2.1.',{content:'Acme latest stable SDK version is v2.1.',published_date:now},now)).toBe('supports');
});
it('rejects inconsistent explicit and prerelease channels',()=>expect(parseVersion('Acme latest stable SDK version is 2.1-beta.1.')).toBeUndefined());
it('prevents optional interpretation from dropping explicit component/channel qualifiers',()=>{
 const output={entity:'Acme',kind:'version',value:'3',currency:null,period:null,time:null,region:null,tier:null};
 expect(canonicalInterpretation('Acme latest API release is 3.',output)).toBeUndefined();
 expect(canonicalInterpretation('Acme latest beta release is 3.',output)).toBeUndefined();
});
it('applies scope separation through offline practice',async()=>{
 const claim='Acme latest API version is 3.';
 const report=await practiceVerification(claim,['Acme latest app version is 5.','Acme latest app version is 5.']);
 expect(report.outcome).toBe('inconclusive');expect(report.freshnessScore).toBeNull();
});
