import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { HostApprovalEngine, ProposedToolAction } from '../governance/approval';

export interface ProposedModification {
  path: string;
  type: 'full_file' | 'localized_patch';
  content?: string; // full content for full_file
  searchBlock?: string; // search string for localized_patch
  replaceBlock?: string; // replacement string for localized_patch
  expectedRevision?: string; // optional file revision hash
}

export interface EditValidationResult {
  valid: boolean;
  resolvedContent?: string;
  error?: string;
  matchLineStart?: number;
  matchLineEnd?: number;
}

export interface WorkspaceRevisionSnapshot {
  workspaceRevisionId: string;
  fileRevisions: Record<string, string>;
  timestamp: string;
}

export interface IncrementalEditResult {
  success: boolean;
  appliedModifications: Array<{
    path: string;
    type: 'full_file' | 'localized_patch';
    bytesWritten: number;
    newRevision: string;
  }>;
  errors: string[];
}

/**
 * Workspace Revision Tracker and Incremental Edit Manager (Phase C)
 */
export class IncrementalEditManager {
  private workspacePath: string;
  private approvalEngine: HostApprovalEngine;
  private currentSnapshot: WorkspaceRevisionSnapshot | null = null;
  private revisionHistory: WorkspaceRevisionSnapshot[] = [];

  constructor(workspacePath: string, approvalEngine: HostApprovalEngine) {
    this.workspacePath = workspacePath;
    this.approvalEngine = approvalEngine;
  }

  /**
   * Computes SHA-256 hash of a string.
   */
  static hashContent(content: string): string {
    return `sha256:${crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)}`;
  }

  /**
   * Captures the current workspace file revisions and builds a composite workspace revision ID.
   */
  async captureSnapshot(): Promise<WorkspaceRevisionSnapshot> {
    const fileRevisions: Record<string, string> = {};
    const searchDirs = ['src', 'tests'];

    for (const sub of searchDirs) {
      const fullDir = path.join(this.workspacePath, sub);
      try {
        await fs.access(fullDir);
      } catch {
        continue;
      }

      const walk = async (dir: string, base: string) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const fullP = path.join(dir, e.name);
          const relP = path.join(base, e.name);
          if (e.isDirectory() && e.name !== 'target' && e.name !== '.git') {
            await walk(fullP, relP);
          } else if (e.isFile() && e.name.endsWith('.rs')) {
            try {
              const content = await fs.readFile(fullP, 'utf8');
              fileRevisions[relP] = IncrementalEditManager.hashContent(content);
            } catch {
              // ignore
            }
          }
        }
      };

