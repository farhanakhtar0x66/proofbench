import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  BifrostVirtualKey,
  BifrostProviderConfig,
  ChatCompletionRequest,
  ChatCompletionResponse,
  BifrostBudgetExceededError,
  BifrostProviderError,
} from './types';

export type ModelBackendHandler = (
  req: ChatCompletionRequest,
  provider: string,
  model: string
) => Promise<{ content: string; tool_calls?: ChatCompletionResponse['choices'][0]['message']['tool_calls']; usage?: { prompt_tokens: number; completion_tokens: number } }>;

export class EmbeddedBifrostGateway {
  private virtualKeys = new Map<string, BifrostVirtualKey>();
  private providerConfigs = new Map<string, BifrostProviderConfig>();
  private injectedOutages = new Map<string, number>(); // provider -> remaining failures to simulate
  private customHandler?: ModelBackendHandler;

  constructor() {
    // Default Virtual Key for ProofBench
    this.registerVirtualKey({
      id: 'sk-bf-proofbench-default',
      name: 'ProofBench Default Governing Key',
      allowedProviders: ['local', 'ollama', 'opencode', 'openai-cloud', 'anthropic-cloud'],
      allowedModels: [
        'local-qwen-7b',
        'local-deepseek-coder',
        'opencode/deepseek-v4.1-flash-free',
        'gpt-4o-mini',
        'claude-3-5-haiku',
        'escalation-frontier-model',
      ],
      budgetLimitUsd: 10.0,
      budgetSpentUsd: 0.0,
    });

    // Default primary provider
    this.registerProvider({
      provider: 'local',
      priority: 1,
      allowedModels: ['local-qwen-7b', 'local-deepseek-coder'],
    });

    // Default secondary fallback provider
    this.registerProvider({
      provider: 'opencode',
      priority: 2,
      allowedModels: ['opencode/deepseek-v4.1-flash-free'],
    });

    // Cloud fallback provider (restricted by confidential policy)
    this.registerProvider({
      provider: 'openai-cloud',
      priority: 3,
      allowedModels: ['gpt-4o-mini', 'escalation-frontier-model'],
    });
  }

  provisionVirtualKey(options: {
    name: string;
    budgetLimitUsd: number;
    allowedProviders?: string[];
    allowedModels?: string[];
  }): BifrostVirtualKey {
    const key: BifrostVirtualKey = {
      id: `sk-bf-${randomUUID().slice(0, 8)}`,
      name: options.name,
      budgetLimitUsd: options.budgetLimitUsd,
      budgetSpentUsd: 0.0,
      currentSpendUsd: 0.0,
      allowedProviders: options.allowedProviders ?? ['local', 'opencode', 'mock-primary-provider', 'mock-fallback-provider', 'openai-cloud'],
      allowedModels: options.allowedModels ?? [
        'opencode/deepseek-v4.1-flash-free',
        'local-deepseek-coder',
        'gpt-4o-mini',
        'claude-3-5-sonnet',
        'escalation-frontier-model',
      ],
      active: true,
    };
    this.registerVirtualKey(key);
    return key;
  }

  registerVirtualKey(key: BifrostVirtualKey): void {
    this.virtualKeys.set(key.id, { ...key });
  }

  getVirtualKey(id: string): BifrostVirtualKey | undefined {
    return this.virtualKeys.get(id);
  }

  registerProvider(config: BifrostProviderConfig): void {
    this.providerConfigs.set(config.provider, { ...config });
  }

  injectFault(options: { provider: string; outageStatus?: number; failCount?: number }): void {
    this.injectOutage(options.provider, options.failCount ?? 1);
  }

  injectOutage(provider: string, failCount = 1): void {
    this.injectedOutages.set(provider, failCount);
  }

  clearOutages(): void {
    this.injectedOutages.clear();
  }

  setHandler(handler: ModelBackendHandler): void {
    this.customHandler = handler;
  }

