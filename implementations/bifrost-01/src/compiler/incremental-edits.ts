import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { HostApprovalEngine, ProposedToolAction } from '../governance/approval';
import type { RustSymbol } from './context-compiler';

export interface ProposedModification {
  path: string;
  type: 'full_file' | 'localized_patch';
  content?: string; // full content for full_file
  searchBlock?: string; // search string for localized_patch
  replaceBlock?: string; // replacement string for localized_patch
  expectedRevision?: string; // optional file revision hash
  unresolved?: boolean;
  resolutionError?: string;
}

export interface FileResolutionContext {
  workspacePath?: string;
  fileContents?: Record<string, string>;
  symbols?: RustSymbol[];
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
  private cachedFileContents: Record<string, string> = {};
  private cachedSymbols: RustSymbol[] = [];

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
              this.cachedFileContents[relP] = content;
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

    // Index symbols using ContextCompiler for deterministic file resolution
    try {
      const { ContextCompiler } = await import('./context-compiler.js');
      const compiler = new ContextCompiler();
      const allSymbols: RustSymbol[] = [];
      for (const [relP, content] of Object.entries(this.cachedFileContents)) {
        const rev = fileRevisions[relP] || IncrementalEditManager.hashContent(content);
        const symbols = await compiler.parseRustSymbols(content, relP, rev);
        allSymbols.push(...symbols);
      }
      this.cachedSymbols = allSymbols;
    } catch {
      // Resilient fallback if tree-sitter or lexical scanner fails
    }

    const snapshot: WorkspaceRevisionSnapshot = {
      workspaceRevisionId,
      fileRevisions,
      timestamp: new Date().toISOString(),
    };

