import {it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app';
import {task} from '../packages/contracts/src/examples';
import {verifyAnswer} from '../packages/tavily/src/index';
import {selectAdapter} from '../packages/agent-adapters/src/index';
it('unknown claims remain inconclusive and offline',async()=>{
 const report=await verifyAnswer({version:'1',text:'The moon is made of cheese.'});
 expect(report.mode).toBe('mock'); expect(report.claims[0].outcome).toBe('inconclusive'); expect(report.claims[0].evidence).toEqual([]);
});
it('02 rejects unavailable execution instead of simulating success',async()=>{
 const adapter=selectAdapter('02');
 expect(adapter.descriptor.implementation).toBe('02');
 expect(adapter.capabilities.execute).toBe(false);
 await expect(adapter.run({version:'1',task,agentId:adapter.descriptor.id,seed:0})).rejects.toThrow('not integrated');
});
it('01 provides working token-efficient coding agent implementation',async()=>{
 const adapter=selectAdapter('01');
 expect(adapter.descriptor.implementation).toBe('01');
 expect(adapter.capabilities.execute).toBe(true);
 expect(adapter.capabilities.benchmarks).toBe(true);
});
it('rejects invalid configuration',()=>expect(()=>selectAdapter('oops')).toThrow());
it('serves health, validates input, persists verification and links runs, reports, traces',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'proofbench-test-'));
 const app=await createApp({dataDir:dir,implementation:'mock'});
 try {
 expect((await app.inject('/api/health')).statusCode).toBe(200);
 expect((await app.inject('/api/capabilities')).json().capabilities.execute).toBe(true);
 expect((await app.inject({method:'POST',url:'/api/verify',payload:{text:''}})).statusCode).toBe(400);
 const verification=await app.inject({method:'POST',url:'/api/verify',payload:{version:'1',text:'Python 2 is currently supported.'}});
 expect(verification.statusCode).toBe(201);
 expect(verification.json().claims[0].outcome).toBe('contradicted');
 const run=await app.inject({method:'POST',url:'/api/runs',payload:{version:'1',task,agentId:'mock-local'}});
 expect(run.statusCode).toBe(201);
 expect(run.json().usage.inputTokens.status).toBe('missing');
 expect((await app.inject(`/api/runs/${run.json().id}/trace`)).json().events.length).toBeGreaterThan(0);
 expect((await app.inject(`/api/reports/${run.json().reportId}`)).statusCode).toBe(200);
 expect((await app.inject('/api/runs/not-found')).statusCode).toBe(404);
 await app.close();
 const reopened=await createApp({dataDir:dir,implementation:'mock'});
 expect((await reopened.inject(`/api/verify/${verification.json().id}`)).statusCode).toBe(200);
 await reopened.close();
 } finally {await app.close();await rm(dir,{recursive:true,force:true});}
});
it('returns 501 for unintegrated Bifrost while verification remains available',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'proofbench-test-'));
 const app=await createApp({dataDir:dir,implementation:'02'});
 try {
 expect((await app.inject({method:'POST',url:'/api/runs',payload:{version:'1',task,agentId:'bifrost-02'}})).statusCode).toBe(501);
 expect((await app.inject({method:'POST',url:'/api/verify',payload:{version:'1',text:'A claim.'}})).statusCode).toBe(201);
 } finally {await app.close();await rm(dir,{recursive:true,force:true});}
});
it('preserves explicit historical scope without applying a current fixture verdict',async()=>{
 const asOf='2019-01-01T00:00:00.000Z';
 const result=await verifyAnswer({version:'1',text:'Python 2 is currently supported.',claims:[{text:'Python 2 is currently supported.',asOf}]});
 expect(result.claims[0].outcome).toBe('inconclusive');
 expect(result.claims[0].asOf).toBe(asOf);
});
it('never invents a retrieval timestamp for offline annotations',async()=>{
 const result=await verifyAnswer({version:'1',text:'Python 2 is currently supported.'});
 expect(result.claims[0].evidence[0].retrievedAt).toBeNull();
});

it('lists discovered runs with deterministic sorting and bounds', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'proofbench-test-runs-'));
 const app = await createApp({ dataDir: dir, implementation: 'mock' });
 try {
  const initial = await app.inject('/api/runs');
  expect(initial.statusCode).toBe(200);
  expect(initial.json().runs).toEqual([]);

  await app.inject({ method: 'POST', url: '/api/runs', payload: { version: '1', task, agentId: 'mock-local' } });
  await app.inject({ method: 'POST', url: '/api/runs', payload: { version: '1', task, agentId: 'mock-local' } });

  const listed = await app.inject('/api/runs');
  expect(listed.statusCode).toBe(200);
  expect(listed.json().runs.length).toBe(2);
  expect(listed.json().runs[0].version).toBe('1');
 } finally {
  await app.close();
  await rm(dir, { recursive: true, force: true });
 }
});

