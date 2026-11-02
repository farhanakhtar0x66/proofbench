import {expect,it} from 'vitest';
import {classifyClaim,extractClaims} from '../packages/tavily/src/claims';
import {verifyAnswer} from '../packages/tavily/src/index';

it('extracts list statements while retaining decimal prices and dotted versions',()=>{
 expect(extractClaims('# Answer\n- Acme costs $2.50 monthly.\n2. Acme version is 3.2.1.\nWho runs Acme?\n```js\nconst price = 7;\n```')).toEqual(['Acme costs $2.50 monthly.','Acme version is 3.2.1.']);
});
it.each([
 ['Acme costs ₹499 monthly.','pricing'],
 ['Acme version is 3.2.1.','version'],
 ['Acme CEO is Ada.','leadership'],
 ['The Example law is effective today.','law'],
 ['Acme policy allows refunds.','policy'],
 ['Acme revenue grew 20%.','statistics'],
])('categorizes %s',(text,category)=>expect(classifyClaim(text).category).toBe(category));
it('limits extracted candidates and omits explicit opinions',()=>{
 expect(extractClaims('I prefer Acme.')).toEqual([]);
 expect(extractClaims(Array.from({length:60},(_,i)=>`Acme version ${i} is available.`).join('\n'))).toHaveLength(50);
});
it('skips ambiguous claims without spending a request',async()=>{
 let calls=0;
 const fetcher:typeof fetch=async()=>{calls++;return Response.json({results:[]});};
 const result=await verifyAnswer({version:'1',text:'The latest release is version 3.'},{mode:'live',allowPaidRequests:'true',maxRequests:1,apiKey:'test-key',fetch:fetcher});
 expect(calls).toBe(0);expect(result.claims[0].outcome).toBe('inconclusive');expect(result.claims[0].uncertainty).toContain('explicit entity');
});
