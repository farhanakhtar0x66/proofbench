import { describe, it, expect } from 'vitest';
import { UsageObservation, RunRecord, VerifyRequest, EvidenceReport, AgentExecutionConfig, WorkspaceIdentity, PerAgentOutcome, BenchmarkSession, ComparisonReport } from '../packages/contracts/src/index';
import { demoRun, demoReport, demoWorkspace, demoAgentConfig, demoOutcome, demoSession, demoComparisonReport } from '../packages/contracts/src/examples';
describe('v1 runtime contracts',()=>{
 it('preserves missing usage and rejects invented zero',()=>{
  expect(UsageObservation.parse({status:'missing',reason:'not reported'})).not.toHaveProperty('value');
  expect(UsageObservation.safeParse({status:'missing',reason:'not reported',value:0}).success).toBe(false);
  expect(UsageObservation.safeParse({status:'known',value:-1,unit:'tokens',source:'provider'}).success).toBe(false);
 });
 it('requires estimation provenance and comparability scope',()=>{
  expect(UsageObservation.safeParse({status:'estimated',value:10,unit:'tokens'}).success).toBe(false);
  expect(UsageObservation.safeParse({status:'incomparable',reason:'different tokenizer'}).success).toBe(true);
 });
 it('validates examples and rejects incompatible versions',()=>{
  expect(RunRecord.safeParse(demoRun).success).toBe(true);
  expect(EvidenceReport.safeParse(demoReport).success).toBe(true);
  expect(RunRecord.safeParse({...demoRun,version:'2'}).success).toBe(false);
 });
 it('validates benchmark session and comparison contracts',()=>{
  expect(WorkspaceIdentity.safeParse(demoWorkspace).success).toBe(true);
  expect(AgentExecutionConfig.safeParse(demoAgentConfig).success).toBe(true);
  expect(PerAgentOutcome.safeParse(demoOutcome).success).toBe(true);
  expect(BenchmarkSession.safeParse(demoSession).success).toBe(true);
  expect(ComparisonReport.safeParse(demoComparisonReport).success).toBe(true);
  expect(BenchmarkSession.safeParse({...demoSession,version:'2'}).success).toBe(false);
  expect(ComparisonReport.safeParse({...demoComparisonReport,version:'2'}).success).toBe(false);
 });
 it('bounds arbitrary verification input',()=>{
  expect(VerifyRequest.safeParse({version:'1',text:'   '}).success).toBe(false);
  expect(VerifyRequest.safeParse({version:'1',text:'x'.repeat(20001)}).success).toBe(false);
 });
});
it('rejects mismatched token, timing and cost units at the public boundary',()=>{
 for(const [field,unit] of [['inputTokens','USD'],['outputTokens','ms'],['duration','tokens'],['cost','tokens']]){
  const run={...demoRun,usage:{...demoRun.usage,[field]:{status:'known',value:5,unit,source:'provider',scope:'run'}}};
  expect(RunRecord.safeParse(run).success).toBe(false);
 }
});
