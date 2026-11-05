import { ExecutionTier } from '../persistence/types';
import type { ModelRegistry } from './model-registry';
import type { GovernancePolicy } from '../governance/policy';

export type HandoffDirection =
  | 'non_llm_to_small'
  | 'non_llm_to_stronger'
  | 'small_to_stronger'
  | 'stronger_to_small'
  | 'model_to_non_llm';

export interface StructuredDiagnosticsSummary {
  exitCode: number;
  passedCount: number;
  failedCount: number;
  failingTestNames: string[];
  compilerErrorCodes: string[];
  rawOutputSnippet: string;
}

export interface UniversalHandoffPacket {
  id: string;
  direction: HandoffDirection;
  sourceTier: ExecutionTier;
  targetTier: ExecutionTier;
  sourceModel: string;
  targetModel: string;
  rationale: string;
  taskId: string;
  relevantFiles: string[];
  diagnostics?: StructuredDiagnosticsSummary;
  priorAttemptsSummary?: string;
  boundedInstructions?: string;
  tokenBudget: number;
  formattedText: string;
  createdAt: string;
}

export interface TierTransitionProposal {
  targetTier: ExecutionTier;
  rationale: string;
  boundedInstructions?: string;
  proposedByModel: string;
  rawTag: string;
}

export class UniversalHandoffProtocol {
  /**
   * Constructs an evidence-based, structured handoff packet between execution tiers.
   */
  public static createHandoff(params: {
    id: string;
    direction: HandoffDirection;
    sourceTier: ExecutionTier;
    targetTier: ExecutionTier;
    sourceModel: string;
    targetModel: string;
    rationale: string;
    taskId: string;
    relevantFiles: string[];
    diagnostics?: StructuredDiagnosticsSummary;
    priorAttemptsSummary?: string;
    boundedInstructions?: string;
    tokenBudget?: number;
  }): UniversalHandoffPacket {
    const tokenBudget = params.tokenBudget ?? 2000;
    const createdAt = new Date().toISOString();

    const sections: string[] = [];
    sections.push(`### Hand-off Protocol: ${params.sourceTier} ➔ ${params.targetTier}`);
    sections.push(`- Direction: ${params.direction}`);
    sections.push(`- Source: ${params.sourceModel} (${params.sourceTier})`);
    sections.push(`- Target: ${params.targetModel} (${params.targetTier})`);
    sections.push(`- Rationale: ${params.rationale}`);
    sections.push(`- Relevant Files: ${params.relevantFiles.join(', ') || 'None specified'}`);

    if (params.boundedInstructions) {
      sections.push(`\n#### Bounded Guidance & Constraints:\n${params.boundedInstructions}`);
    }

    if (params.diagnostics) {
      sections.push('\n#### Verified Compiler/Test Evidence:');
      sections.push(`- Exit Code: ${params.diagnostics.exitCode}`);
      sections.push(`- Tests Passed: ${params.diagnostics.passedCount}, Failed: ${params.diagnostics.failedCount}`);
      if (params.diagnostics.failingTestNames.length > 0) {
        sections.push(`- Failing Tests: ${params.diagnostics.failingTestNames.join(', ')}`);
      }
      if (params.diagnostics.compilerErrorCodes.length > 0) {
        sections.push(`- Diagnostic Codes: ${params.diagnostics.compilerErrorCodes.join(', ')}`);
      }
      if (params.diagnostics.rawOutputSnippet) {
        sections.push(`\`\`\`\n${params.diagnostics.rawOutputSnippet.trim()}\n\`\`\``);
      }
    }

    if (params.priorAttemptsSummary) {
      sections.push(`\n#### Prior Attempts Summary:\n${params.priorAttemptsSummary}`);
    }

    const formattedText = sections.join('\n');

    return {
      id: params.id,
      direction: params.direction,
      sourceTier: params.sourceTier,
      targetTier: params.targetTier,
      sourceModel: params.sourceModel,
      targetModel: params.targetModel,
      rationale: params.rationale,
      taskId: params.taskId,
      relevantFiles: params.relevantFiles,
      diagnostics: params.diagnostics,
      priorAttemptsSummary: params.priorAttemptsSummary,
      boundedInstructions: params.boundedInstructions,
      tokenBudget,
      formattedText,
      createdAt,
    };
  }