  async handleChatCompletion(
    virtualKeyId: string,
    req: ChatCompletionRequest,
    fallbackProviders: string[] = ['opencode', 'openai-cloud']
  ): Promise<ChatCompletionResponse> {
    const startTime = performance.now();
    const vk = this.virtualKeys.get(virtualKeyId);
    if (!vk) {
      throw new Error(`Invalid Bifrost virtual key: ${virtualKeyId}`);
    }

    // 1. Hierarchical Budget Check
    if (vk.budgetSpentUsd >= vk.budgetLimitUsd) {
      throw new BifrostBudgetExceededError(
        `Bifrost virtual key budget exhausted ($${vk.budgetSpentUsd.toFixed(4)} of $${vk.budgetLimitUsd.toFixed(4)}). HTTP 402 Payment Required.`
      );
    }

    // 2. Model Governance Check
    if (!vk.allowedModels.includes(req.model)) {
      throw new Error(
        `Model ${req.model} is not authorized for virtual key ${virtualKeyId}. Authorized models: ${vk.allowedModels.join(', ')}`
      );
    }

    // Determine candidate providers: primary inferred or configured, plus fallbacks
    const candidateProviders = ['local', ...fallbackProviders].filter((p) =>
      vk.allowedProviders.includes(p)
    );

    let lastError: Error | null = null;
    let fallbackInvoked = false;

    for (let i = 0; i < candidateProviders.length; i++) {
      const provider = candidateProviders[i];
      if (i > 0) fallbackInvoked = true;

      // Check injected outages
      const outageCount = this.injectedOutages.get(provider) ?? 0;
      if (outageCount > 0) {
        this.injectedOutages.set(provider, outageCount - 1);
        lastError = new BifrostProviderError(
          `Provider ${provider} returned 503 Service Unavailable (Injected Outage / Rate Limit)`,
          503
        );
        continue; // Fall back to next provider
      }

      try {
        // Execute request through provider handler
        const result = await this.dispatchToProvider(req, provider, req.model);

        const latencyMs = performance.now() - startTime;
        const promptTokens = result.usage?.prompt_tokens ?? Math.round(JSON.stringify(req.messages).length / 4);
        const completionTokens = result.usage?.completion_tokens ?? Math.round((result.content?.length ?? 0) / 4);
        const totalTokens = promptTokens + completionTokens;

        // Calculate approximate cost ($0.15 / 1M prompt, $0.60 / 1M completion)
        const costUsd = (promptTokens * 0.00000015) + (completionTokens * 0.0000006);

        // Deduct from Virtual Key budget
        vk.budgetSpentUsd += costUsd;
        vk.currentSpendUsd = vk.budgetSpentUsd;

        return {
          id: `chatcmpl-${randomUUID()}`,
          model: req.model,
          created: Math.floor(Date.now() / 1000),
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: result.content,
                tool_calls: result.tool_calls,
              },
              finish_reason: result.tool_calls ? 'tool_calls' : 'stop',
            },
          ],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
          },
          bifrost_metadata: {
            provider,
            model: req.model,
            virtual_key_id: virtualKeyId,
            fallback_invoked: fallbackInvoked,
            cost_usd: costUsd,
            latency_ms: latencyMs,
          },
        };
      } catch (err) {
        lastError = err as Error;
        // Continue to fallback
      }
    }

    throw lastError ?? new Error('All candidate providers in Bifrost fallback chain failed');
  }

  private async dispatchToProvider(
    req: ChatCompletionRequest,
    provider: string,
    model: string
  ): Promise<{ content: string; tool_calls?: ChatCompletionResponse['choices'][0]['message']['tool_calls']; usage?: { prompt_tokens: number; completion_tokens: number } }> {
    if (this.customHandler) {
      return this.customHandler(req, provider, model);
    }

    // Default simulated provider behavior for tests
    return {
      content: `Simulated response from provider ${provider} using ${model}`,
      usage: {
        prompt_tokens: 150,
        completion_tokens: 30,
      },
    };
  }
}
