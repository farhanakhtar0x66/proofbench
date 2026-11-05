import { describe, it, expect } from 'vitest';
import {
  UsageObservation,
  RunRecord,
  VerifyRequest,
  EvidenceReport,
  TierTransitionEventSchema,
  ControlledBenchmarkExportSchema,
} from '../packages/contracts/src/index';
import { demoRun, demoReport } from '../packages/contracts/src/examples';
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
 it('bounds arbitrary verification input',()=>{
  expect(VerifyRequest.safeParse({version:'1',text:'   '}).success).toBe(false);
  expect(VerifyRequest.safeParse({version:'1',text:'x'.repeat(20001)}).success).toBe(false);
 });
 it('validates UI dashboard trace and benchmark export contracts', () => {
  const validTransition = TierTransitionEventSchema.parse({
   id: 'trans-1',
   sequence: 1,
   fromTier: 'SMALL_LLM',
   toTier: 'STRONGER_LLM',
   sourceModel: 'qwen-1.5b',
   targetModel: 'qwen-9b',
   reason: 'Authorized M3a escalation on borrow error',
   sourceRevision: 'sha256:abc',
   timestamp: new Date().toISOString(),
   boundedInstructions: 'Implement filter predicate',
  });
  expect(validTransition.fromTier).toBe('SMALL_LLM');

  const validBenchmark = ControlledBenchmarkExportSchema.parse({
   version: '1',
   taskId: 'task-9',
   taskTitle: 'Event Service',
   evaluationMode: 'controlled_routing_fair_comparison',
   toolingDisclosed: {
    contextCompilerShared: true,
    mechanicalTransformerShared: true,
    promptCompilerShared: true,
    approvalEngineShared: true,
   },
   policies: {
    controlled_bidirectional_adaptive: {
     policy: 'controlled_bidirectional_adaptive',
     policyLabel: 'Adaptive Execution Engine',
     totalTrials: 1,
     passedTrials: 1,
     failedTrials: 0,
     successRatePercent: 100,
     totalTokensPerAcceptedCompletion: 1540,
     avgTotalTokens: 1540,
     avgWallDurationMs: 1200,
     avgCpuDurationMs: 45,
     avgCostUsd: 0,
     avgModelCalls: 3,
     avgTransitions: 2,
    },
   },
   attribution: {
    deterministicToolingTokensSaved: 350,
    contextCompilationTokensSaved: 850,
    modelSelectionTokensSaved: 500,
    bidirectionalHandoffTokensSaved: 320,
    cpuOverheadMs: 45,
   },
   evidenceSummary: 'Benchmark complete',
  });
  expect(validBenchmark.attribution.bidirectionalHandoffTokensSaved).toBe(320);
 });
});
it('rejects mismatched token, timing and cost units at the public boundary',()=>{
 for(const [field,unit] of [['inputTokens','USD'],['outputTokens','ms'],['duration','tokens'],['cost','tokens']]){
  const run={...demoRun,usage:{...demoRun.usage,[field]:{status:'known',value:5,unit,source:'provider',scope:'run'}}};
  expect(RunRecord.safeParse(run).success).toBe(false);
 }
});
