import * as path from 'node:path';
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

export interface ScopedPriorApproval {
  allowedFiles?: string[]; // Narrowly scoped explicit file list pre-approved by user/host
  maxWritesPerFile?: number; // Cap on edits to any single file (default 6)
  maxTotalModifications?: number; // Cap on total edits across session (default 12)
  allowCommands?: boolean; // Default false
  allowGit?: boolean; // Default false
}

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
 * Creates a narrowly scoped prior approval handler explicitly granted by the user/host.
 * Limits file modifications to explicitly authorized paths, enforces per-file and session
 * write quotas, and default-denies path traversals, shell commands, and Git mutations.
 */
export function createScopedPriorApprovalHandler(
  scope: ScopedPriorApproval = {},
  fallbackPrompt?: HostApprovalHandler
): HostApprovalHandler {
  const writeCounts = new Map<string, number>();
  let totalWrites = 0;
  const maxPerFile = scope.maxWritesPerFile ?? 6;
  const maxTotal = scope.maxTotalModifications ?? 12;

  const allowedSet = scope.allowedFiles
    ? new Set(scope.allowedFiles.map((f) => path.normalize(f).replace(/^[/\\]+/, '')))
    : undefined;

  return async (action: ProposedToolAction) => {
    if (action.category === 'write') {
      const rawPath = String(action.parameters?.path ?? '');
      if (!rawPath || typeof rawPath !== 'string') return false;

      // Strict rejection of directory traversal, absolute paths, and null bytes
      if (rawPath.includes('..') || path.isAbsolute(rawPath) || rawPath.includes('\0')) {
        return false;
      }

      const normPath = path.normalize(rawPath).replace(/^[/\\]+/, '');

      // Narrow scope check: if allowedFiles is defined, target MUST be in granted list
      if (allowedSet && !allowedSet.has(normPath)) {
        if (fallbackPrompt) return await fallbackPrompt(action);
        return false;
      }

      // Quota check: per-file write count
      const currentFileWrites = writeCounts.get(normPath) ?? 0;
      if (currentFileWrites >= maxPerFile) {
        if (fallbackPrompt) return await fallbackPrompt(action);
        return false;
      }

      // Quota check: total session modifications
      if (totalWrites >= maxTotal) {
        if (fallbackPrompt) return await fallbackPrompt(action);
        return false;
      }

      writeCounts.set(normPath, currentFileWrites + 1);
      totalWrites++;
      return true;
    }

    if (action.category === 'command') {
      if (scope.allowCommands) return true;
      if (fallbackPrompt) return await fallbackPrompt(action);
      return false;
    }

    if (action.category === 'git') {
      if (scope.allowGit) return true;
      if (fallbackPrompt) return await fallbackPrompt(action);
      return false;
    }

    if (fallbackPrompt) {
      return await fallbackPrompt(action);
    }
    return false;
  };
}

/**
 * Creates a verified host approval handler that approves file writes strictly targeting
 * the designated workspace, while default-denying path traversals, shell commands, and Git mutations.
 */
export function createWorkspaceApprovalHandler(
  options: {
    allowedFiles?: string[];
    maxWritesPerFile?: number;
    maxTotalModifications?: number;
    allowCommands?: boolean;
    allowGit?: boolean;
  } = {}
): HostApprovalHandler {
  return createScopedPriorApprovalHandler(options);
}