    this.currentSnapshot = snapshot;
    this.revisionHistory.push(snapshot);
    return snapshot;
  }

  getResolutionContext(): FileResolutionContext {
    return {
      workspacePath: this.workspacePath,
      fileContents: this.cachedFileContents,
      symbols: this.cachedSymbols,
    };
  }

  parseProposedModifications(responseText: string): ProposedModification[] {
    return IncrementalEditManager.parseProposedModifications(responseText, this.getResolutionContext());
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
    let normalizedSearch = searchBlock.replace(/\r\n/g, '\n').trim();
    let normalizedReplace = replaceBlock.replace(/\r\n/g, '\n');

    if (!normalizedSearch) {
      return { valid: false, error: 'Empty search block provided for localized patch.' };
    }

    // Check occurrences
    let firstIdx = normalizedFile.indexOf(normalizedSearch);
    if (firstIdx === -1) {
      // Strip prompt-artifact symbol annotations if model included them from context (e.g. // Symbol: ...)
      const strippedSearch = normalizedSearch.replace(/^\s*\/\/\s*Symbol:[^\r\n]*\r?\n?/gm, '').trim();
      if (strippedSearch && normalizedFile.indexOf(strippedSearch) !== -1) {
        normalizedSearch = strippedSearch;
        firstIdx = normalizedFile.indexOf(normalizedSearch);
        normalizedReplace = normalizedReplace.replace(/^\s*\/\/\s*Symbol:[^\r\n]*\r?\n?/gm, '');
      }
    }

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
   * Deterministically resolves target file for a proposed code modification.
   * Priority order:
   * 1. Verified explicit file header (e.g. // File: src/...)
   * 2. Consecutive patch path inheritance (only if inherited file actually contains search block)
   * 3. Unique match against actual workspace source (for localized patches)
   * 4. Tree-sitter symbol declarations/implementations matching workspace symbols
   * 5. Unresolved: rejects modification rather than guessing src/lib.rs
   */
  static resolveTargetFile(
    rawPathCandidate: string,
    blockContent: { searchBlock?: string; replaceBlock?: string; content?: string },
    type: 'localized_patch' | 'full_file',
    currentInheritedPath: string,
    context?: FileResolutionContext
  ): { path: string; unresolved?: boolean; resolutionError?: string } {
    const fileContents = context?.fileContents || {};
    const symbols = context?.symbols || [];

    // Step 1: Explicit candidate from header
    if (rawPathCandidate) {
      let clean = rawPathCandidate.replace(/^[`"']+|[`"']+$/g, '').trim();
      clean = clean.replace(/\\/g, '/');

      // If it already has directory prefix (src/ or tests/), verify or normalize
      if (clean.startsWith('src/') || clean.startsWith('tests/')) {
        return { path: clean };
      }

      // Bare filename: check if it exists in known workspace files
      if (fileContents[`src/${clean}`]) {
        return { path: `src/${clean}` };
      }
      if (fileContents[`tests/${clean}`]) {
        return { path: `tests/${clean}` };
      }

      // If directory not specified, prefix src/
      if (!clean.includes('/')) {
        return { path: `src/${clean}` };
      }

      return { path: clean };
    }

    // Step 2: Multi-patch inheritance (consecutive patch in same response)
    // Only inherit if the inherited file actually contains this searchBlock!
    if (currentInheritedPath && type === 'localized_patch' && blockContent.searchBlock) {
      const inheritedContent = fileContents[currentInheritedPath];
      if (inheritedContent) {
        const normalizedSearch = blockContent.searchBlock.replace(/\r\n/g, '\n').trim();
        const strippedSearch = normalizedSearch.replace(/^\s*\/\/\s*Symbol:[^\r\n]*\r?\n?/gm, '').trim();
        if (inheritedContent.includes(normalizedSearch) || (strippedSearch && inheritedContent.includes(strippedSearch))) {
          return { path: currentInheritedPath };
        }
      }
    }

    // Step 3: Unique match against actual workspace source (for localized_patch)
    if (type === 'localized_patch' && blockContent.searchBlock && Object.keys(fileContents).length > 0) {
      const normalizedSearch = blockContent.searchBlock.replace(/\r\n/g, '\n').trim();
      const strippedSearch = normalizedSearch.replace(/^\s*\/\/\s*Symbol:[^\r\n]*\r?\n?/gm, '').trim();

      const matchingFiles: string[] = [];
      for (const [relPath, content] of Object.entries(fileContents)) {
        if (relPath.startsWith('target/') || relPath.startsWith('.git/')) continue;
        const normalizedFile = content.replace(/\r\n/g, '\n');
        if (
          (normalizedSearch && normalizedFile.includes(normalizedSearch)) ||
          (strippedSearch && normalizedFile.includes(strippedSearch))
        ) {
          matchingFiles.push(relPath);
        }
      }

      if (matchingFiles.length === 1) {
        return { path: matchingFiles[0] };
      }

      if (matchingFiles.length > 1) {
        return {
          path: '',
          unresolved: true,
          resolutionError: `Ambiguous target file: search block matches multiple workspace files (${matchingFiles.join(', ')}). Specify explicit file header (e.g. '// File: src/...').`,
        };
      }
    }

    // Step 4: Tree-sitter symbol information
    const textToScan = [
      blockContent.searchBlock || '',
      blockContent.replaceBlock || '',
      blockContent.content || '',
    ].join('\n');

    if (symbols.length > 0 && textToScan.trim().length > 0) {
      // Extract declared/implemented symbol names in textToScan
      const declaredNames = new Set<string>();

      // 1. fn definitions
      for (const m of textToScan.matchAll(/(?:pub\s+)?fn\s+([a-zA-Z0-9_]+)/g)) {
        declaredNames.add(m[1]);
      }
      // 2. struct definitions
      for (const m of textToScan.matchAll(/(?:pub\s+)?struct\s+([a-zA-Z0-9_]+)/g)) {
        declaredNames.add(m[1]);
      }
      // 3. enum definitions
      for (const m of textToScan.matchAll(/(?:pub\s+)?enum\s+([a-zA-Z0-9_]+)/g)) {
        declaredNames.add(m[1]);
      }
      // 4. trait definitions
      for (const m of textToScan.matchAll(/(?:pub\s+)?trait\s+([a-zA-Z0-9_]+)/g)) {
        declaredNames.add(m[1]);
      }
      // 5. impl blocks: impl Foo or impl Trait for Foo
      for (const m of textToScan.matchAll(/impl(?:\s*<[^>]+>)?\s+(?:[a-zA-Z0-9_]+::)*([a-zA-Z0-9_]+)/g)) {
        if (m[1] !== 'for') declaredNames.add(m[1]);
      }
      for (const m of textToScan.matchAll(/impl.*?\s+for\s+([a-zA-Z0-9_]+)/g)) {
        declaredNames.add(m[1]);
      }

      // Match declared names against symbols in workspace
      const candidateFiles = new Set<string>();
      for (const sym of symbols) {
        if (sym.kind === 'test' || sym.kind === 'import') continue;
        const cleanSymName = sym.name.replace(/^impl_/, '');
        if (declaredNames.has(sym.name) || declaredNames.has(cleanSymName)) {
          candidateFiles.add(sym.provenance.filePath);
        }
      }

      if (candidateFiles.size === 1) {
        return { path: Array.from(candidateFiles)[0] };
      }

      if (candidateFiles.size > 1) {
        return {
          path: '',
          unresolved: true,
          resolutionError: `Ambiguous target file: declared symbols match multiple workspace files (${Array.from(candidateFiles).join(', ')}). Specify explicit file header (e.g. '// File: src/...').`,
        };
      }
    }

    // Step 5: Failed to establish destination deterministically
    return {
      path: '',
      unresolved: true,
      resolutionError: 'Target file could not be deterministically resolved (no explicit header, no unique search block match, and no unique Tree-sitter symbol match). Specify explicit file header (e.g. \'// File: src/...\').',
    };
  }

  /**
   * Parses model response into full-file replacements and localized search-and-replace blocks.
   */
  static parseProposedModifications(responseText: string, context?: FileResolutionContext): ProposedModification[] {
    const results: ProposedModification[] = [];
    if (!responseText) return results;

    // Preprocess: unwrap redundant outer code fences before file headers (e.g. ```rust\n// File: src/foo.rs\n```rust)
    const normalizedText = responseText
      .replace(/```(?:rust|rs)?\s*\r?\n\s*(?:\/\/|###?)\s*(?:File:\s*)?([^\r\n]+\.rs)\s*\r?\n\s*```(?:rust|rs)?/gi, '// File: $1\n')
      .replace(/```(?:rust|rs)?\s*\r?\n\s*(?:File:\s*)([^\r\n]+\.rs)\s*\r?\n\s*```(?:rust|rs)?/gi, 'File: $1\n');

    // 1. Parse Search & Replace blocks:
    // // File: <path> [(rev: ...)]
    // <<<<<<< SEARCH (or <<<<<<< HEAD)
    // ...
    // =======
    // ...
    // >>>>>>> REPLACE (or >>>>>>> [branch] or end-of-response)
    const patchRegex = /(?:(?:\/\/|###?|\/\*)\s*(?:File:\s*)?`?([^\r\n`*()]+\.rs)`?[^\r\n]*\r?\n|File:\s*([^\r\n`()]+)[^\r\n]*\r?\n)?<<<<<<<\s*(?:SEARCH|HEAD|ORIGINAL)?\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)(?:\r?\n>>>>>>>\s*(?:REPLACE|TAIL|MODIFIED|[A-Za-z0-9_./-]+)?|$)/gi;
    let match: RegExpExecArray | null;

    let hasPatches = false;
    let currentFilePath = '';
    while ((match = patchRegex.exec(normalizedText)) !== null) {
      hasPatches = true;
      let rawPath = (match[1] || match[2] || '').trim();
      const searchBlock = match[3];
      const replaceBlock = match[4];

      if (!rawPath) {
        const firstLineMatch = (searchBlock + '\n' + replaceBlock).match(/^(?:(?:\/\/|###?|\/\*)\s*(?:File:\s*)?`?([^\r\n`*()]+\.rs)`?|File:\s*([^\r\n`()]+))/m);
        if (firstLineMatch) {
          rawPath = (firstLineMatch[1] || firstLineMatch[2] || '').trim();
        }
      }

      const resolution = IncrementalEditManager.resolveTargetFile(
        rawPath,
        { searchBlock, replaceBlock },
        'localized_patch',
        currentFilePath,
        context
      );

      if (resolution.path) {
        currentFilePath = resolution.path;
      }

      results.push({
        path: resolution.path,
        type: 'localized_patch',
        searchBlock,
        replaceBlock,
        unresolved: resolution.unresolved,
        resolutionError: resolution.resolutionError,
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
    while ((match = fileBlockRegex.exec(normalizedText)) !== null) {
      let rawPath = (match[1] || match[2] || '').trim();
      const content = match[3];

      // Sanity check: do not treat degenerate comment lines or truncated headers as full file replacements!
      const trimmedContent = (content || '').trim();
      const hasCode = /fn\s+|struct\s+|enum\s+|impl\s+|use\s+|pub\s+|let\s+|mod\s+|trait\s+/i.test(trimmedContent);
      if (!hasCode && trimmedContent.length < 50) {
        continue;
      }

      if (!rawPath) {
        const firstLineMatch = content.match(/^(?:(?:\/\/|###?|\/\*)\s*(?:File:\s*)?`?([^\r\n`*]+\.rs)`?\*?|File:\s*([^\r\n`]+))/i);
        if (firstLineMatch) {
          rawPath = (firstLineMatch[1] || firstLineMatch[2] || '').trim();
        }
      }

      const resolution = IncrementalEditManager.resolveTargetFile(
        rawPath,
        { content },
        'full_file',
        currentFilePath,
        context
      );

      if (resolution.path) {
        currentFilePath = resolution.path;
      }

      results.push({
        path: resolution.path,
        type: 'full_file',
        content,
        unresolved: resolution.unresolved,
        resolutionError: resolution.resolutionError,
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

      // Reject unresolved or ambiguous modifications immediately
      if (mod.unresolved || !mod.path) {
        errors.push(
          `Edit rejected: Target file could not be deterministically resolved (${mod.resolutionError ?? 'destination unknown or ambiguous'}). Specify an explicit file header (e.g. '// File: src/...').`
        );
        continue;
      }

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
        let proposed = (mod.content ?? '').trim();

        // Safety check: reject full-file replacements that contain unparsed diff conflict markers
        if (/(?:<<<<<<<\s*(?:SEARCH|HEAD|ORIGINAL)|=======\r?\n|>>>>>>>\s*(?:REPLACE|TAIL|MODIFIED))/i.test(proposed)) {
          errors.push(`Rejected malformed full-file replacement for '${normalizedRelPath}': contains unparsed diff markers.`);
          continue;
        }

        // Clean any pseudo-symbol lines copied from context prompt (e.g. pub impl_block ... or // Symbol: ...)
        proposed = proposed.replace(/^\s*(?:pub\s+)?impl_block\s*\([^)]*\)\s*$/gm, '');
        proposed = proposed.replace(/^\s*\/\/\s*Symbol:[^\r\n]*\r?\n?/gm, '');

        let existingContent = '';
        try {
          existingContent = await fs.readFile(absPath, 'utf8');
        } catch {
          // File does not exist yet; new file
        }

        // If existing file has structs/enums/imports that the proposed full-file omitted
        // (e.g. model generated only the updated `impl ...` block or a single updated function), preserve existing definitions!
        const existingStructs = Array.from(existingContent.matchAll(/(?:pub\s+)?struct\s+([A-Za-z0-9_]+)/g)).map((m) => m[1]);
        const existingEnums = Array.from(existingContent.matchAll(/(?:pub\s+)?enum\s+([A-Za-z0-9_]+)/g)).map((m) => m[1]);
        const missingTypes = [...existingStructs, ...existingEnums].filter(
          (t) => !new RegExp(`(?:struct|enum)\\s+${t}\\b`).test(proposed)
        );

        if (missingTypes.length > 0 && existingContent) {
          // Check if proposed contains functions that already exist in existingContent
          const proposedFns = Array.from(proposed.matchAll(/(?:pub\s+)?fn\s+([A-Za-z0-9_]+)\s*\(/g)).map((m) => m[1]);
          const existingFnsToReplace = proposedFns.filter((fn) =>
            new RegExp(`(?:pub\\s+)?fn\\s+${fn}\\b`).test(existingContent)
          );

          if (existingFnsToReplace.length > 0) {
            // Replace matching functions within existing content via brace counting
            let mergedContent = existingContent;
            for (const fnName of existingFnsToReplace) {
              const fnStartInExisting = mergedContent.search(new RegExp(`(?:pub\\s+)?fn\\s+${fnName}\\b`));
              if (fnStartInExisting === -1) continue;

              // Find existing function span via brace counting
              let depth = 0;
              let existingFnEnd = -1;
              for (let j = fnStartInExisting; j < mergedContent.length; j++) {
                if (mergedContent[j] === '{') depth++;
                else if (mergedContent[j] === '}') {
                  depth--;
                  if (depth === 0) {
                    existingFnEnd = j + 1;
                    break;
                  }
                }
              }

              // Find proposed function span via brace counting
              const fnStartInProposed = proposed.search(new RegExp(`(?:pub\\s+)?fn\\s+${fnName}\\b`));
              if (fnStartInProposed === -1) continue;
              let propDepth = 0;
              let proposedFnEnd = -1;
              for (let j = fnStartInProposed; j < proposed.length; j++) {
                if (proposed[j] === '{') propDepth++;
                else if (proposed[j] === '}') {
                  propDepth--;
                  if (propDepth === 0) {
                    proposedFnEnd = j + 1;
                    break;
                  }
                }
              }

              if (existingFnEnd !== -1 && proposedFnEnd !== -1) {
                const newFnText = proposed.slice(fnStartInProposed, proposedFnEnd);
                const lineBefore = mergedContent.slice(0, fnStartInExisting);
                const lastNewline = lineBefore.lastIndexOf('\n');
                const indent = lastNewline !== -1 ? lineBefore.slice(lastNewline + 1) : '';
                const indentedNewFn = newFnText
                  .split('\n')
                  .map((l, idx) => (idx === 0 ? l.trim() : indent + l))
                  .join('\n');

                mergedContent =
                  mergedContent.slice(0, fnStartInExisting) +
                  indentedNewFn +
                  mergedContent.slice(existingFnEnd);
              }
            }
            proposed = mergedContent;
          } else {
            // Check Case 1: Proposed starts with impl <Type> but has brand new functions
            const implMatch = proposed.match(/^(?:pub\s+)?impl(?:\s*<[^>]+>)?\s+([A-Za-z0-9_]+)/);
            if (implMatch) {
              const typeName = implMatch[1];
              const implIdx = existingContent.search(new RegExp(`(?:pub\\s+)?impl(?:\\s*<[^>]+>)?\\s+${typeName}\\b`));
              if (implIdx !== -1) {
                const preamble = existingContent.slice(0, implIdx).trim();
                proposed = preamble + '\n\n' + proposed;
              }
            }
          }
        }

        finalContent = proposed;
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
