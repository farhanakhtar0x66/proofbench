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

      // 1. Check for null bytes
      if (clean.includes('\0')) {
        return {
          path: '',
          unresolved: true,
          resolutionError: `Null byte detected in candidate path '${rawPathCandidate}'.`,
        };
      }

      // 2. Reject absolute paths (POSIX /..., Windows UNC //..., \\..., or drive-qualified C:/...)
      if (
        clean.startsWith('/') ||
        clean.startsWith('\\') ||
        clean.startsWith('//') ||
        /^[a-zA-Z]:/.test(clean) ||
        path.isAbsolute(clean)
      ) {
        return {
          path: '',
          unresolved: true,
          resolutionError: `Absolute, drive-qualified, or UNC path rejected: '${rawPathCandidate}'. File headers must specify relative paths within workspace.`,
        };
      }

      // 3. Reject parent traversal ('..')
      const rawSegments = clean.split(/[/\\]+/);
      const normalizedPath = path.normalize(clean).replace(/\\/g, '/');
      if (
        rawSegments.includes('..') ||
        normalizedPath.startsWith('../') ||
        normalizedPath === '..' ||
        path.isAbsolute(normalizedPath)
      ) {
        return {
          path: '',
          unresolved: true,
          resolutionError: `Parent traversal ('..') rejected in path '${rawPathCandidate}'. File headers must remain within workspace.`,
        };
      }

      const cleanRel = normalizedPath.replace(/^\.\//, '');

      // 4. Authorized prefix: src/ or tests/
      if (cleanRel.startsWith('src/') || cleanRel.startsWith('tests/')) {
        return { path: cleanRel };
      }

      // 5. Bare filename without directory: check if it exists in src/ or tests/
      if (!cleanRel.includes('/')) {
        if (fileContents[`src/${cleanRel}`]) {
          return { path: `src/${cleanRel}` };
        }
        if (fileContents[`tests/${cleanRel}`]) {
          return { path: `tests/${cleanRel}` };
        }
        // Default bare Rust files to src/
        return { path: `src/${cleanRel}` };
      }

      // 6. Non-standard directory: check if file explicitly exists in known workspace files
      if (fileContents[cleanRel]) {
        return { path: cleanRel };
      }

      // Otherwise reject paths targeting unauthorized locations outside src/ and tests/
      return {
        path: '',
        unresolved: true,
        resolutionError: `Path '${rawPathCandidate}' is outside authorized workspace locations ('src/' or 'tests/').`,
      };
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

    // Preprocess: unwrap redundant outer code fences at the start of response before file headers
    const normalizedText = responseText
      .replace(/^\s*```(?:rust|rs)?\s*\r?\n\s*(?:\/\/|###?)\s*(?:File:\s*)?([^\r\n]+\.rs)\s*\r?\n\s*```(?:rust|rs)?/i, '// File: $1\n')
      .replace(/^\s*```(?:rust|rs)?\s*\r?\n\s*(?:File:\s*)([^\r\n]+\.rs)\s*\r?\n\s*```(?:rust|rs)?/i, 'File: $1\n');

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
   * Merges a partial Rust file (e.g. an updated impl block or function) into existing file content
   * using Tree-sitter AST syntax ranges. Does NOT use fragile brace counting.
   * If a reliable AST-based replacement cannot be established, fails closed with an error.
   */
  static async mergePartialFileAST(
    existingContent: string,
    proposedContent: string,
    _filePath: string
  ): Promise<{ success: boolean; mergedContent?: string; error?: string }> {
    try {
      const { ContextCompiler } = await import('./context-compiler.js');
      const parser = await ContextCompiler.getTreeSitterParser();
      if (!parser) {
        return {
          success: false,
          error: 'Tree-sitter parser is not available. Cannot perform safe AST partial replacement.',
        };
      }

      const existingTree = parser.parse(existingContent);
      const proposedTree = parser.parse(proposedContent);

      if (!existingTree || !proposedTree || existingTree.rootNode.hasError || proposedTree.rootNode.hasError) {
        return {
          success: false,
          error: 'Tree-sitter syntax errors detected in existing or proposed code. Rejecting partial merge to prevent corruption.',
        };
      }

      interface AstFunctionSpan {
        name: string;
        enclosingImplType?: string;
        start: number;
        end: number;
        text: string;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extractFunctions = (rootNode: any): AstFunctionSpan[] => {
        const fns: AstFunctionSpan[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const walk = (node: any, enclosingImplType?: string) => {
          if (node.type === 'impl_item') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const typeNode = node.children.find((c: any) => c.type === 'type_identifier');
            const implType = typeNode ? typeNode.text : undefined;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const declList = node.children.find((c: any) => c.type === 'declaration_list');
            if (declList) {
              for (let i = 0; i < declList.childCount; i++) {
                walk(declList.child(i), implType);
              }
            }
            return;
          }

          if (node.type === 'function_item') {
            const nameNode =
              node.childForFieldName?.('name') ||
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              node.children.find((c: any) => c.type === 'identifier');
            if (nameNode) {
              fns.push({
                name: nameNode.text,
                enclosingImplType,
                start: node.startIndex,
                end: node.endIndex,
                text: node.text,
              });
            }
          }

          for (let i = 0; i < node.childCount; i++) {
            walk(node.child(i), enclosingImplType);
          }
        };

        walk(rootNode, undefined);
        return fns;
      };

      const existingFns = extractFunctions(existingTree.rootNode);
      const proposedFns = extractFunctions(proposedTree.rootNode);

      if (proposedFns.length === 0) {
        return {
          success: false,
          error: 'No valid Rust functions found in proposed replacement to merge.',
        };
      }

      const replacements: Array<{ start: number; end: number; newText: string }> = [];

      for (const pf of proposedFns) {
        const matches = existingFns.filter(
          (ef) =>
            ef.name === pf.name &&
            (!pf.enclosingImplType || !ef.enclosingImplType || ef.enclosingImplType === pf.enclosingImplType)
        );

        if (matches.length === 1) {
          const match = matches[0];
          // Preserve indentation of original function
          const lineStart = existingContent.lastIndexOf('\n', match.start) + 1;
          const indent = existingContent.slice(lineStart, match.start);
          const indentedText = pf.text
            .split('\n')
            .map((line, idx) => (idx === 0 ? line : indent + line.replace(/^\s+/, '    ')))
            .join('\n');

          replacements.push({
            start: match.start,
            end: match.end,
            newText: indentedText,
          });
        } else if (matches.length > 1) {
          return {
            success: false,
            error: `Ambiguous function match for '${pf.name}': multiple candidate functions in existing AST.`,
          };
        } else {
          // If function is new, check if enclosing impl exists to append
          if (pf.enclosingImplType) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let implNode: any = null;
            for (let i = 0; i < existingTree.rootNode.childCount; i++) {
              const child = existingTree.rootNode.child(i);
              if (child && child.type === 'impl_item') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const typeNode = child.children.find((c: any) => c.type === 'type_identifier');
                if (typeNode && typeNode.text === pf.enclosingImplType) {
                  implNode = child;
                  break;
                }
              }
            }

            if (implNode) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const declList = implNode.children.find((c: any) => c.type === 'declaration_list');
              if (declList && declList.childCount >= 2) {
                const closingBrace = declList.child(declList.childCount - 1);
                replacements.push({
                  start: closingBrace.startIndex,
                  end: closingBrace.startIndex,
                  newText: `    ${pf.text}\n`,
                });
              }
            } else {
              return {
                success: false,
                error: `Could not locate target impl for '${pf.enclosingImplType}' to insert new method '${pf.name}'.`,
              };
            }
          } else {
            return {
              success: false,
              error: `Function '${pf.name}' does not exist in target file and cannot be placed unambiguously.`,
            };
          }
        }
      }

      // Sort replacements by start descending
      replacements.sort((a, b) => b.start - a.start);

      let merged = existingContent;
      for (const r of replacements) {
        merged = merged.slice(0, r.start) + r.newText + merged.slice(r.end);
      }

      // Verify merged code parses cleanly with Tree-sitter
      const verifyTree = parser.parse(merged);
      if (!verifyTree || verifyTree.rootNode.hasError) {
        return {
          success: false,
          error: 'Merged AST contains syntax errors after replacement. Rejecting partial merge.',
        };
      }

      return {
        success: true,
        mergedContent: merged,
      };
    } catch (err) {
      return {
        success: false,
        error: `AST merge exception: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Validates, seeks host approval, and executes all proposed modifications within workspace.
   * Enforces transactional multi-file atomicity: if any edit fails validation or approval,
   * zero disk writes occur. If a commit fails midway, changes are safely rolled back.
   */
  async applyModifications(
    modifications: ProposedModification[],
    attemptNumber: number
  ): Promise<IncrementalEditResult> {
    const applied: IncrementalEditResult['appliedModifications'] = [];
    const errors: string[] = [];

    if (!modifications || modifications.length === 0) {
      return { success: false, appliedModifications: [], errors: ['No modifications provided'] };
    }

    // -------------------------------------------------------------------------
    // STAGE 1: TRANSACTION VALIDATION & IN-MEMORY STAGING (ZERO DISK WRITES)
    // -------------------------------------------------------------------------
    const stagedFiles = new Map<string, string>();
    const originalFiles = new Map<string, string | null>();
    const initialRevisions = new Map<string, string>();
    const stagedModDetails: Array<{ path: string; type: 'full_file' | 'localized_patch'; isNewFile: boolean }> = [];

    for (let i = 0; i < modifications.length; i++) {
      const mod = modifications[i];

      // 1. Unresolved or missing path check
      if (mod.unresolved || !mod.path) {
        errors.push(
          `Edit rejected: Target file could not be deterministically resolved (${mod.resolutionError ?? 'destination unknown or ambiguous'}). Specify an explicit file header (e.g. '// File: src/...').`
        );
        continue;
      }

      const normalizedRelPath = path.normalize(mod.path).replace(/\\/g, '/').replace(/^[/\\]+/, '');

      // 2. Path traversal security checks
      const rawSegments = mod.path.split(/[/\\]+/);
      if (
        rawSegments.includes('..') ||
        normalizedRelPath.startsWith('..') ||
        path.isAbsolute(normalizedRelPath) ||
        normalizedRelPath.includes('\0')
      ) {
        errors.push(`Security rejection: path traversal attempt in '${mod.path}'`);
        continue;
      }

      // 3. Workspace containment check
      const absPath = path.resolve(this.workspacePath, normalizedRelPath);
      if (!absPath.startsWith(path.resolve(this.workspacePath))) {
        errors.push(`Security rejection: path escapes workspace '${mod.path}'`);
        continue;
      }

      // 4. Retrieve or read base content for this file
      let isNewFile = false;
      let baseContent: string;
      if (stagedFiles.has(normalizedRelPath)) {
        baseContent = stagedFiles.get(normalizedRelPath)!;
      } else {
        let diskContent: string | null = null;
        try {
          diskContent = await fs.readFile(absPath, 'utf8');
          originalFiles.set(normalizedRelPath, diskContent);
          initialRevisions.set(normalizedRelPath, IncrementalEditManager.hashContent(diskContent));
          baseContent = diskContent;
        } catch {
          // File does not exist yet on disk
          originalFiles.set(normalizedRelPath, null);
          initialRevisions.set(normalizedRelPath, 'sha256:0000000000000000');
          baseContent = '';
          isNewFile = true;
        }
      }

      // 5. Revision verification if expectedRevision specified
      if (mod.expectedRevision) {
        const currentRev = initialRevisions.get(normalizedRelPath);
        if (currentRev && currentRev !== mod.expectedRevision) {
          errors.push(
            `Stale revision conflict for '${normalizedRelPath}': expected ${mod.expectedRevision}, but current file is ${currentRev}`
          );
          continue;
        }
      }

      // 6. Compute next content
      let finalContent = '';
      if (mod.type === 'full_file') {
        let proposed = (mod.content ?? '').trim();

        // Reject unparsed diff conflict markers
        if (/(?:<<<<<<<\s*(?:SEARCH|HEAD|ORIGINAL)|=======\r?\n|>>>>>>>\s*(?:REPLACE|TAIL|MODIFIED))/i.test(proposed)) {
          errors.push(`Rejected malformed full-file replacement for '${normalizedRelPath}': contains unparsed diff markers.`);
          continue;
        }

        proposed = proposed.replace(/^\s*(?:pub\s+)?impl_block\s*\([^)]*\)\s*$/gm, '');
        proposed = proposed.replace(/^\s*\/\/\s*Symbol:[^\r\n]*\r?\n?/gm, '');

        if (!isNewFile && baseContent) {
          // Check if proposed is a partial file (omits structs/enums/imports present in baseContent)
          const existingStructs = Array.from(baseContent.matchAll(/(?:pub\s+)?struct\s+([A-Za-z0-9_]+)/g)).map((m) => m[1]);
          const existingEnums = Array.from(baseContent.matchAll(/(?:pub\s+)?enum\s+([A-Za-z0-9_]+)/g)).map((m) => m[1]);
          const missingTypes = [...existingStructs, ...existingEnums].filter(
            (t) => !new RegExp(`(?:struct|enum)\\s+${t}\\b`).test(proposed)
          );

          if (missingTypes.length > 0) {
            // Proposed is a partial file: use Tree-sitter AST merge!
            const astMerge = await IncrementalEditManager.mergePartialFileAST(baseContent, proposed, normalizedRelPath);
            if (!astMerge.success || !astMerge.mergedContent) {
              errors.push(
                `Partial file replacement rejected for '${normalizedRelPath}': ${astMerge.error ?? 'AST structural merge failed'}. Provide a complete file or localized search/replace block.`
              );
              continue;
            }
            proposed = astMerge.mergedContent;
          }
        }

        finalContent = proposed;
      } else if (mod.type === 'localized_patch') {
        if (isNewFile) {
          errors.push(`Cannot apply localized patch: file '${normalizedRelPath}' does not exist.`);
          continue;
        }

        const validation = IncrementalEditManager.validatePatch(
          baseContent,
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

      // 7. Host Approval Check
      const action: ProposedToolAction = {
        id: `edit-${attemptNumber}-${i + 1}`,
        tool: isNewFile ? 'create_file' : 'write_file',
        parameters: { path: normalizedRelPath, content: finalContent, isNewFile },
        category: 'write',
      };

      const approval = await this.approvalEngine.evaluateAction(action);
      if (!approval.approved) {
        errors.push(`Action rejected by host approval engine: ${approval.reason} (Host approval denied for '${normalizedRelPath}')`);
        continue;
      }

      // Update in-memory staged file
      stagedFiles.set(normalizedRelPath, finalContent);
      stagedModDetails.push({ path: normalizedRelPath, type: mod.type, isNewFile });
    }

    // -------------------------------------------------------------------------
    // FAIL-CLOSED GATE: ZERO DISK MUTATIONS IF ANY ERROR OCCURRED
    // -------------------------------------------------------------------------
    if (errors.length > 0) {
      return {
        success: false,
        appliedModifications: [],
        errors,
      };
    }

    // -------------------------------------------------------------------------
    // STAGE 2: ATOMIC COMMIT WITH SAFE ROLLBACK
    // -------------------------------------------------------------------------
    const committedPaths: string[] = [];
    try {
      for (const [relPath, content] of stagedFiles.entries()) {
        const absPath = path.resolve(this.workspacePath, relPath);
        await fs.mkdir(path.dirname(absPath), { recursive: true });
        await fs.writeFile(absPath, content, 'utf8');
        committedPaths.push(relPath);
      }
    } catch (commitErr) {
      // Rollback committed files to prior state
      for (const relPath of committedPaths) {
        const absPath = path.resolve(this.workspacePath, relPath);
        const orig = originalFiles.get(relPath);
        try {
          if (orig === null || orig === undefined) {
            await fs.unlink(absPath).catch(() => {});
          } else {
            await fs.writeFile(absPath, orig, 'utf8');
          }
        } catch {
          // ignore rollback cleanup errors
        }
      }
      return {
        success: false,
        appliedModifications: [],
        errors: [`Transaction commit failed: ${(commitErr as Error).message}. Workspace rolled back to prior state.`],
      };
    }

    // -------------------------------------------------------------------------
    // STAGE 3: POST-COMMIT REVISION VERIFICATION & AUDIT TRAIL
    // -------------------------------------------------------------------------
    for (const [relPath, expectedContent] of stagedFiles.entries()) {
      const absPath = path.resolve(this.workspacePath, relPath);
      const actualContent = await fs.readFile(absPath, 'utf8');
      const actualRevision = IncrementalEditManager.hashContent(actualContent);
      const expectedRevision = IncrementalEditManager.hashContent(expectedContent);

      if (actualRevision !== expectedRevision) {
        // Rollback all files!
        for (const rPath of stagedFiles.keys()) {
          const aPath = path.resolve(this.workspacePath, rPath);
          const orig = originalFiles.get(rPath);
          if (orig === null || orig === undefined) {
            await fs.unlink(aPath).catch(() => {});
          } else {
            await fs.writeFile(aPath, orig, 'utf8').catch(() => {});
          }
        }
        return {
          success: false,
          appliedModifications: [],
          errors: [`Post-commit revision verification failed for '${relPath}'. Transaction rolled back.`],
        };
      }

      const modDetail = stagedModDetails.find((m) => m.path === relPath);
      applied.push({
        path: relPath,
        type: modDetail?.type ?? 'localized_patch',
        bytesWritten: Buffer.byteLength(actualContent, 'utf8'),
        newRevision: actualRevision,
      });
    }

    // Update snapshot after successful transaction
    await this.captureSnapshot();

    return {
      success: true,
      appliedModifications: applied,
      errors: [],
    };
  }
}
