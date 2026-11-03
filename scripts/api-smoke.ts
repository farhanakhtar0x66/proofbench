import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createApp} from '../apps/api/src/app';

process.env.LANGUAGE_MODE='rules';
const dir=await mkdtemp(join(tmpdir(),'proofbench-smoke-'));
const app=await createApp({implementation:'mock',tavilyMode:'mock',dataDir:dir});
try{
 assert.equal((await app.inject('/api/health')).statusCode,200);
 console.log('PASS health');
 const verified=await app.inject({method:'POST',url:'/api/verify',payload:{version:'1',text:'Python 2 is currently supported.'}});
 assert.equal(verified.statusCode,201);
 const report=verified.json();
 assert.equal(report.mode,'mock');assert.equal(report.claims[0].outcome,'contradicted');assert.equal(report.claims[0].freshnessScore,null);
 console.log('PASS offline fixture verification (score unavailable because evidence is offline)');
 assert.equal((await app.inject(`/api/verify/${report.id}`)).statusCode,200);
 console.log('PASS saved report lookup');
 const invalid=await app.inject({method:'POST',url:'/api/verify',payload:{version:'1',text:''}});
 assert.equal(invalid.statusCode,400);assert.ok(invalid.json().message);
 assert.equal((await app.inject('/api/verify/missing-smoke-report')).statusCode,404);
 console.log('PASS invalid request and missing-report handling');
 console.log('Offline API smoke checks passed. No server ports, real Tavily requests or model inference. Temporary reports will be removed.');
}finally{await app.close();await rm(dir,{recursive:true,force:true});}