it('serves controlled routing benchmark comparison with truthful Task 2 data', async () => {
 const app = await createApp({ implementation: 'mock' });
 try {
  const res = await app.inject('/api/benchmarks/controlled');
  expect(res.statusCode).toBe(200);
  const json = res.json();
  expect(json.taskId).toBe('task-2-missing-feature');
  expect(json.summary.controlled_direct_frontier.avgTotalTokens).toBe(7766);
  expect(json.summary.controlled_escalation_only.avgTotalTokens).toBe(4461);
  expect(json.summary.controlled_bidirectional_adaptive.avgTotalTokens).toBe(6215);
  expect(json.attribution.modelSelectionTokensSaved).toBe(3305);
 } finally {
  await app.close();
 }
});

it('executes asynchronous jobs with durable status and polling support', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'proofbench-test-jobs-'));
 const app = await createApp({ dataDir: dir, implementation: 'mock' });
 try {
  const submission = await app.inject({
   method: 'POST',
   url: '/api/jobs',
   payload: { version: '1', task, agentId: 'mock-local' },
  });
  expect(submission.statusCode).toBe(202);
  const { jobId } = submission.json();
  expect(jobId).toBeDefined();

  // Poll until completed
  let job = null;
  for (let i = 0; i < 20; i++) {
   const res = await app.inject(`/api/jobs/${jobId}`);
   expect(res.statusCode).toBe(200);
   job = res.json();
   if (job.status === 'completed' || job.status === 'failed') break;
   await new Promise((r) => setTimeout(r, 50));
  }
  expect(job.status).toBe('completed');
  expect(job.runId).toBeDefined();

  const completedRun = await app.inject(`/api/runs/${job.runId}`);
  expect(completedRun.statusCode).toBe(200);
 } finally {
  await app.close();
  await rm(dir, { recursive: true, force: true });
 }
});

it('rejects jobs for tasks outside allowed scope', async () => {
 const app = await createApp({ implementation: 'mock' });
 try {
  const badTask = { ...task, id: 'unauthorized-task-uuid', fixtureId: undefined };
  const res = await app.inject({
   method: 'POST',
   url: '/api/jobs',
   payload: { version: '1', task: badTask, agentId: 'mock-local' },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().error).toBe('invalid_task');
 } finally {
  await app.close();
 }
});

it('returns 503 when Bifrost gateway is unreachable during live coding job preflight', async () => {
 const oldUrl = process.env.BIFROST_GATEWAY_URL;
 process.env.BIFROST_GATEWAY_URL = 'http://127.0.0.1:9998'; // Guaranteed dead port
 const app = await createApp({ implementation: '01' });
 try {
  const codingTask = {
   version: '1' as const,
   id: 'task-1-fix-failing-func',
   title: 'Fix bounds bug',
   prompt: 'Fix sliding window',
   acceptance: ['cargo test exits with 0'],
  };
  const res = await app.inject({
   method: 'POST',
   url: '/api/jobs',
   payload: { version: '1', task: codingTask, agentId: 'bifrost-01' },
  });
  expect(res.statusCode).toBe(503);
  expect(res.json().error).toBe('service_unavailable');
  expect(res.json().message).toContain('Bifrost inference gateway unreachable');
 } finally {
  process.env.BIFROST_GATEWAY_URL = oldUrl;
  await app.close();
 }
});

it('gracefully handles job execution failure and records failed status', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'proofbench-test-failed-job-'));
 const app = await createApp({ dataDir: dir, implementation: 'mock' });
 try {
  // Submit a mock job with a task that fails acceptance
  const failingTask = {
   version: '1' as const,
   id: 'task-sum',
   fixtureId: 'sum-v1',
   title: 'Failing sum task',
   prompt: 'Produce wrong answer',
   acceptance: ['Output exactly 999'],
  };
  const res = await app.inject({
   method: 'POST',
   url: '/api/jobs',
   payload: { version: '1', task: failingTask, agentId: 'mock-local' },
  });
  expect(res.statusCode).toBe(202);
  const { jobId } = res.json();

  let job = null;
  for (let i = 0; i < 20; i++) {
   const poll = await app.inject(`/api/jobs/${jobId}`);
   job = poll.json();
   if (job.status === 'completed' || job.status === 'failed') break;
   await new Promise((r) => setTimeout(r, 50));
  }
  expect(job.status).toBe('failed');
  expect(job.error).toContain('Mock executes only the published sum fixture');
 } finally {
  await app.close();
  await rm(dir, { recursive: true, force: true });
 }
});