      await walk(fullDir, sub);
    }

    // Sort entries to make composite hash deterministic
    const sortedKeys = Object.keys(fileRevisions).sort();
    const compositeString = sortedKeys.map((k) => `${k}:${fileRevisions[k]}`).join('|');
    const workspaceRevisionId = IncrementalEditManager.hashContent(compositeString);

    const snapshot: WorkspaceRevisionSnapshot = {
      workspaceRevisionId,
      fileRevisions,
      timestamp: new Date().toISOString(),
    };

    this.currentSnapshot = snapshot;
    this.revisionHistory.push(snapshot);
    return snapshot;
  }

  getLatestSnapshot(): WorkspaceRevisionSnapshot | null {
    return this.currentSnapshot;
  }

  /**
   * Generates a concise delta summary of files changed between previous turn and current turn.
   */
  getIncrementalNotice(): string | null {
    if (this.revisionHistory.length < 2) return null;

    const previous = this.revisionHistory[this.revisionHistory.length - 2];
    const current = this.revisionHistory[this.revisionHistory.length - 1];

    const modifiedFiles: string[] = [];
    const unchangedFiles: string[] = [];

    for (const [filePath, rev] of Object.entries(current.fileRevisions)) {
      if (previous.fileRevisions[filePath] !== rev) {
        modifiedFiles.push(`\`${filePath}\` (updated to ${rev})`);
      } else {
        unchangedFiles.push(`\`${filePath}\``);
      }
    }

    if (modifiedFiles.length === 0) return null;

    return `Incremental Workspace Delta:
- Modified in recent attempt: ${modifiedFiles.join(', ')}
- Unchanged static files: ${unchangedFiles.join(', ')}
Only the modified code delta requires inspection; do not revert unchanged files.`;
  }

  /**
   * Validates a proposed localized patch against target file content.
   */
  static validatePatch(
    fileContent: string,
    searchBlock: string,
    replaceBlock: string,
    expectedRevision?: string
  ): EditValidationResult {
    // 1. Revision check if provided
    if (expectedRevision) {
      const actualRevision = this.hashContent(fileContent);
      if (actualRevision !== expectedRevision) {
        return {
          valid: false,
          error: `Stale revision conflict: expected ${expectedRevision}, but current file is ${actualRevision}`,
        };
      }
    }

    // Normalize line endings for reliable matching
    const normalizedFile = fileContent.replace(/\r\n/g, '\n');
    const normalizedSearch = searchBlock.replace(/\r\n/g, '\n').trim();
    const normalizedReplace = replaceBlock.replace(/\r\n/g, '\n');

    if (!normalizedSearch) {
      return { valid: false, error: 'Empty search block provided for localized patch.' };
    }

    // Check occurrences
    const firstIdx = normalizedFile.indexOf(normalizedSearch);
    if (firstIdx === -1) {
      return {
        valid: false,
        error: `Search block not found in file. Ensure exact whitespace and surrounding lines match.`,
      };
    }

    const secondIdx = normalizedFile.indexOf(normalizedSearch, firstIdx + normalizedSearch.length);
    if (secondIdx !== -1) {
      return {
        valid: false,
        error: `Search block is ambiguous (matched multiple locations). Provide additional surrounding lines.`,
      };
    }

    // Apply clean replacement
    const before = normalizedFile.slice(0, firstIdx);
    const after = normalizedFile.slice(firstIdx + normalizedSearch.length);
    const resolvedContent = before + normalizedReplace + after;

    const matchLineStart = before.split('\n').length;
    const matchLineEnd = matchLineStart + normalizedSearch.split('\n').length - 1;

    return {
      valid: true,
      resolvedContent,
      matchLineStart,
      matchLineEnd,
    };
  }

  /**
   * Parses model response into full-file replacements and localized search-and-replace blocks.
   */
  static parseProposedModifications(responseText: string): ProposedModification[] {
    const results: ProposedModification[] = [];
    if (!responseText) return results;

    // 1. Parse Search & Replace blocks:
    // // File: <path>
    // <<<<<<< SEARCH
    // ...
    // =======
    // ...
    // >>>>>>> REPLACE
    const patchRegex = /(?:(?:\/\/|###?|\/\*)\s*(?:File:\s*)?`?([^\r\n`*]+\.rs)`?\*?|File:\s*([^\r\n`]+)\s*)?<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> REPLACE/gi;
    let match: RegExpExecArray | null;

    let hasPatches = false;
    while ((match = patchRegex.exec(responseText)) !== null) {
      hasPatches = true;
      let rawPath = (match[1] || match[2] || '').trim();
      const searchBlock = match[3];
      const replaceBlock = match[4];

      if (!rawPath) {
        const firstLineMatch = (searchBlock + '\n' + replaceBlock).match(/^(?:(?:\/\/|###?|\/\*)\s*(?:File:\s*)?`?([^\r\n`*]+\.rs)`?\*?|File:\s*([^\r\n`]+))/m);
        if (firstLineMatch) {
          rawPath = (firstLineMatch[1] || firstLineMatch[2] || '').trim();
        }
      }

      if (!rawPath) {
        if (searchBlock.includes('parse_event') || replaceBlock.includes('parse_event')) {
          rawPath = 'src/parser.rs';
        } else if (searchBlock.includes('EventSink') || replaceBlock.includes('EventSink')) {
          rawPath = 'src/sink.rs';
        } else if (searchBlock.includes('calculate_checksum') || replaceBlock.includes('calculate_checksum')) {
          rawPath = 'src/event.rs';
        } else {
          rawPath = 'src/lib.rs';
        }
      }

      let targetPath = rawPath.replace(/^[`"']+|[`"']+$/g, '').trim();
      if (!targetPath.startsWith('src/') && !targetPath.startsWith('tests/') && !targetPath.includes('/')) {
        targetPath = `src/${targetPath}`;
      }
      results.push({
        path: targetPath,
        type: 'localized_patch',
        searchBlock,
        replaceBlock,
      });
    }

    if (hasPatches) {
      return results;
    }

    // 2. Parse Full File markdown blocks:
    // // File: <path> (optional rev: ...)
    // ```rust
    // <code>
    // ```
    const fileBlockRegex = /(?:(?:(?:\/\/|###?|\/\*)\s*(?:File:\s*)?`?([^\r\n`*]+\.rs)`?(?:[^\r\n]*)|File:\s*([^\r\n`]+))\s*)?```(?:rust|rs)?\r?\n([\s\S]*?)```/gi;
    while ((match = fileBlockRegex.exec(responseText)) !== null) {
      let rawPath = (match[1] || match[2] || '').trim();
      const content = match[3];

      if (!rawPath) {
        const firstLineMatch = content.match(/^(?:(?:\/\/|###?|\/\*)\s*(?:File:\s*)?`?([^\r\n`*]+\.rs)`?\*?|File:\s*([^\r\n`]+))/i);
        if (firstLineMatch) {
          rawPath = (firstLineMatch[1] || firstLineMatch[2] || '').trim();
        }
      }

      if (!rawPath) {
        if (content.includes('parse_csv_line') || content.includes('struct Event') || content.includes('enum EventType')) {
          rawPath = 'src/event.rs';
        } else if (content.includes('EventDispatcher')) {
          rawPath = 'src/dispatcher.rs';
        } else if (content.includes('EventFilter') || content.includes('evaluate_predicate')) {
          rawPath = 'src/filter.rs';
        } else if (content.includes('parse_event')) {
          rawPath = 'src/parser.rs';
        } else if (content.includes('EventSink')) {
          rawPath = 'src/sink.rs';
        } else if (content.includes('calculate_checksum')) {
          rawPath = 'src/event.rs';
        } else if (content.includes('sliding_window_sums') || content.includes('ExponentialBackoff')) {
          rawPath = 'src/lib.rs';
        } else {
          rawPath = 'src/lib.rs';
        }
      }

      let targetPath = rawPath.replace(/^[`"']+|[`"']+$/g, '').trim();
      if (!targetPath.startsWith('src/') && !targetPath.startsWith('tests/') && !targetPath.includes('/')) {
        targetPath = `src/${targetPath}`;
      }
      results.push({
        path: targetPath,
        type: 'full_file',
        content,
      });
    }

    return results;
  }

  /**
   * Validates, seeks host approval, and executes all proposed modifications within workspace.
   */
  async applyModifications(
    modifications: ProposedModification[],
    attemptNumber: number
  ): Promise<IncrementalEditResult> {
    const applied: IncrementalEditResult['appliedModifications'] = [];
    const errors: string[] = [];

    for (let i = 0; i < modifications.length; i++) {
      const mod = modifications[i];
      const normalizedRelPath = path.normalize(mod.path).replace(/^[/\\]+/, '');

      // Path traversal protection
      if (
        normalizedRelPath.startsWith('..') ||
        path.isAbsolute(normalizedRelPath) ||
        normalizedRelPath.includes('\0')
      ) {
        errors.push(`Security rejection: path traversal attempt in '${mod.path}'`);
        continue;
      }

      const absPath = path.resolve(this.workspacePath, normalizedRelPath);
      if (!absPath.startsWith(path.resolve(this.workspacePath))) {
        errors.push(`Security rejection: path escapes workspace '${mod.path}'`);
        continue;
      }

      let finalContent = '';

      if (mod.type === 'full_file') {
        finalContent = mod.content ?? '';
      } else if (mod.type === 'localized_patch') {
        let existingContent = '';
        try {
          existingContent = await fs.readFile(absPath, 'utf8');
        } catch {
          errors.push(`Cannot apply localized patch: file '${normalizedRelPath}' does not exist.`);
          continue;
        }

        const validation = IncrementalEditManager.validatePatch(
          existingContent,
          mod.searchBlock ?? '',
          mod.replaceBlock ?? '',
          mod.expectedRevision
        );

        if (!validation.valid || validation.resolvedContent === undefined) {
          errors.push(`Patch validation failed for '${normalizedRelPath}': ${validation.error}`);
          continue;
        }

        finalContent = validation.resolvedContent;
      }

      // Check Host Approval Engine
      const action: ProposedToolAction = {
        id: `edit-${attemptNumber}-${i + 1}`,
        tool: 'write_file',
        parameters: { path: normalizedRelPath, content: finalContent },
        category: 'write',
      };

      const approval = await this.approvalEngine.evaluateAction(action);
      if (!approval.approved) {
        errors.push(`Action rejected by host approval engine: ${approval.reason} (Host approval denied for '${normalizedRelPath}')`);
        continue;
      }

      // Write approved content
      await fs.mkdir(path.dirname(absPath), { recursive: true });
      await fs.writeFile(absPath, finalContent, 'utf8');

      const newRevision = IncrementalEditManager.hashContent(finalContent);
      applied.push({
        path: normalizedRelPath,
        type: mod.type,
        bytesWritten: Buffer.byteLength(finalContent, 'utf8'),
        newRevision,
      });
    }

    // Update snapshot after edits
    await this.captureSnapshot();

    return {
      success: applied.length > 0 && errors.length === 0,
      appliedModifications: applied,
      errors,
    };
  }
}
