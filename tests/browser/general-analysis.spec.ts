import {test,expect} from '@playwright/test';
import {AnalysisReport} from '../../packages/contracts/src/index';

test('general analysis uses the real offline API with accurate mode and no fabricated sources',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/Freshness verifier/}).click();
 await expect(page.getByLabel('Verification flow')).toHaveValue('general');
 await expect(page.getByText('Backend is in offline mode.',{exact:false})).toBeVisible();
 await page.getByLabel('Paste an answer or factual statement').fill('Acme Pro costs USD 20/month.');
 await page.getByRole('button',{name:'Verify answer →'}).click();
 await expect(page.getByText('inconclusive',{exact:true})).toBeVisible();
 await expect(page.getByText('Freshness score: unavailable',{exact:false})).toBeVisible();
 expect(await page.locator('.source-evidence a').count()).toBe(0);
 await page.getByLabel('Paste an answer or factual statement').fill('Is Ronaldo captain of Real Madrid?');
 await page.getByRole('button',{name:'Verify answer →'}).click();
 await expect(page.getByRole('status')).toContainText('No factual claims were found.');
});

test('shows per-claim verdicts, source warnings and corrections from a validated simulated response',async({page,request})=>{
 await page.route('**/api/analysis/status',route=>route.fulfill({json:{version:'1',mode:'live',extractionMode:'rules',comparisonMode:'llm',modelReady:true,modelDescription:'Bifrost → gemini/test'}}));
 await page.route('**/api/analysis',async route=>{
  const {text}=route.request().postDataJSON();
  const offline=await request.post('/api/analysis',{data:{version:'1',text}});
  const report=AnalysisReport.parse(await offline.json());
  report.mode='live';
  report.results.forEach((result,index)=>{
   const comparison=result.comparison;comparison.outcome=index===0?'supported':index===1?'contradicted':'inconclusive';
   comparison.explanation=index===2?'Model timed out; cached evidence retained.':'Simulated evidence assessment.';
   const now=new Date().toISOString();
   result.retrieval.status='retrieved';result.retrieval.mode='live';result.retrieval.evidence=[0,1].map(sourceIndex=>({url:`https://source${index}-${sourceIndex}.example/notice`,title:`Simulated notice ${index}-${sourceIndex}`,excerpt:'Replacement statement.',retrievedAt:now,publishedAt:now,relation:'context',retrieval:'tavily'}));
   comparison.citations=result.retrieval.evidence.map((source,sourceIndex)=>({sourceId:`S${sourceIndex+1}`,url:source.url,quote:source.excerpt,relation:index===2?'insufficient':index===1?'contradicts':'supports',eligible:index!==2,dateReason:'Simulated recent date.',scopeReason:index===2?'Wrong role context.':undefined,publishedAt:now,retrievedAt:now}));
   if(index===0){comparison.method='llm';comparison.freshness='current';comparison.freshnessScore=50;comparison.freshnessScoreReason='Simulated evidence recency only, not truth confidence.';}
   if(index===1)comparison.correction={text:'Replacement statement.',sourceIds:['S1','S2']};
  });
  await route.fulfill({status:201,json:AnalysisReport.parse(report)});
 });
 await page.goto('/');await page.getByRole('button',{name:/Freshness verifier/}).click();
 await page.getByLabel('Paste an answer or factual statement').fill('First statement. Second statement. Third statement. Fourth statement.');
 await page.getByRole('button',{name:'Verify answer →'}).click();
 for(const verdict of ['supported','contradicted','inconclusive'])await expect(page.getByText(verdict,{exact:true})).toBeVisible();
 await expect(page.getByText('Freshness score: 50/100 (evidence recency)',{exact:false})).toBeVisible();
 await expect(page.getByText('Simulated evidence recency only, not truth confidence.',{exact:true})).toBeVisible();
 await expect(page.getByText('Evidence-backed correction',{exact:true})).toBeVisible();
 await expect(page.getByText('Wrong role context.',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('1 additional distinct extracted claim(s)',{exact:false})).toBeVisible();
 await expect(page.getByText('Published/updated estimate:',{exact:false}).first()).toBeVisible();
 await expect(page.locator('.source-evidence a').first()).toHaveAttribute('rel','noreferrer');
 await page.screenshot({path:`.local/screenshots/analysis-${test.info().project.name}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('blocks duplicate submissions while pending and shows a recoverable error without retrying',async({page})=>{
 let release!:()=>void;const waiting=new Promise<void>(resolve=>{release=resolve;});let requests=0;
 await page.route('**/api/analysis',async route=>{requests++;await waiting;await route.fulfill({status:503,json:{}});});
 await page.goto('/');await page.getByRole('button',{name:/Freshness verifier/}).click();
 await page.getByRole('button',{name:'Verify answer →'}).click();
 await expect(page.getByRole('button',{name:'Checking…'})).toBeDisabled();
 await expect(page.getByLabel('Paste an answer or factual statement')).toBeDisabled();
 await expect(page.getByRole('status')).toContainText('no automatic retries');
 release();await expect(page.getByRole('alert')).toContainText('503');
 await expect(page.getByRole('button',{name:'Verify answer →'})).toBeEnabled();expect(requests).toBe(1);
});
