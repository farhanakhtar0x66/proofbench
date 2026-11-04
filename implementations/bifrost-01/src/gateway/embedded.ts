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
        'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M',
        'gpt-4o-mini',
        'claude-3-5-haiku',
        'escalation-frontier-model',
      ],
      budgetLimitUsd: 10.0,
      budgetSpentUsd: 0.0,
    });

    // Rotated active virtual key
    this.registerVirtualKey({
      id: 'sk-bf-710b95b4-ced1-4450-85c4-4d2e4eb10808',
      name: 'ProofBench Active Rotated Key',
      allowedProviders: ['local', 'ollama', 'opencode', 'openai-cloud', 'anthropic-cloud'],
      allowedModels: [
        'local-qwen-7b',
        'local-deepseek-coder',
        'opencode/deepseek-v4.1-flash-free',
        'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M',
        'gpt-4o-mini',
        'claude-3-5-haiku',
        'escalation-frontier-model',
      ],
      budgetLimitUsd: 10.0,
      budgetSpentUsd: 0.0,
    });

    // Mock simulation key
    this.registerVirtualKey({
      id: 'sk-bf-simulation-default',
      name: 'ProofBench Simulation Key',
      allowedProviders: ['local', 'ollama', 'opencode', 'openai-cloud', 'anthropic-cloud'],
      allowedModels: [
        'local-qwen-7b',
        'local-deepseek-coder',
        'opencode/deepseek-v4.1-flash-free',
        'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M',
        'gpt-4o-mini',
        'claude-3-5-haiku',
        'escalation-frontier-model',
      ],
      budgetLimitUsd: 10.0,
      budgetSpentUsd: 0.0,
    });

    // Local live test virtual key identifier
    this.registerVirtualKey({
      id: 'sk-bf-91b1d004-b51e-4a78-b326-e09b840e4b6e',
      name: 'ProofBench Local Test Key',
      allowedProviders: ['local', 'ollama', 'opencode', 'openai-cloud', 'anthropic-cloud'],
      allowedModels: [
        'local-qwen-7b',
        'local-deepseek-coder',
        'opencode/deepseek-v4.1-flash-free',
        'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M',
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
            cost_estimated: true,
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

    const allText = req.messages.map((m) => m.content).join('\n');

    // Deterministic mock model responses for frozen offline test tasks
    if (allText.includes('sliding_window_sums') || allText.includes('task-1')) {
      const code = `// File: src/lib.rs
//! Sliding window sums calculator.

/// Computes the sum of each contiguous window of length \`window_size\`.
/// If \`window_size == 0\` or \`window_size > values.len()\`, returns an empty Vec.
pub fn sliding_window_sums(values: &[i64], window_size: usize) -> Vec<i64> {
    if window_size == 0 || window_size > values.len() {
        return Vec::new();
    }
    let mut sums = Vec::new();
    for i in 0..=(values.len() - window_size) {
        let window = &values[i..i + window_size];
        sums.push(window.iter().sum());
    }
    sums
}
`;
      return {
        content: `Here is the corrected Rust code fixing the off-by-one bounds bug:\n\n\`\`\`rust\n${code}\`\`\``,
        usage: {
          prompt_tokens: 180,
          completion_tokens: 85,
        },
      };
    }

    if (allText.includes('ExponentialBackoff') || allText.includes('delay_for_attempt') || allText.includes('task-2')) {
      const code = `// File: src/lib.rs
//! Exponential backoff calculation module.

#[derive(Debug, Clone, PartialEq)]
pub struct ExponentialBackoff {
    pub initial_delay_ms: u64,
    pub max_delay_ms: u64,
    pub factor: f64,
    pub max_retries: usize,
}

impl ExponentialBackoff {
    pub fn new(initial_delay_ms: u64, max_delay_ms: u64, factor: f64, max_retries: usize) -> Self {
        Self {
            initial_delay_ms,
            max_delay_ms,
            factor,
            max_retries,
        }
    }

    /// Computes delay in milliseconds for a given 0-indexed retry attempt.
    pub fn delay_for_attempt(&self, attempt: usize) -> u64 {
        if attempt == 0 {
            return 0;
        }
        if attempt > self.max_retries {
            return self.max_delay_ms;
        }

        let power = (attempt - 1) as i32;
        let calculated = (self.initial_delay_ms as f64) * self.factor.powi(power);
        let capped = calculated.min(self.max_delay_ms as f64);
        capped as u64
    }
}
`;
      return {
        content: `Here is the implementation of \`delay_for_attempt\`:\n\n\`\`\`rust\n${code}\`\`\``,
        usage: {
          prompt_tokens: 220,
          completion_tokens: 110,
        },
      };
    }

    if (allText.includes('event pipeline') || allText.includes('task-3') || allText.includes('parser.rs') || allText.includes('sink.rs')) {
      const compilerSection = allText.split('Previous compiler output:')[1] ?? '';
      // Turn 1 (initial run or parser failure): fix parser.rs
      if (compilerSection.includes('None yet') || compilerSection.includes('test_parse_valid') || compilerSection.includes('invalid checksum format')) {
        const parserCode = `// File: src/parser.rs
//! Line parser for formatted event strings.

use crate::event::{calculate_checksum, Event};

/// Parses a line formatted as \`id|payload|checksum\`.
pub fn parse_event(line: &str) -> Result<Event, String> {
    let parts: Vec<&str> = line.split('|').collect();
    if parts.len() != 3 {
        return Err("invalid event format: expected id|payload|checksum".to_string());
    }

    let id = parts[0].to_string();
    let payload = parts[1].to_string();

    let checksum = parts[2]
        .parse::<u32>()
        .map_err(|e| format!("invalid checksum format: {}", e))?;

    let expected_checksum = calculate_checksum(&payload);
    if checksum != expected_checksum {
        return Err(format!(
            "checksum mismatch: expected {}, got {}",
            expected_checksum, checksum
        ));
    }

    Ok(Event::new(id, payload, checksum))
}
`;
        return {
          content: `Fixing the parser checksum index bug:\n\n\`\`\`rust\n${parserCode}\`\`\``,
          usage: {
            prompt_tokens: 260,
            completion_tokens: 100,
          },
        };
      } else {
        const sinkCode = `// File: src/sink.rs
//! Event sink buffer with capacity constraints and deduplication.

use crate::event::Event;

#[derive(Debug)]
pub struct EventSink {
    events: Vec<Event>,
    capacity: usize,
}

impl EventSink {
    pub fn new(capacity: usize) -> Self {
        Self {
            events: Vec::new(),
            capacity,
        }
    }

    /// Pushes an event into the sink if capacity permits and ID is not duplicated.
    pub fn push(&mut self, event: Event) -> Result<(), String> {
        if self.events.len() >= self.capacity {
            return Err(format!("sink capacity reached: {}", self.capacity));
        }

        if self.events.iter().any(|e| e.id == event.id) {
            return Err(format!("duplicate event id: {}", event.id));
        }

        self.events.push(event);
        Ok(())
    }

    pub fn len(&self) -> usize {
        self.events.len()
    }

    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    pub fn drain(&mut self) -> Vec<Event> {
        std::mem::take(&mut self.events)
    }
}
`;
        return {
          content: `Fixing the sink capacity bug:\n\n\`\`\`rust\n${sinkCode}\`\`\``,
          usage: {
            prompt_tokens: 250,
            completion_tokens: 95,
          },
        };
      }
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
