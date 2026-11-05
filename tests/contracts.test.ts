import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  UsageObservation,
  RunRecord,
  VerifyRequest,
  EvidenceReport,
  TierTransitionEventSchema,
  HandoffPacketExportSchema,
  ModelInferenceProvenanceSchema,
  AttributionBreakdownSchema,
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

 it('validates all shared JSON examples in docs/examples against runtime schemas', async () => {
  const examplesDir = path.resolve(__dirname, '../docs/examples');

  // 1. Tier Transition Event
  const transRaw = await fs.readFile(path.join(examplesDir, 'tier-transition-event.v1.json'), 'utf8');
  const trans = TierTransitionEventSchema.parse(JSON.parse(transRaw));
  expect(trans.fromTier).toBe('NON_LLM');
  expect(trans.toTier).toBe('SMALL_LLM');

  // 2. Handoff Packet Export
  const handoffRaw = await fs.readFile(path.join(examplesDir, 'handoff-packet-export.v1.json'), 'utf8');
  const handoff = HandoffPacketExportSchema.parse(JSON.parse(handoffRaw));
  expect(handoff.direction).toBe('small_to_stronger');

  // 3. Model Inference Provenance
  const provRaw = await fs.readFile(path.join(examplesDir, 'model-inference-provenance.v1.json'), 'utf8');
  const prov = ModelInferenceProvenanceSchema.parse(JSON.parse(provRaw));
  expect(prov.requestedModel).toBe('gguf/Qwen3.5-9B-GGUF:Q4_K_M');

  // 4. Attribution Breakdown
  const attrRaw = await fs.readFile(path.join(examplesDir, 'attribution-breakdown.v1.json'), 'utf8');
  const attr = AttributionBreakdownSchema.parse(JSON.parse(attrRaw));
  expect(attr.modelSelectionTokensSaved).toBe(3305);

  // 5. Controlled Benchmark Export
  const benchRaw = await fs.readFile(path.join(examplesDir, 'controlled-benchmark-export.v1.json'), 'utf8');
  const bench = ControlledBenchmarkExportSchema.parse(JSON.parse(benchRaw));
  expect(bench.evaluationMode).toBe('controlled_routing_fair_comparison');
  expect(bench.policies.controlled_direct_small.passedTrials).toBe(0);
  expect(bench.policies.controlled_direct_frontier.passedTrials).toBe(1);
 });

 it('validates sanitized real dashboard run files in .local/data against contracts', async () => {
  const dataDir = path.resolve(__dirname, '../.local/data');
  const runIds = ['task-10-live', 'task-9-live', 'task-6-live'];

  for (const id of runIds) {
   const runRaw = await fs.readFile(path.join(dataDir, `runs-${id}.json`), 'utf8');
   const run = RunRecord.parse(JSON.parse(runRaw));
   expect(run.id).toBe(id);
   expect(run.status).toBe('completed');
   expect(run.acceptance.status).toBe('passed');

   const traceRaw = await fs.readFile(path.join(dataDir, `trace-${id}.json`), 'utf8');
   const trace = (await import('../packages/contracts/src/index')).ExecutionTrace.parse(JSON.parse(traceRaw));
   expect(trace.runId).toBe(id);
   expect(trace.events.length).toBeGreaterThan(0);

   const reportRaw = await fs.readFile(path.join(dataDir, `reports-${id}.json`), 'utf8');
   const report = EvidenceReport.parse(JSON.parse(reportRaw));
   expect(report.runId).toBe(id);
   expect(report.acceptance.status).toBe('passed');
  }
 });
});
it('rejects mismatched token, timing and cost units at the public boundary',()=>{
 for(const [field,unit] of [['inputTokens','USD'],['outputTokens','ms'],['duration','tokens'],['cost','tokens']]){
  const run={...demoRun,usage:{...demoRun.usage,[field]:{status:'known',value:5,unit,source:'provider',scope:'run'}}};
  expect(RunRecord.safeParse(run).success).toBe(false);
 }
});
