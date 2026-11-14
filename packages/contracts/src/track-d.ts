import { z } from 'zod';

export const TrackDTask = z.enum(['distance-width', 'directed-edges']);
export type TrackDTask = z.infer<typeof TrackDTask>;
export const TrackDFault = z.enum(['none', 'model-outage', 'tool-error', 'misleading-input']);
const TrackDAgent = z.enum(['proofbench', 'opencode', 'reference-repair', 'unpatched-starter']);
export type TrackDAgent = z.infer<typeof TrackDAgent>;
export const trackDAdapterRevision = 'graph-repair-adapters-v2';
export const trackDAgentLabels: Record<TrackDAgent, string> = {
  proofbench: 'ProofBench · fixed model',
  opencode: 'OpenCode CLI',
  'reference-repair': 'Reference repair fixture',
  'unpatched-starter': 'Unpatched starter fixture',
};
export const trackDAgentsByMode: Record<'fixture' | 'live', readonly TrackDAgent[]> = {
  live: ['proofbench', 'opencode'],
  fixture: ['reference-repair', 'unpatched-starter'],
};
export const TrackDRequest = z.object({
  mode: z.enum(['fixture', 'live']),
  agents: z.array(TrackDAgent).min(1).max(2).refine(values => new Set(values).size === values.length).optional(),
  tasks: z.array(TrackDTask).min(1).max(2).refine(values => new Set(values).size === values.length),
  repeats: z.number().int().min(1).max(3),
  fault: TrackDFault,
}).strict().refine(request => request.mode === 'live' || request.fault === 'none' || request.fault === 'tool-error',
  { path: ['fault'], message: 'This fault requires live agents.' })
  .refine(request => request.agents?.every(agent => trackDAgentsByMode[request.mode].includes(agent)) ?? true,
    { path: ['agents'], message: 'Select entries supported in this mode.' });
export type TrackDRequest = z.infer<typeof TrackDRequest>;

const Receipt = z.object({
  status: z.number().int(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  requestId: z.string().nullable(),
  input: z.number().int().nonnegative().nullable(),
  output: z.number().int().nonnegative().nullable(),
  costUsd: z.number().nonnegative().nullable(),
  injected: z.boolean(),
  relayRejection: z.literal('model-call-limit').optional(),
});
export type TrackDReceipt = z.infer<typeof Receipt>;
export const trackDGatewayAttempts = (receipts: readonly TrackDReceipt[]) =>
  receipts.filter(receipt => !receipt.injected && receipt.relayRejection !== 'model-call-limit').length;

const Grade = z.object({
  name: z.string(),
  outcome: z.enum(['passed', 'failed', 'unavailable']),
  detail: z.string(),
});
export type TrackDCheck = z.infer<typeof Grade>;

export const TrackDRun = z.object({
  id: z.string(),
  agent: z.string(),
  agentId: TrackDAgent.optional(),
  task: TrackDTask,
  repeat: z.number(),
  seed: z.number().int().positive(),
  verdict: z.enum(['passed', 'failed', 'unavailable']),
  unavailableReason: z.enum(['agent-timeout', 'gateway-error', 'agent-error', 'grader-error', 'interrupted']).optional(),
  agentMs: z.number().nonnegative(),
  verdictMs: z.number().nonnegative().optional(),
  inputTokens: z.number().nonnegative().nullable(),
  outputTokens: z.number().nonnegative().nullable(),
  costUsd: z.number().nonnegative().nullable(),
  steps: z.number().nonnegative().nullable(),
  toolCalls: z.number().nonnegative().nullable(),
  sourceSha256: z.string().nullable(),
  agentNote: z.string().optional(),
  diff: z.string(),
  checks: z.array(Grade),
  receipts: z.array(Receipt),
  trace: z.array(z.object({
    source: z.enum(['adapter', 'gateway', 'grader']),
    message: z.string(),
    at: z.string(),
  })),
});
export type TrackDRun = z.infer<typeof TrackDRun>;

export const TrackDSession = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  request: TrackDRequest,
  status: z.enum(['running', 'completed', 'failed']),
  model: z.string().nullable(),
  comparable: z.boolean(),
  worker: z.object({ kind: z.enum(['docker', 'wsl']), id: z.string() }),
  oracle: z.string(),
  adapterRevision: z.string().optional(),
  publicSuiteRevision: z.string().optional(),
  reasoningEffort: z.literal('none').optional(),
  limits: z.object({ modelCalls: z.number(), outputTokensPerCall: z.number(), agentSeconds: z.number() }),
  runs: z.array(TrackDRun),
  message: z.string().optional(),
});
export type TrackDSession = z.infer<typeof TrackDSession>;

export const TrackDStatus = z.object({
  adapterRevision: z.string().optional(),
  publicSuiteRevision: z.string().optional(),
  liveConfigured: z.boolean(),
  liveIssue: z.string().optional(),
  activeSessionId: z.string().uuid().optional(),
  sessions: z.array(TrackDSession),
});
export type TrackDStatus = z.infer<typeof TrackDStatus>;