  /**
   * Deterministically parses any model-initiated transition proposals from response content.
   * Model outputs may include XML tags or JSON markdown blocks proposing a delegation or escalation.
   */
  public static parseTransitionProposal(
    modelOutput: string,
    modelName: string
  ): TierTransitionProposal | null {
    // 1. XML-style tag: <tier_transition target="..." rationale="...">...</tier_transition>
    const xmlMatch = modelOutput.match(
      /<tier_transition\s+target=["'](NON_LLM|SMALL_LLM|STRONGER_LLM|HALT)["'](?:\s+rationale=["']([^"']+)["'])?>([\s\S]*?)<\/tier_transition>/i
    );
    if (xmlMatch) {
      const targetTier = xmlMatch[1].toUpperCase() as ExecutionTier;
      const rationale = xmlMatch[2] || 'Model requested tier transition.';
      const body = xmlMatch[3].trim();
      const instructionsMatch = body.match(/<bounded_instructions>([\s\S]*?)<\/bounded_instructions>/i);
      const boundedInstructions = instructionsMatch ? instructionsMatch[1].trim() : (body.length > 0 ? body : undefined);

      return {
        targetTier,
        rationale,
        boundedInstructions,
        proposedByModel: modelName,
        rawTag: xmlMatch[0],
      };
    }

    // 2. Inline bracket format: [PROPOSE_TIER_TRANSITION: SMALL_LLM, RATIONALE: ...]
    const bracketMatch = modelOutput.match(
      /\[PROPOSE_TIER_TRANSITION:\s*(NON_LLM|SMALL_LLM|STRONGER_LLM|HALT)(?:,\s*RATIONALE:\s*([^\]]+))?\]/i
    );
    if (bracketMatch) {
      return {
        targetTier: bracketMatch[1].toUpperCase() as ExecutionTier,
        rationale: bracketMatch[2]?.trim() || 'Model requested tier transition via bracket notation.',
        proposedByModel: modelName,
        rawTag: bracketMatch[0],
      };
    }

    // 3. JSON code block format
    const jsonMatch = modelOutput.match(/```json\s*\n([\s\S]*?)\n```/i);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (
          parsed &&
          (parsed.type === 'tier_transition' || parsed.targetTier) &&
          ['NON_LLM', 'SMALL_LLM', 'STRONGER_LLM', 'HALT'].includes(parsed.targetTier?.toUpperCase())
        ) {
          return {
            targetTier: parsed.targetTier.toUpperCase() as ExecutionTier,
            rationale: parsed.rationale || 'Model requested tier transition via JSON.',
            boundedInstructions: parsed.boundedInstructions || parsed.instructions,
            proposedByModel: modelName,
            rawTag: jsonMatch[0],
          };
        }
      } catch {
        // Not valid JSON or irrelevant
      }
    }

