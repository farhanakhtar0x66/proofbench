import { z } from 'zod';

export const TrackDTask = z.enum(['distance-width', 'directed-edges']);
export type TrackDTask = z.infer<typeof TrackDTask>;
export const TrackDFault = z.enum(['none', 'model-outage', 'tool-error', 'misleading-input']);
export const TrackDRequest = z.object({
  mode: z.enum(['fixture', 'live']),
  tasks: z.array(TrackDTask).min(1).max(2).refine(values => new Set(values).size === values.length),
  repeats: z.number().int().min(1).max(3),
  fault: TrackDFault,
}).strict().refine(request => request.mode === 'live' || request.fault === 'none' || request.fault === 'tool-error',
  { path: ['fault'], message: 'This fault requires live agents.' });
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
});
export type TrackDReceipt = z.infer<typeof Receipt>;

const Grade = z.object({
  name: z.string(),
  outcome: z.enum(['passed', 'failed', 'unavailable']),
  detail: z.string(),
});
export type TrackDCheck = z.infer<typeof Grade>;

export const TrackDRun = z.object({
  id: z.string(),
  agent: z.string(),
  task: TrackDTask,
  repeat: z.number(),
  seed: z.number().int().positive(),
  verdict: z.enum(['passed', 'failed', 'unavailable']),
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
  limits: z.object({ modelCalls: z.number(), outputTokensPerCall: z.number(), agentSeconds: z.number() }),
  runs: z.array(TrackDRun),
  message: z.string().optional(),
});
export type TrackDSession = z.infer<typeof TrackDSession>;

export const TrackDStatus = z.object({
  liveConfigured: z.boolean(),
  sessions: z.array(TrackDSession),
});
export type TrackDStatus = z.infer<typeof TrackDStatus>;
