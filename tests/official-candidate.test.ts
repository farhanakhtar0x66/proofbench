import {expect,it} from 'vitest';
import {rankSources,type SourcePolicy} from '../packages/tavily/src/sources';
import {verifyAnswer} from '../packages/tavily/src/index';

const claim='Acme Pro costs USD 20/month.';
const now='2026-11-03T00:00:00.000Z';
const source={url:'https://acme.example/pricing',title:'Acme Pro Pricing',content:claim,published_date:now};
it('finds a likely official candidate without a reviewed mapping',()=>{
 const ranked=rankSources(claim,[source],now);
 expect(ranked[0].tier).toBe('likely_official');expect(ranked[0].reason).toContain('Ownership is not verified');
});
it.each([
 {url:'https://acme.example.evil.example/pricing'},
 {url:'https://acme-official.example/pricing'},
 {url:'https://notacme.example/pricing'},
 {url:'https://acme.github.io/pricing'},
 {url:'https://xn--bcher-kva.example/pricing'},
 {url:'http://acme.example/pricing'},
 {url:'https://acme.example/reviews'},
 {url:'https://acme.example/pricing-fake'},
 {title:'Acme Product Review'},
 {title:undefined},
 {content:'Unrelated pricing announcement.'},
 {published_date:undefined},
 {published_date:'2020-01-01T00:00:00Z'},
])('abstains when identity/page/direct-evidence signals fail: %j',overrides=>{
 expect(rankSources(claim,[{...source,...overrides}],now)[0].tier).toBe('unreviewed');
});
it('keeps both manually reviewed tiers above automatic candidates',()=>{
 const policy:SourcePolicy={official:[{entities:['Acme Pro'],domain:'official.example',paths:['/pricing']}],secondary:[{entities:['Acme Pro'],domain:'review.example'}]};
 const ranked=rankSources(claim,[source,{...source,url:'https://official.example/pricing'},{...source,url:'https://review.example/article'}],now,policy);
 expect(ranked.map(item=>item.tier)).toEqual(['official_direct','reviewed_secondary','likely_official']);
});
it('supports exact brand documentation and leadership paths',()=>{
 for(const [text,url,title] of [
  ['Orbit latest API version is 3.','https://docs.orbit.example/releases','Orbit API Releases'],
  ['The current CEO of Cedar Labs is Maya Chen.','https://cedarlabs.example/about/leadership','Cedar Labs Leadership'],
 ])expect(rankSources(text,[{url,title,content:text,published_date:now}],now)[0].tier).toBe('likely_official');
});
it('does not treat an inferred brand root and its docs subdomain as independent groups',()=>{
 const ranked=rankSources(claim,[source,{...source,url:'https://docs.acme.example/pricing'}],now);
 expect(ranked.map(item=>item.group)).toEqual(['acme.example','acme.example']);
});
it('uses one injected claim search only and does not report automatic candidates as reviewed',async()=>{
 let calls=0;
 const fetcher:typeof fetch=async()=>{
  calls++;
  return Response.json({results:[{...source,published_date:new Date().toISOString()}]});
 };
 const report=await verifyAnswer({version:'1',text:claim},{mode:'live',allowPaidRequests:'true',apiKey:'fake-test-key',maxRequests:1,fetch:fetcher});
 expect(calls).toBe(1);expect(report.claims[0].outcome).toBe('inconclusive');
 expect(report.claims[0].evidence[0].sourceTier).toBe('likely_official');
 expect(report.claims[0].uncertainty).toContain('0 reviewed, 1 likely official (unverified)');
});
