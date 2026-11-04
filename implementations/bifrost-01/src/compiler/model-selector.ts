import { ContextCompilationResult } from './context-compiler';
import { DiagnosticRecord } from './prompt-compiler';

export interface TaskEngineeringFeatures {
  relevantFileCount: number;
  symbolCount: number;
  hasMultiFileDependency: boolean;
  contextTokenSize: number;
  contextBudgetPressure: number;
  missingDependencyCount: number;
  priorFailureCount: number;
  hasBorrowOrLifetimeError: boolean;
  hasTypeMismatchError: boolean;
  hasMissingFeatureError: boolean;
}

export type SelectedStrategy = 'direct_small' | 'direct_frontier' | 'bounded_escalation';

export interface ModelSelectionDecision {
  strategy: SelectedStrategy;
  recommendedModel: string;
  recoveryModelTarget?: string;
  features: TaskEngineeringFeatures;
  rationale: string[];
  rulesTriggered: string[];
}

export interface ModelSelectorOptions {
  smallModel?: string;
  frontierModel?: string;
  maxBudget?: number;
}

/**
 * Deterministic Evidence-Based Model Selection Policy (Phase D)
 * Conservative interpretable rules based purely on observable engineering features.
 * Zero hardcoded task IDs, zero answer-key leakage.
 */
export class DeterministicModelSelector {
  private smallModel: string;
  private frontierModel: string;
  private maxBudget: number;

  constructor(options: ModelSelectorOptions = {}) {
    this.smallModel = options.smallModel ?? 'ollama/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M';
    this.frontierModel = options.frontierModel ?? 'ollama/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF:Q4_K_M';
    this.maxBudget = options.maxBudget ?? 3500;
  }

  /**
   * Extracts observable engineering features from context compilation and diagnostic history.
   */
  extractFeatures(
    contextResult: ContextCompilationResult,
    diagnosticsHistory: DiagnosticRecord[],
    _taskPrompt = ''
  ): TaskEngineeringFeatures {
    const relevantFiles = Object.keys(contextResult.workspaceRevisions);
    const relevantFileCount = relevantFiles.length;
    const symbolCount = contextResult.selectedItems.length;

    // Check if dependencies cross multiple files
    const fileSet = new Set<string>();
    for (const item of contextResult.selectedItems) {
      fileSet.add(item.symbol.provenance.filePath);
    }
    const hasMultiFileDependency = fileSet.size > 1;

    const contextTokenSize = contextResult.totalTokens;
    const contextBudgetPressure = Number((contextTokenSize / this.maxBudget).toFixed(2));
    const missingDependencyCount = contextResult.missingMandatorySymbols.length + contextResult.omissionLedger.filter((o) => o.isMandatory).length;
    const priorFailureCount = diagnosticsHistory.length;

    // Analyze error codes in diagnostics
    const allDiagnostics = diagnosticsHistory.map((d) => d.rawOutput).join('\n');
    const hasBorrowOrLifetimeError = /error\[E0502\]|error\[E0499\]|error\[E0506\]|error\[E0106\]|borrowed as mutable|lifetime/i.test(allDiagnostics);
    const hasTypeMismatchError = /error\[E0308\]|mismatched types/i.test(allDiagnostics);
    const hasMissingFeatureError = /error\[E0425\]|error\[E0599\]|cannot find function|no method named/i.test(allDiagnostics);

    return {
      relevantFileCount,
      symbolCount,
      hasMultiFileDependency,
      contextTokenSize,
      contextBudgetPressure,
      missingDependencyCount,
      priorFailureCount,
      hasBorrowOrLifetimeError,
      hasTypeMismatchError,
      hasMissingFeatureError,
    };
  }

  /**
   * Evaluates deterministic policy rules over observable features.
   */
  selectModel(
    contextResult: ContextCompilationResult,
    diagnosticsHistory: DiagnosticRecord[],
    taskPrompt = ''
  ): ModelSelectionDecision {
    const features = this.extractFeatures(contextResult, diagnosticsHistory, taskPrompt);
    const rationale: string[] = [];
    const rulesTriggered: string[] = [];

    // Rule 1: High Structural Complexity or Lifetime Hazard -> Direct Frontier
    if (features.hasBorrowOrLifetimeError) {
      rulesTriggered.push('RULE_BORROW_LIFETIME_HAZARD');
      rationale.push('Rust borrow-checker or lifetime diagnostic detected; complex pointer ownership requires frontier reasoning.');
      return {
        strategy: 'direct_frontier',
        recommendedModel: this.frontierModel,
        features,
        rationale,
        rulesTriggered,
      };
    }

    if (features.relevantFileCount >= 3 && features.hasMultiFileDependency) {
      rulesTriggered.push('RULE_MULTI_MODULE_HIGH_COMPLEXITY');
      rationale.push(`Task spans ${features.relevantFileCount} distinct files with multi-module dependencies; direct frontier allocation avoids cross-file coordination failures.`);
      return {
        strategy: 'direct_frontier',
        recommendedModel: this.frontierModel,
        features,
        rationale,
        rulesTriggered,
      };
    }

    if (features.priorFailureCount >= 2) {
      rulesTriggered.push('RULE_REPEATED_FAILURE_COMPLEXITY');
      rationale.push(`Agent encountered ${features.priorFailureCount} prior verification failures; immediate escalation to frontier model is indicated.`);
      return {
        strategy: 'direct_frontier',
        recommendedModel: this.frontierModel,
        features,
        rationale,
        rulesTriggered,
      };
    }

    // Rule 2: Localized Single-File Task with Low Context Pressure -> Direct Small
    if (
      features.relevantFileCount === 1 &&
      !features.hasMultiFileDependency &&
      features.contextTokenSize < 1200 &&
      features.priorFailureCount === 0 &&
      features.missingDependencyCount === 0
    ) {
      rulesTriggered.push('RULE_LOCALIZED_SINGLE_FILE');
      rationale.push(`Localized single-file task (${features.contextTokenSize} context tokens, 0 prior errors); small model offers maximum token efficiency.`);
      return {
        strategy: 'direct_small',
        recommendedModel: this.smallModel,
        features,
        rationale,
        rulesTriggered,
      };
    }

    // Rule 3: Intermediate Complexity -> Bounded Escalation
    // Start with small model, but declare authorized frontier escalation if M2 stagnation triggers.
    rulesTriggered.push('RULE_BOUNDED_ESCALATION_DEFAULT');
    rationale.push(`Intermediate task complexity (${features.relevantFileCount} files, ${features.contextTokenSize} tokens); starting with small model under bounded M2/M3a escalation.`);

    return {
      strategy: 'bounded_escalation',
      recommendedModel: this.smallModel,
      recoveryModelTarget: this.frontierModel,
      features,
      rationale,
      rulesTriggered,
    };
  }
}
