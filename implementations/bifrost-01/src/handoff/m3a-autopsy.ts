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
  formattedPacket: string;
}

export class M3aFailureAutopsyBuilder {
  static buildAutopsyPacket(options: {
    taskId: string;
    taskTitle: string;
    taskPrompt: string;
    attempts: AttemptRecord[];
    stagnationReason?: string;
    escalationModel?: string;
  }): M3aFailureAutopsy {
    const { taskId, taskTitle, taskPrompt, attempts, stagnationReason, escalationModel = 'escalation-frontier-model' } = options;

    let packet = `# Structured Failure Autopsy (M3a - Evidence-Only)\n\n`;
    packet += `**Task ID**: ${taskId}\n`;
    packet += `**Title**: ${taskTitle}\n`;
    packet += `**Original Goal**: ${taskPrompt}\n\n`;
    if (stagnationReason) {
      packet += `**Controller Halt Reason**: ${stagnationReason}\n\n`;
    }

    packet += `## Verified Failure Ledger (No LLM Narrative)\n\n`;

    const mappedAttempts = attempts.map((att) => {
      packet += `### Attempt ${att.attemptIndex} [Exit Code: ${att.testExitCode}]\n`;
      packet += `#### Applied Patch:\n\`\`\`diff\n${att.rawPatch.trim() || 'No changes made'}\n\`\`\`\n`;
      packet += `#### Compiler / Test Diagnostic Output:\n\`\`\`\n${att.errorSignature || 'No error signature'}\n\`\`\`\n\n`;

      return {
        attemptNumber: att.attemptIndex,
        unifiedPatch: att.rawPatch,
        exitCode: att.testExitCode,
        errorDiagnostics: att.errorSignature,
      };
    });

    packet += `## Escalation Directive\n`;
    packet += `Escalating to authorized frontier model '${escalationModel}' via Bifrost routing to resolve persistent diagnostic signatures without repeating previous failed patches.\n`;

    // Estimate tokens
    const tokenCount = Math.ceil(packet.length / 3.8);

    return {
      taskId,
      taskTitle,
      taskPrompt,
      attempts: mappedAttempts,
      stagnationReason,
      escalationModelTarget: escalationModel,
      tokenCount,
      formattedPacket: packet,
    };
  }
}
