import { z } from 'zod';

export const TierTransitionEventSchema = z.object({
  id: z.string(),
  sequence: z.number().int().nonnegative(),
  fromTier: z.enum(['NON_LLM', 'SMALL_LLM', 'STRONGER_LLM', 'HALT']),
  toTier: z.enum(['NON_LLM', 'SMALL_LLM', 'STRONGER_LLM', 'HALT']),
  sourceModel: z.string().nullable(),
  targetModel: z.string().nullable(),
  reason: z.string(),
  sourceRevision: z.string(),
  timestamp: z.string(),
  boundedInstructions: z.string().optional(),
}).strict();

export type TierTransitionEvent = z.infer<typeof TierTransitionEventSchema>;

export const HandoffPacketExportSchema = z.object({
  id: z.string(),
  direction: z.enum(['small_to_stronger', 'stronger_to_small']),
  sourceTier: z.enum(['NON_LLM', 'SMALL_LLM', 'STRONGER_LLM', 'HALT']),
  targetTier: z.enum(['NON_LLM', 'SMALL_LLM', 'STRONGER_LLM', 'HALT']),
  sourceModel: z.string(),
  targetModel: z.string(),
  rationale: z.string(),
  taskId: z.string(),
  relevantFiles: z.array(z.string()),
  boundedInstructions: z.string().optional(),
  tokenBudget: z.number().optional(),
  formattedText: z.string(),
}).strict();

export type HandoffPacketExport = z.infer<typeof HandoffPacketExportSchema>;

export const ModelInferenceProvenanceSchema = z.object({
  turn: z.number().int().positive(),
  tier: z.enum(['SMALL_LLM', 'STRONGER_LLM']),
  requestedModel: z.string().min(1),
  actualModel: z.string().min(1),
  provider: z.string().min(1),
  routingMetadata: z.object({
    endpoint: z.string().optional(),
    latencyMs: z.number().nonnegative().optional(),
    httpStatus: z.number().optional(),
    is_fallback: z.boolean().optional(),
  }).passthrough().optional(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  sourceRevision: z.string().min(1),
  transitionReason: z.string().optional(),
  boundedInstructions: z.string().optional(),
  timestamp: z.string(),
}).strict();

export type ModelInferenceProvenance = z.infer<typeof ModelInferenceProvenanceSchema>;

export const AttributionBreakdownSchema = z.object({
  deterministicToolingTokensSaved: z.number().int().nullable(),
  contextCompilationTokensSaved: z.number().int().nullable(),
  modelSelectionTokensSaved: z.number().int().nullable(),
  bidirectionalHandoffTokensSaved: z.number().int().nullable(),
  cpuOverheadMs: z.number().nonnegative(),
  unisolatedEffects: z.array(z.string()).optional(),
}).strict();

export type AttributionBreakdownContract = z.infer<typeof AttributionBreakdownSchema>;

export const ControlledPolicySummarySchema = z.object({
  policy: z.enum([
    'controlled_direct_small',
    'controlled_direct_frontier',
    'controlled_escalation_only',
    'controlled_bidirectional_adaptive',
  ]),
  policyLabel: z.string(),
  totalTrials: z.number().int().positive(),
  passedTrials: z.number().int().nonnegative(),
  failedTrials: z.number().int().nonnegative(),
  successRatePercent: z.number().min(0).max(100),
  totalTokensPerAcceptedCompletion: z.number().int().nonnegative().nullable(),
  avgTotalTokens: z.number().int().nonnegative().nullable(),
  avgWallDurationMs: z.number().positive().nullable(),
  avgCpuDurationMs: z.number().positive().nullable(),
  avgControllerCpuMs: z.number().positive().nullable().optional(),
  avgTestSubprocessWallMs: z.number().positive().nullable().optional(),
  avgSubprocessCpuMs: z.number().positive().nullable().optional(),
  avgInferenceDurationMs: z.number().positive().nullable().optional(),
  avgChildProcessCpuMs: z.number().positive().nullable().optional(),
  avgCostUsd: z.number().nullable(),
  avgModelCalls: z.number().nonnegative(),
  avgTransitions: z.number().nonnegative(),
}).strict();

export type ControlledPolicySummary = z.infer<typeof ControlledPolicySummarySchema>;

export const ControlledBenchmarkExportSchema = z.object({
  version: z.literal('1'),
  taskId: z.string(),
  taskTitle: stringOrEmpty(),
  evaluationMode: z.literal('controlled_routing_fair_comparison'),
  toolingDisclosed: z.object({
    contextCompilerShared: z.boolean(),
    mechanicalTransformerShared: z.boolean(),
    promptCompilerShared: z.boolean(),
    approvalEngineShared: z.boolean(),
  }),
  policies: z.record(ControlledPolicySummarySchema),
  attribution: AttributionBreakdownSchema,
  evidenceSummary: z.string(),
}).strict();

function stringOrEmpty() {
  return z.string();
}

export type ControlledBenchmarkExport = z.infer<typeof ControlledBenchmarkExportSchema>;
