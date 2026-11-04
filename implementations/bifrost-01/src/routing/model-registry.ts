import { ExecutionTier } from '../persistence/types';
import { isLocalDestination } from '../governance/policy';

export interface ModelDescriptor {
  id: string;
  tier: ExecutionTier;
  provider: string;
  isLocal: boolean;
  contextWindow: number;
  costPerInputToken: number;
  costPerOutputToken: number;
  fallbackModelId?: string;
  capabilities: string[];
  description: string;
}

export interface ModelRegistryOptions {
  smallModel?: string;
  strongerModel?: string;
  isLive?: boolean;
  gatewayUrl?: string;
}

export class ModelRegistry {
  private models: Map<string, ModelDescriptor> = new Map();
  private tierDefaults: Map<ExecutionTier, string> = new Map();

  constructor(options: ModelRegistryOptions = {}) {
    const isLive = options.isLive ?? false;
    const gatewayUrl = options.gatewayUrl ?? process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089';
    const isLocal = !isLive || isLocalDestination(gatewayUrl);

    const defaultSmall = options.smallModel ?? (
      isLive
        ? (process.env.BIFROST_DEFAULT_MODEL ?? 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M')
        : 'local-deepseek-coder'
    );
    const defaultStronger = options.strongerModel ?? (
      isLive
        ? (process.env.BIFROST_RECOVERY_MODEL ?? 'gguf/Qwen3.5-9B-GGUF:Q4_K_M')
        : 'escalation-frontier-model'
    );

    // 1. NON_LLM tier: deterministic algorithms, Tree-sitter AST, compiler passes, formatters
    this.registerModel({
      id: 'deterministic-non-llm',
      tier: 'NON_LLM',
      provider: 'internal',
      isLocal: true,
      contextWindow: 128000,
      costPerInputToken: 0,
      costPerOutputToken: 0,
      capabilities: [
        'ast_symbol_extraction',
        'dependency_graph',
        'deterministic_format',
        'compiler_diagnostic_parsing',
        'test_execution',
        'mechanical_replacement',
      ],
      description: 'Host-native deterministic execution pass (zero LLM token consumption).',
    });

    // 2. SMALL_LLM tier: fast, economical model for routine single-file coding and localized fixes
    this.registerModel({
      id: defaultSmall,
      tier: 'SMALL_LLM',
      provider: isLive ? 'bifrost' : 'simulation',
      isLocal,
      contextWindow: 8192,
      costPerInputToken: 0.0000002,
      costPerOutputToken: 0.0000006,
      capabilities: [
        'single_file_edits',
        'bounded_fixes',
        'localized_refactor',
        'unit_test_authoring',
      ],
      description: 'Compact coding model for economical routine task execution.',
    });

    // 3. STRONGER_LLM tier: high-capacity reasoning model for complex architectural coordination,
    // cross-file dependencies, borrow-checker ownership debugging, and strategy generation
    this.registerModel({
      id: defaultStronger,
      tier: 'STRONGER_LLM',
      provider: isLive ? 'bifrost' : 'simulation',
      isLocal,
      contextWindow: 32768,
      costPerInputToken: 0.0000015,
      costPerOutputToken: 0.000005,
      capabilities: [
        'cross_module_synthesis',
        'borrow_checker_resolution',
        'subtle_concurrency_debugging',
        'architectural_decomposition',
        'delegation_strategy',
      ],
      description: 'High-capacity model for complex, multi-file or stalled tasks.',
    });

    this.tierDefaults.set('NON_LLM', 'deterministic-non-llm');
    this.tierDefaults.set('SMALL_LLM', defaultSmall);
    this.tierDefaults.set('STRONGER_LLM', defaultStronger);
  }

  public registerModel(descriptor: ModelDescriptor): void {
    this.models.set(descriptor.id, descriptor);
    if (!this.tierDefaults.has(descriptor.tier)) {
      this.tierDefaults.set(descriptor.tier, descriptor.id);
    }
  }

  public setTierDefault(tier: ExecutionTier, modelId: string): void {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Cannot set tier default: model '${modelId}' is not registered.`);
    }
    if (model.tier !== tier) {
      throw new Error(`Cannot set tier default: model '${modelId}' tier is ${model.tier}, expected ${tier}.`);
    }
    this.tierDefaults.set(tier, modelId);
  }

  public getModel(id: string): ModelDescriptor | undefined {
    return this.models.get(id);
  }

  public getModelForTier(tier: ExecutionTier): ModelDescriptor {
    if (tier === 'HALT') {
      throw new Error('HALT tier does not correspond to an executable model.');
    }
    const defaultId = this.tierDefaults.get(tier);
    if (!defaultId) {
      throw new Error(`No default model registered for tier '${tier}'.`);
    }
    const descriptor = this.models.get(defaultId);
    if (!descriptor) {
      throw new Error(`Registered default model '${defaultId}' for tier '${tier}' was not found.`);
    }
    return descriptor;
  }

  public listModels(tier?: ExecutionTier): ModelDescriptor[] {
    const all = Array.from(this.models.values());
    if (tier) {
      return all.filter((m) => m.tier === tier);
    }
    return all;
  }
}
