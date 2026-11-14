import {expect,test} from '@playwright/test';

test('loads an actual stored report using GET without submitting a new verification',async({page,request})=>{
 const response=await request.post('http://127.0.0.1:3001/api/analysis',{data:{version:'1',text:'A saved showcase statement.'}});
 expect(response.status()).toBe(201);const report=await response.json();
 const posts:string[]=[];page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/api/analysis'))posts.push(request.url());});
 await page.goto('/');await page.getByRole('link',{name:'Verifier',exact:true}).click();
 await page.getByText('Load a saved assessment',{exact:true}).click();
 await page.getByLabel('Saved assessment ID').fill(report.id);
 await page.getByRole('button',{name:'Load saved assessment',exact:true}).click();
 await expect(page.getByText('This is a previous result, not a new live verification.',{exact:false})).toBeVisible();
 await expect(page.getByLabel('Paste an answer or factual statement')).toHaveValue(report.text);
 expect(posts).toHaveLength(0);
 await page.getByLabel('Paste an answer or factual statement').fill('A different statement.');
 await expect(page.getByText('This is a previous result, not a new live verification.',{exact:false})).toHaveCount(0);
});

test('reports a missing saved assessment without starting verification',async({page})=>{
 await page.goto('/');await page.getByRole('link',{name:'Verifier',exact:true}).click();
 await page.getByText('Load a saved assessment',{exact:true}).click();
 await page.getByLabel('Saved assessment ID').fill('nonexistent-showcase-report');
 await page.getByRole('button',{name:'Load saved assessment',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('404');
});