    return null;
  }

  /**
   * Host policy validation for model proposals:
   * Models cannot self-authorize jumps or violate safety policies.
   */
  public static validateProposal(
    proposal: TierTransitionProposal,
    currentTier: ExecutionTier,
    optionsOrAllowedTiers?: ExecutionTier[] | {
      allowedTiers?: ExecutionTier[];
      modelRegistry?: ModelRegistry;
      policy?: GovernancePolicy;
      currentBudgetUsedUsd?: number;
      diagnosticsAvailable?: boolean;
    }
  ): { valid: boolean; reason?: string } {
    let allowedTiers: ExecutionTier[] = ['NON_LLM', 'SMALL_LLM', 'STRONGER_LLM', 'HALT'];
    let modelRegistry: ModelRegistry | undefined;
    let policy: GovernancePolicy | undefined;
    let currentBudgetUsedUsd: number | undefined;
    let diagnosticsAvailable: boolean | undefined;

    if (Array.isArray(optionsOrAllowedTiers)) {
      allowedTiers = optionsOrAllowedTiers;
    } else if (optionsOrAllowedTiers) {
      if (optionsOrAllowedTiers.allowedTiers) allowedTiers = optionsOrAllowedTiers.allowedTiers;
      modelRegistry = optionsOrAllowedTiers.modelRegistry;
      policy = optionsOrAllowedTiers.policy;
      currentBudgetUsedUsd = optionsOrAllowedTiers.currentBudgetUsedUsd;
      diagnosticsAvailable = optionsOrAllowedTiers.diagnosticsAvailable;
    }

    if (!allowedTiers.includes(proposal.targetTier)) {
      return { valid: false, reason: `Target tier '${proposal.targetTier}' is not in allowed tiers: ${allowedTiers.join(', ')}` };
    }

    if (proposal.targetTier === currentTier) {
      return { valid: false, reason: `Model proposed transition to the tier it is already in (${currentTier}).` };
    }

    // 1. Evidence check for Stronger -> Small downgrade
    if (currentTier === 'STRONGER_LLM' && proposal.targetTier === 'SMALL_LLM') {
      if (!proposal.boundedInstructions || proposal.boundedInstructions.trim().length === 0) {
        return {
          valid: false,
          reason: 'Stronger model downgrade to Small LLM rejected: missing concrete bounded instructions for delegated subtask.',
        };
      }
    }

    // 2. Evidence check for Small -> Stronger escalation
    if (currentTier === 'SMALL_LLM' && proposal.targetTier === 'STRONGER_LLM') {
      if (diagnosticsAvailable === false) {
        return {
          valid: false,
          reason: 'Small LLM escalation to Stronger LLM rejected: no failure diagnostics or evidence justifying escalation.',
        };
      }
    }

    // 3. Model Registry & Capabilities check
    if (modelRegistry && proposal.targetTier !== 'HALT') {
      try {
        const targetModel = modelRegistry.getModelForTier(proposal.targetTier);
        if (!targetModel) {
          return {
            valid: false,
            reason: `Target tier '${proposal.targetTier}' has no registered model in ModelRegistry.`,
          };
        }

        // 4. Confidentiality check: if confidential mode is active, target must be local
        if (policy?.confidential && !targetModel.isLocal) {
          return {
            valid: false,
            reason: `Confidentiality rejection: cannot transition to non-local model '${targetModel.id}' in confidential mode.`,
          };
        }
      } catch (err) {
        return {
          valid: false,
          reason: `ModelRegistry lookup failed for tier '${proposal.targetTier}': ${(err as Error).message}`,
        };
      }
    }

    // 5. Budget Check
    if (policy && typeof currentBudgetUsedUsd === 'number') {
      if (currentBudgetUsedUsd >= policy.maxBudgetUsd) {
        return {
          valid: false,
          reason: `Budget rejection: current spending ($${currentBudgetUsedUsd.toFixed(4)}) meets or exceeds policy limit ($${policy.maxBudgetUsd.toFixed(4)}).`,
        };
      }
    }

    // 6. Anti-Privilege Escalation Check: model proposal text cannot override policies
    const combinedText = `${proposal.rationale} ${proposal.boundedInstructions ?? ''}`.toLowerCase();
    if (
      combinedText.includes('bypass approval') ||
      combinedText.includes('disable sandbox') ||
      combinedText.includes('elevate privilege') ||
      combinedText.includes('grant access')
    ) {
      return {
        valid: false,
        reason: 'Security rejection: model attempted to claim elevated execution privileges in transition proposal.',
      };
    }

    return { valid: true };
  }
}
