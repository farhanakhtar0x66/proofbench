// Shared types for ProofBench Cascade: an OpenAI-compatible router that sits in
// front of a Bifrost gateway and decides, per request, which model tier answers.

export type Role = 'system' | 'user' | 'assistant' | 'tool' | 'developer';

export interface ChatMessage {
  role: Role;
  content: string | null | Array<{ type: string; text?: string; [key: string]: unknown }>;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
  [key: string]: unknown;
}

export interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  [key: string]: unknown;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export type TierId = 'small' | 'large';

export interface Tier {
  id: TierId;
  /** Model id as Bifrost expects it, including the provider prefix. */
  model: string;
  /** Short human label for the UI. */
  label: string;
  /** Extra request fields for this tier (for example, switching a model's thinking mode off). */
  params?: Record<string, unknown>;
}

export interface CascadeConfig {
  small: Tier;
  large: Tier;
  /** Escalate after this many failed small-tier attempts even without an M2 halt. */
  maxSmallFailures: number;
  /** Token budget for the M3a autopsy that replaces the failed history. */
  autopsyBudgetTokens: number;
}

export type Outcome = 'pass' | 'fail' | 'unknown';

export interface OutcomeSignal {
  outcome: Outcome;
  passed?: number;
  failed?: number;
  /** First meaningful failure lines, used as the M2 error signature. */
  signature: string;
}

export type DecisionKind = 'start' | 'stay' | 'escalate' | 'deescalate' | 'hold-large';

export interface RouteDecision {
  kind: DecisionKind;
  tier: TierId;
  model: string;
  reason: string;
  /** Estimated prompt tokens before and after compression (escalation only). */
  compression?: { before: number; after: number; skipped?: string };
}

export type CascadeEvent =
  | { type: 'session'; at: string; sessionId: string; client: string }
  | { type: 'decision'; at: string; sessionId: string; turn: number; decision: RouteDecision; outcome: Outcome }
  | {
      type: 'usage';
      at: string;
      sessionId: string;
      turn: number;
      tier: TierId;
      model: string;
      usage: TokenUsage;
      latencyMs: number;
      status: 'ok' | 'error';
      error?: string;
    };
