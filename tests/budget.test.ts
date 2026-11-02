import {expect,it} from 'vitest';
import {RequestBudgetExhausted,SearchBudget} from '../packages/tavily/src/budget';
import {verifyAnswer} from '../packages/tavily/src/index';

it('shares the cap across repeated and concurrent verifications',async()=>{
 let calls=0;
 const fetcher:typeof fetch=async()=>{calls++;return Response.json({results:[]});};
 const budget=new SearchBudget();
 const options={mode:'live',allowPaidRequests:'true',apiKey:'test-key',maxRequests:1,fetch:fetcher,budget};
 const reports=await Promise.all(['Acme latest version is 2.','Acme latest version is 2.','Other latest version is 3.'].map(text=>verifyAnswer({version:'1',text},options)));
 expect(calls).toBe(1);expect(reports[2].claims[0].uncertainty).toContain('budget exhausted');
 await verifyAnswer({version:'1',text:'Acme latest version is 2.'},options);
 expect(calls).toBe(1);
});

it('expires cached entries without resetting the budget and preserves fetch time',async()=>{
 let now=Date.parse('2026-11-02T00:00:00Z');let calls=0;
 const budget=new SearchBudget(()=>now);
 const load=async()=>{calls++;return ['evidence'];};
 const first=await budget.search('query','key',2,load);
 now+=1000;
 expect(await budget.search('query','key',2,load)).toEqual(first);
 now+=300000;
 expect((await budget.search('query','key',2,load)).retrievedAt).not.toBe(first.retrievedAt);
 expect(calls).toBe(2);
 now+=300000;
 await expect(budget.search('query','key',2,load)).rejects.toBeInstanceOf(RequestBudgetExhausted);
});

it('counts failed attempts and never refunds or retries them',async()=>{
 const budget=new SearchBudget();let calls=0;
 const load=async()=>{calls++;throw new Error('failure');};
 await expect(budget.search('query','key',1,load)).rejects.toThrow('failure');
 await expect(budget.search('query','key',1,load)).rejects.toBeInstanceOf(RequestBudgetExhausted);
 expect(calls).toBe(1);
});

it('isolates cache by credential and cannot raise an established cap',async()=>{
 const budget=new SearchBudget();
 await budget.search('query','key-a',1,async()=>[]);
 await expect(budget.search('query','key-b',50,async()=>[])).rejects.toBeInstanceOf(RequestBudgetExhausted);
});
