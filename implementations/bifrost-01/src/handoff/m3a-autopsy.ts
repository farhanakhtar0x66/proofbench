import { AttemptRecord } from '../progress/m2-stagnation';

export interface M3aFailureAutopsy {
  taskId: string;
  taskTitle: string;
  taskPrompt: string;
  attempts: Array<{
    attemptNumber: number;
    unifiedPatch: string;
    exitCode: number;
    errorDiagnostics: string;
  }>;
  stagnationReason?: string;
  escalationModelTarget: string;
  tokenCount: number;
  maxTokenBudget: number;
  budgetCompacted: boolean;
  reducedAttempts?: boolean;
  oversized: boolean;
  canDispatch: boolean;
  heuristicNote: string;
  formattedPacket: string;
}

export interface M3aAutopsyOptions {
  taskId: string;
  taskTitle: string;
  taskPrompt: string;
  attempts: AttemptRecord[];
  stagnationReason?: string;
  escalationModel?: string;
  maxTokenBudget?: number;
}

export class M3aFailureAutopsyBuilder {
  private static estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.8);
  }

  private static compactDiagnostics(raw: string, maxLines = 20): string {
    const lines = raw.split('\n');
    if (lines.length > maxLines) {
      const headCount = Math.max(1, Math.ceil(maxLines * 0.6));
      const tailCount = Math.max(1, maxLines - headCount);
      const head = lines.slice(0, headCount).join('\n');
      const tail = lines.slice(-tailCount).join('\n');
      return `${head}\n... [compacted ${lines.length - maxLines} lines of diagnostic output for M3a budget] ...\n${tail}`;
    }
    if (raw.length > 600) {
      const head = raw.slice(0, 300);
      const tail = raw.slice(-200);
      return `${head}\n... [compacted ${raw.length - 500} characters of diagnostic output for M3a budget] ...\n${tail}`;
    }
    return raw;
  }

  private static compactPatch(raw: string, maxLines = 30): string {
    const lines = raw.split('\n');
    if (lines.length <= maxLines) return raw;
    const headCount = Math.max(1, Math.ceil(maxLines * 0.6));
    const tailCount = Math.max(1, maxLines - headCount);
    const head = lines.slice(0, headCount).join('\n');
    const tail = lines.slice(-tailCount).join('\n');
    return `${head}\n... [compacted ${lines.length - maxLines} lines of patch diff for M3a budget] ...\n${tail}`;
  }

  static buildAutopsyPacket(options: M3aAutopsyOptions): M3aFailureAutopsy {
    const {
      taskId,
      taskTitle,
      taskPrompt,
      attempts,
      stagnationReason,
      escalationModel = 'escalation-frontier-model',
      maxTokenBudget = 2000,
    } = options;

    const buildPacketContent = (attemptsSubset: AttemptRecord[], compact = false, maxDiagLines = 20, maxPatchLines = 30) => {
      let packet = `# Structured Failure Autopsy (M3a - Evidence-Only)\n\n`;
      packet += `**Task ID**: ${taskId}\n`;
      packet += `**Title**: ${taskTitle}\n`;
      packet += `**Original Goal**: ${taskPrompt}\n\n`;
      if (stagnationReason) {
        packet += `**Controller Halt Reason**: ${stagnationReason}\n\n`;
      }

      packet += `## Verified Failure Ledger (No LLM Narrative)\n\n`;

      const mapped = attemptsSubset.map((att) => {
        const rawDiag = att.rawError || att.errorSignature;
        const diag = compact ? this.compactDiagnostics(rawDiag, maxDiagLines) : rawDiag;
        const patch = compact ? this.compactPatch(att.rawPatch, maxPatchLines) : att.rawPatch;

        packet += `### Attempt ${att.attemptIndex} [Exit Code: ${att.testExitCode}]\n`;
        packet += `#### Applied Patch:\n\`\`\`diff\n${patch.trim() || 'No changes made'}\n\`\`\`\n`;
        packet += `#### Compiler / Test Diagnostic Output:\n\`\`\`\n${diag || 'No error signature'}\n\`\`\`\n\n`;

        return {
          attemptNumber: att.attemptIndex,
          unifiedPatch: patch,
          exitCode: att.testExitCode,
          errorDiagnostics: diag,
        };
      });

      packet += `## Escalation Directive\n`;
      packet += `Escalating to authorized frontier model '${escalationModel}' via Bifrost routing to resolve persistent diagnostic signatures without repeating previous failed patches.\n`;

      return { packet, mapped };
    };

    // Level 1: Full uncompacted ledger
    let { packet, mapped } = buildPacketContent(attempts, false);
    let tokenCount = this.estimateTokens(packet);
    let budgetCompacted = false;
    let reducedAttempts = false;
    let oversized = false;

    // Level 2: Compact diagnostics & patches across all attempts
    if (tokenCount > maxTokenBudget) {
      const compacted = buildPacketContent(attempts, true, 20, 30);
      packet = compacted.packet;
      mapped = compacted.mapped;
      tokenCount = this.estimateTokens(packet);
      budgetCompacted = true;
    }

    // Level 3: If still exceeding budget, reduce to retain only the most recent attempt
    if (tokenCount > maxTokenBudget && attempts.length > 1) {
      const singleAttempt = buildPacketContent(attempts.slice(-1), true, 20, 30);
      packet = singleAttempt.packet;
      mapped = singleAttempt.mapped;
      tokenCount = this.estimateTokens(packet);
      reducedAttempts = true;
      budgetCompacted = true;
    }

    // Level 4: Aggressive compaction if still over budget
    if (tokenCount > maxTokenBudget) {
      const aggressive = buildPacketContent(attempts.slice(-1), true, 8, 12);
      packet = aggressive.packet;
      mapped = aggressive.mapped;
      tokenCount = this.estimateTokens(packet);
      budgetCompacted = true;
    }

    // Level 5: If still oversized after all safe reductions, flag and forbid dispatch
    if (tokenCount > maxTokenBudget) {
      oversized = true;
      packet = `> [!WARNING]\n> **Budget Notice**: This failure autopsy packet exceeds the target budget of ${maxTokenBudget} tokens (estimated ${tokenCount} tokens via ~3.8 char/token heuristic).\n\n` + packet;
      tokenCount = this.estimateTokens(packet);
    }

    return {
      taskId,
      taskTitle,
      taskPrompt,
      attempts: mapped,
      stagnationReason,
      escalationModelTarget: escalationModel,
      tokenCount,
      maxTokenBudget,
      budgetCompacted,
      reducedAttempts,
      oversized,
      canDispatch: !oversized,
      heuristicNote:
        'Token count is an approximation based on ~3.8 characters per token for code/diff content, not an exact tokenizer measurement.',
      formattedPacket: packet,
    };
  }
}
