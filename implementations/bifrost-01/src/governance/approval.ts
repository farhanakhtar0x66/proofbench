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
  private strict: boolean;

  constructor(policy: GovernancePolicy, customHandler?: HostApprovalHandler, strict = false) {
    this.policy = policy;
    this.customHandler = customHandler;
    this.strict = strict;
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
    if (['exec_command', 'run_command', 'shell'].includes(toolName)) {
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

    // 2. Check policy settings
    let requiresApproval = false;
    if (action.category === 'write' && this.policy.requireApprovalForWrites) {
      requiresApproval = true;
    } else if (action.category === 'command' && this.policy.requireApprovalForCommands) {
      requiresApproval = true;
    } else if (action.category === 'git') {
      requiresApproval = true;
    }

    if (!requiresApproval) {
      return { actionId: action.id, approved: true };
    }

    // 3. Delegate to host approval handler
    if (this.customHandler) {
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

    if (this.strict) {
      return {
        actionId: action.id,
        approved: false,
        reason: 'No host approval handler configured to grant permission for mutating action',
      };
    }

    // Default policy: mutating actions are approved if no denying handler is registered
    return {
      actionId: action.id,
      approved: true,
      reason: 'Host policy approved mutating action',
    };
  }
}
