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
  oversized: boolean;
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
      const head = lines.slice(0, 12).join('\n');
      const tail = lines.slice(-8).join('\n');
      return `${head}\n... [compacted ${lines.length - 20} lines of diagnostic output for M3a budget] ...\n${tail}`;
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
    const head = lines.slice(0, 18).join('\n');
    const tail = lines.slice(-10).join('\n');
    return `${head}\n... [compacted ${lines.length - 28} lines of patch diff for M3a budget] ...\n${tail}`;
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

    const buildPacketContent = (compact = false) => {
      let packet = `# Structured Failure Autopsy (M3a - Evidence-Only)\n\n`;
      packet += `**Task ID**: ${taskId}\n`;
      packet += `**Title**: ${taskTitle}\n`;
      packet += `**Original Goal**: ${taskPrompt}\n\n`;
      if (stagnationReason) {
        packet += `**Controller Halt Reason**: ${stagnationReason}\n\n`;
      }

      packet += `## Verified Failure Ledger (No LLM Narrative)\n\n`;

      const mapped = attempts.map((att) => {
        const rawDiag = att.rawError || att.errorSignature;
        const diag = compact ? this.compactDiagnostics(rawDiag) : rawDiag;
        const patch = compact ? this.compactPatch(att.rawPatch) : att.rawPatch;

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

    // First attempt: uncompacted
    let { packet, mapped } = buildPacketContent(false);
    let tokenCount = this.estimateTokens(packet);
    let budgetCompacted = false;
    let oversized = false;

    // Compact if exceeds budget
    if (tokenCount > maxTokenBudget) {
      const compacted = buildPacketContent(true);
      packet = compacted.packet;
      mapped = compacted.mapped;
      tokenCount = this.estimateTokens(packet);
      budgetCompacted = true;
    }

    // If still oversized, explicitly flag and prepend notice
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
      oversized,
      heuristicNote:
        'Token count is an approximation based on ~3.8 characters per token for code/diff content, not an exact tokenizer measurement.',
      formattedPacket: packet,
    };
  }
}
