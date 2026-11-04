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

export function validateModelAgainstPolicy(
  model: string,
  policy: GovernancePolicy,
  observedProvider?: string
): { valid: boolean; reason?: string } {
  if (policy.confidential) {
    // If repository is confidential, strictly reject cloud models
    const isCloud = CLOUD_MODELS.some((cm) => model.toLowerCase().includes(cm.toLowerCase())) ||
      (observedProvider ? ['openai', 'anthropic', 'azure'].includes(observedProvider.toLowerCase()) : false);
    
    const isLocal = (observedProvider && ['local', 'ollama'].includes(observedProvider.toLowerCase())) ||
      LOCAL_MODELS.some((lm) => model.toLowerCase().includes(lm.toLowerCase()));

    if (isCloud || !isLocal) {
      return {
        valid: false,
        reason: `Confidential repository policy violation: model '${model}' is a non-local or cloud model. Only certified local models are eligible: [${LOCAL_MODELS.join(', ')}].`,
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
