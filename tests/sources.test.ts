import {expect,it} from 'vitest';
import {rankSources,type SourcePolicy} from '../packages/tavily/src/sources';
import {verifyAnswer} from '../packages/tavily/src/index';

const now='2026-11-03T00:00:00.000Z';
const claim='Acme Pro costs USD 20/month.';
const policy:SourcePolicy={official:[{entities:['Acme Pro'],domain:'acme.example',paths:['/pricing'],includeSubdomains:true}],secondary:[{entities:['Acme Pro'],domain:'review.example'}]};
const source=(url:string,content=claim)=>({url,content,published_date:now});
it('orders scoped official direct, reviewed secondary and unreviewed sources',()=>{
 const ranked=rankSources(claim,[source('https://blog.example/post'),source('https://review.example/acme'),source('https://acme.example/pricing')],now,policy);
 expect(ranked.map(item=>item.tier)).toEqual(['official_direct','reviewed_secondary','unreviewed']);
 expect(ranked[0].reason).toContain('Reviewed');
});
it.each([
 'https://acme.example.evil.example/pricing',
 'https://evilacme.example/pricing',
 'http://acme.example/pricing',
 'https://acme.example/pricing-fake',
 'https://acme.example/blog',
])('does not trust a misleading or out-of-scope URL: %s',url=>{
 expect(rankSources(claim,[source(url)],now,policy)[0].tier).toBe('unreviewed');
});
it('requires an entity match, recent date and direct comparable content for official direct',()=>{
 expect(rankSources('Other Pro costs USD 20/month.',[source('https://acme.example/pricing')],now,policy)[0].tier).toBe('unreviewed');
 expect(rankSources(claim,[{...source('https://acme.example/pricing'),published_date:undefined}],now,policy)[0].tier).toBe('unreviewed');
 expect(rankSources(claim,[source('https://acme.example/pricing','Unrelated announcement.')],now,policy)[0].tier).toBe('unreviewed');
});
it('groups explicitly allowed subdomains together',()=>{
 const ranked=rankSources(claim,[source('https://docs.acme.example/pricing'),source('https://acme.example/pricing')],now,policy);
 expect(ranked.map(item=>item.group)).toEqual(['acme.example','acme.example']);
});
it('normalizes fragments and tracking parameters without deleting meaningful query parameters',()=>{
 const ranked=rankSources(claim,[source('https://acme.example/pricing?plan=pro'),source('https://acme.example/pricing?utm_source=x&plan=pro#top'),source('https://acme.example/pricing?plan=enterprise')],now,policy);
 expect(ranked[1].duplicateOf).toBe(ranked[0].url);expect(ranked[2].duplicateOf).toBeUndefined();
});
it('prefers the reviewed original when a long passage is copied',()=>{
 const content='This is a detailed pricing announcement with additional background information about the product and its billing policy for customers reviewing their subscription options. '+claim;
 const ranked=rankSources(claim,[source('https://copied.example/post',content),source('https://acme.example/pricing',content)],now,policy);
 expect(ranked[0].tier).toBe('official_direct');expect(ranked[1].duplicateOf).toBe(ranked[0].url);
});
it('does not assume identical short factual sentences were copied',()=>{
 expect(rankSources(claim,[source('https://one.example'),source('https://two.example')],now).every(item=>!item.duplicateOf)).toBe(true);
});
it('prevents copied passages from producing corroboration and retains evidence labels',async()=>{
 const content='This is a detailed pricing announcement with additional background information about the product and its billing policy for customers reviewing their subscription options. '+claim;
 const fetcher:typeof fetch=async()=>Response.json({results:[source('https://acme.example/pricing',content),source('https://copied.example/post',content)].map(item=>({...item,published_date:new Date().toISOString()}))});
 const report=await verifyAnswer({version:'1',text:claim},{mode:'live',allowPaidRequests:'true',apiKey:'fake',maxRequests:1,fetch:fetcher,sourcePolicy:policy});
 expect(report.claims[0].outcome).toBe('inconclusive');expect(report.claims[0].freshnessScore).toBeNull();
 expect(report.claims[0].evidence[0].sourceTier).toBe('official_direct');expect(report.claims[0].evidence[1].duplicateOf).toBeDefined();
});
it('keeps a contradicting unreviewed source visible even when official sources rank first',async()=>{
 const fetcher:typeof fetch=async()=>Response.json({results:[source('https://acme.example/pricing'),source('https://review.example/post'),source('https://other.example/post','Acme Pro costs USD 25/month.')].map(item=>({...item,published_date:new Date().toISOString()}))});
 const report=await verifyAnswer({version:'1',text:claim},{mode:'live',allowPaidRequests:'true',apiKey:'fake',maxRequests:1,fetch:fetcher,sourcePolicy:policy});
 expect(report.claims[0].outcome).toBe('inconclusive');expect(report.claims[0].evidence[2].relation).toBe('contradicts');
});
