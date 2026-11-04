export interface GovernancePolicy {
  confidential: boolean;
  maxBudgetUsd: number;
  allowedModels: string[];
  maxTurns: number;
  requireApprovalForWrites: boolean;
  requireApprovalForCommands: boolean;
}

export const LOCAL_MODELS = [
  'local-qwen-7b',
  'local-deepseek-coder',
  'opencode/deepseek-v4.1-flash-free',
  'ollama/llama3',
  'local-default',
  'qwen',
  'ollama',
];

export const CLOUD_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'claude-3-5-haiku',
  'claude-3-5-sonnet',
  'escalation-frontier-model',
];

export function createDefaultPolicy(overrides: Partial<GovernancePolicy> = {}): GovernancePolicy {
  const confidential = overrides.confidential ?? false;
  return {
    confidential,
    maxBudgetUsd: overrides.maxBudgetUsd ?? 5.0,
    allowedModels: overrides.allowedModels ?? (confidential ? LOCAL_MODELS : [...LOCAL_MODELS, ...CLOUD_MODELS]),
    maxTurns: overrides.maxTurns ?? 6,
    requireApprovalForWrites: overrides.requireApprovalForWrites ?? true,
    requireApprovalForCommands: overrides.requireApprovalForCommands ?? true,
  };
}

export function isLocalDestination(urlOrHost?: string): boolean {
  if (!urlOrHost) return false;
  try {
    const raw = urlOrHost.includes('://') ? urlOrHost : `http://${urlOrHost}`;
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

export const TRUSTED_LOCAL_PROVIDERS = ['local', 'ollama'];
export const KNOWN_CLOUD_PROVIDERS = ['openai', 'anthropic', 'azure', 'cohere', 'bedrock', 'openrouter', 'google'];

export function validateModelAgainstPolicy(
  model: string,
  policy: GovernancePolicy,
  options?: { destinationUrl?: string; provider?: string }
): { valid: boolean; reason?: string } {
  if (policy.confidential) {
    // 1. Verify Destination Endpoint (must be local loopback)
    if (options?.destinationUrl) {
      if (!isLocalDestination(options.destinationUrl)) {
        return {
          valid: false,
          reason: `Confidential repository policy violation: destination '${options.destinationUrl}' is a remote or external endpoint. Only verified local loopback endpoints (127.0.0.1 / localhost) are eligible.`,
        };
      }
    }

    // 2. Verify Trusted Provider Configuration (not model names alone)
    if (options?.provider) {
      const prov = options.provider.toLowerCase();
      if (KNOWN_CLOUD_PROVIDERS.includes(prov) || !TRUSTED_LOCAL_PROVIDERS.includes(prov)) {
        return {
          valid: false,
          reason: `Confidential repository policy violation: provider '${options.provider}' is not a trusted local provider. Only [${TRUSTED_LOCAL_PROVIDERS.join(', ')}] are eligible.`,
        };
      }
    }

    // 3. Fallback check on model name if no destination or provider is provided
    const isCloudModel = CLOUD_MODELS.some((cm) => model.toLowerCase().includes(cm.toLowerCase()));
    if (isCloudModel) {
      return {
        valid: false,
        reason: `Confidential repository policy violation: model '${model}' is a certified cloud model. Only local models and verified loopback providers are eligible.`,
      };
    }
  }

  if (policy.allowedModels.length > 0 && !policy.allowedModels.some((am) => model.toLowerCase().includes(am.toLowerCase()))) {
    return {
      valid: false,
      reason: `Model '${model}' is not in policy allowed models list: [${policy.allowedModels.join(', ')}].`,
    };
  }

  return { valid: true };
}
