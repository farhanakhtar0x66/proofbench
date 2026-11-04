import { GovernancePolicy } from './policy';

export interface ProposedToolAction {
  id: string;
  tool: string;
  parameters: Record<string, unknown>;
  category: 'read' | 'write' | 'command' | 'git' | 'other';
}

export interface ApprovalDecision {
  actionId: string;
  approved: boolean;
  reason?: string;
}

export type HostApprovalHandler = (action: ProposedToolAction) => Promise<boolean> | boolean;

export class HostApprovalEngine {
  private policy: GovernancePolicy;
  private customHandler?: HostApprovalHandler;

  constructor(policy: GovernancePolicy, customHandler?: HostApprovalHandler, _strict = true) {
    this.policy = policy;
    this.customHandler = customHandler;
  }

  setApprovalHandler(handler: HostApprovalHandler): void {
    this.customHandler = handler;
  }

  categorizeAction(toolName: string): ProposedToolAction['category'] {
    if (['read_file', 'list_files', 'get_context', 'verify_claim'].includes(toolName)) {
      return 'read';
    }
    if (['write_file', 'patch_file', 'delete_file'].includes(toolName)) {
      return 'write';
    }
    if (['exec_command', 'run_command', 'shell', 'bash', 'sh'].includes(toolName)) {
      return 'command';
    }
    if (toolName.startsWith('git')) {
      return 'git';
    }
    return 'other';
  }

  async evaluateAction(action: ProposedToolAction): Promise<ApprovalDecision> {
    // 1. Read-only actions proceed without approval
    if (action.category === 'read') {
      return {
        actionId: action.id,
        approved: true,
        reason: 'Read-only action auto-approved by host policy',
      };
    }

    // 2. Mutating actions require explicit host approval.
    // Default-deny: If no approval handler is registered, all writes, commands, and Git mutations are rejected.
    if (!this.customHandler) {
      return {
        actionId: action.id,
        approved: false,
        reason: `Default-deny: Mutating action '${action.tool}' (category: ${action.category}) rejected without explicit host approval handler.`,
      };
    }

    // 3. Delegate to host approval handler
    const isApproved = await this.customHandler(action);
    if (!isApproved) {
      return {
        actionId: action.id,
        approved: false,
        reason: `Host explicit policy denied ${action.category} action '${action.tool}'. Action halted.`,
      };
    }

    return {
      actionId: action.id,
      approved: true,
      reason: 'Host explicitly approved action',
    };
  }
}

/**
 * Creates a verified host approval handler that approves file writes strictly targeting
 * the designated workspace, while default-denying path traversals, shell commands, and Git mutations.
 */
export function createWorkspaceApprovalHandler(options: {
  allowCommands?: boolean;
  allowGit?: boolean;
} = {}): HostApprovalHandler {
  return (action: ProposedToolAction) => {
    if (action.category === 'write') {
      const targetPath = action.parameters.path as string;
      if (!targetPath || typeof targetPath !== 'string') return false;
      // Reject directory traversal, absolute paths, and null bytes
      if (targetPath.includes('..') || targetPath.startsWith('/') || targetPath.includes('\0')) {
        return false;
      }
      return true;
    }
    if (action.category === 'command') {
      return options.allowCommands ?? false;
    }
    if (action.category === 'git') {
      return options.allowGit ?? false;
    }
    return false;
  };
}
