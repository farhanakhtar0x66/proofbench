export interface BifrostVirtualKey {
  id: string; // sk-bf-*
  name: string;
  allowedProviders: string[];
  allowedModels: string[];
  budgetLimitUsd: number;
  budgetSpentUsd: number;
  currentSpendUsd?: number;
  rateLimitRpm?: number;
  active?: boolean;
}

export interface BifrostProviderConfig {
  provider: string; // e.g., 'openai', 'anthropic', 'ollama', 'opencode', 'local'
  weight?: number;
  priority?: number; // 1 = primary, 2 = secondary fallback
  allowedModels: string[];
  baseUrl?: string;
  apiKey?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  stream?: boolean;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'tool_calls' | 'length' | 'error';
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  bifrost_metadata?: {
    provider: string;
    model: string;
    virtual_key_id: string;
    fallback_invoked: boolean;
    cost_usd: number;
    latency_ms: number;
  };
}

export class BifrostBudgetExceededError extends Error {
  constructor(message = 'Bifrost virtual key budget exceeded (HTTP 402)') {
    super(message);
    this.name = 'BifrostBudgetExceededError';
  }
}

export class BifrostProviderError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'BifrostProviderError';
    this.statusCode = statusCode;
  }
}
