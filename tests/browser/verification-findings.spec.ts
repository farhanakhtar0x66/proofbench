import {test,expect} from '@playwright/test';
import {demoRun} from '../../packages/contracts/src/examples';
import {extractClaims} from '../../packages/tavily/src/claims';

// Use the real extractor with controlled API responses to isolate UI rendering.
test.beforeEach(async({page})=>{
 await page.route('**/api/capabilities',route=>route.fulfill({json:{version:'1',implementation:'mock',agent:demoRun.agent,capabilities:{execute:false,benchmarks:false,verify:true,native:false},limitations:['Offline regression test']}}));
 await page.route('**/api/verify',async route=>{
  const {text}=route.request().postDataJSON() as {text:string};
  const now=new Date().toISOString();
  const result={version:'1',id:'ui-check',mode:'mock',createdAt:now,text,claims:extractClaims(text).map((claim,i)=>({version:'1',id:`claim-${i}`,text:claim,timeSensitive:'unknown',outcome:claim==='Python 2 is currently supported.'?'contradicted':'inconclusive',freshness:claim==='Python 2 is currently supported.'?'stale':'unknown',freshnessScore:null,asOf:now,uncertainty:'No exact offline fixture. Controlled UI regression response.',evidence:claim==='Python 2 is currently supported.'?[{url:'https://www.python.org/doc/sunset-python-2/',title:'Offline reference: python2-eol',retrievedAt:null,recordedAt:now,excerpt:'Python 2 support ended.',relation:'contradicts',retrieval:'fixture'}]:[]}))};
  await route.fulfill({status:201,json:result});
 });
 await page.goto('/');
 await page.getByRole('link',{name:'Verifier',exact:true}).click();
 await page.getByLabel('Verification flow').selectOption('fixture');
});

test('explains why a question produces zero extracted claims instead of a blank panel',async({page})=>{
 await page.getByLabel('Paste an answer or factual statement').fill('Is Ronaldo captain of Real Madrid?');
 await page.getByRole('button',{name:'Verify answer →'}).click();
 await expect(page.getByRole('status')).toContainText('No factual claims were found.');
 await expect(page.getByText('0 CLAIMS',{exact:true})).toBeVisible();
 await expect(page.getByText('nothing was verified.',{exact:false})).toBeVisible();
});

test('still shows inconclusive findings for an unfamiliar factual statement',async({page})=>{
 await page.getByLabel('Paste an answer or factual statement').fill('Ronaldo is captain of Real Madrid.');
 await page.getByRole('button',{name:'Verify answer →'}).click();
 await expect(page.getByText('inconclusive',{exact:true})).toBeVisible();
 await expect(page.getByText('No exact offline fixture.',{exact:false})).toBeVisible();
});

test('still shows findings for the supported stale offline fixture',async({page})=>{
 await page.getByLabel('Paste an answer or factual statement').fill('Python 2 is currently supported.');
 await page.getByRole('button',{name:'Verify answer →'}).click();
 await expect(page.getByText('contradicted',{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:/Offline reference: python2-eol/})).toBeVisible();
});
