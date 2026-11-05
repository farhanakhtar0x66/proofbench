import {expect,it,vi} from 'vitest';
import {prepareVerificationBenchmark} from '../scripts/verification-benchmark-lib';
it('locks benchmark inputs, runs only the deterministic baseline and makes no external calls',async()=>{
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Network forbidden'));
 try{
  const report=await prepareVerificationBenchmark();
  expect(report.cases).toHaveLength(10);expect(report.externalRequests).toBe(0);expect(network).not.toHaveBeenCalled();
  expect(report.datasetHash).toMatch(/^[a-f0-9]{64}$/u);expect(report.evidenceHash).toMatch(/^[a-f0-9]{64}$/u);
  expect(report.arms[1].status).toBe('pending');expect(report.arms[1].summary).toBeNull();expect(report.arms[0].summary?.falseDecisive).toBe(0);
  expect(report.cases.every(item=>item.rationale&&item.evidence.claim&&item.evidence.evidence.every(source=>source.title.includes('SIMULATED')))).toBe(true);
  expect(report.limits.maximumFutureModelAttempts).toBe(9);
 }finally{network.mockRestore();}
});
