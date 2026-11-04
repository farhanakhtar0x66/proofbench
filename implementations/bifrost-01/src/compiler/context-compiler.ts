import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countTokens as gptCountTokens } from 'gpt-tokenizer';
import type { Parser as TSParser, Language as TSLanguage, Node as TSSyntaxNode } from 'web-tree-sitter';

export type SymbolKind =
  | 'function'
  | 'struct'
  | 'enum'
  | 'trait'
  | 'impl'
  | 'type_alias'
  | 'import'
  | 'test'
  | 'module'
  | 'const'
  | 'macro';

export interface SymbolProvenance {
  filePath: string;
  revision: string; // SHA-256 hash of file content
  startLine: number;
  endLine: number;
}

export interface RustSymbol {
  name: string;
  kind: SymbolKind;
  visibility: 'pub' | 'pub(crate)' | 'private';
  provenance: SymbolProvenance;
  signature: string;
  content: string;
  dependencies: string[]; // referenced identifiers/types
  isTest: boolean;
  docComment?: string;
}

export interface OmissionLedgerEntry {
  filePath: string;
  symbolName: string;
  kind: string;
  reason: 'budget_exceeded' | 'irrelevant' | 'redundant' | 'test_only' | 'file_exceeded';
  estimatedTokens: number;
  isMandatory: boolean;
}

export interface SelectedContextItem {
  symbol: RustSymbol;
  tokenCount: number;
  tokenCountMode: 'exact' | 'estimated';
  isMandatory: boolean;
  priorityScore: number;
}

export interface ContextCompilationResult {
  status: 'ok' | 'context_overflow' | 'mandatory_context_missing';
  formattedContext: string;
  totalTokens: number;
  tokenCountMode: 'exact' | 'estimated';
  selectedItems: SelectedContextItem[];
  omissionLedger: OmissionLedgerEntry[];
  missingMandatorySymbols: string[];
  workspaceRevisions: Record<string, string>;
  reason?: string;
}

export interface ContextCompilerOptions {
  maxTokenBudget?: number; // default: 3500 tokens
  allowBudgetExpansion?: boolean;
  maxExpandedBudget?: number; // default: 5000 tokens
  includeTests?: boolean;
  tokenizerMode?: 'exact' | 'estimated';
}

/**
 * Deterministic Token Counter distinguishing exact BPE tokenization from estimates.
 */
export class TokenizerService {
  static count(text: string, forceMode?: 'exact' | 'estimated'): { count: number; mode: 'exact' | 'estimated' } {
    if (!text) return { count: 0, mode: 'exact' };
    if (forceMode === 'estimated' || !gptCountTokens) {
      // Conservative BPE character ratio estimate for Rust code (~3.8 chars/token)
      return { count: Math.ceil(text.length / 3.8), mode: 'estimated' };
    }
    try {
      return { count: gptCountTokens(text), mode: 'exact' };
    } catch {
      return { count: Math.ceil(text.length / 3.8), mode: 'estimated' };
    }
  }
}

/**
 * Web-Tree-Sitter Rust AST Parser with resilient fallback
 */
class RustTreeSitterEngine {
  private static parserPromise: Promise<TSParser | null> | null = null;
  private static parserInstance: TSParser | null = null;
  private static languageInstance: TSLanguage | null = null;
  private static initFailed = false;

  static async getParser(): Promise<TSParser | null> {
    if (this.initFailed) return null;
    if (this.parserInstance) return this.parserInstance;

    if (!this.parserPromise) {
      this.parserPromise = (async () => {
        try {
          const wts = await import('web-tree-sitter');
          const ParserClass = wts.Parser;
          const LanguageClass = wts.Language;

          await ParserClass.init();
          const parser = new ParserClass();

          // Locate tree-sitter-rust.wasm in node_modules
          let wasmPath = '';
          try {
            const thisDir = path.dirname(fileURLToPath(import.meta.url));
            const candidatePaths = [
              path.resolve(thisDir, '../../../../node_modules/tree-sitter-rust/tree-sitter-rust.wasm'),
              path.resolve(process.cwd(), 'node_modules/tree-sitter-rust/tree-sitter-rust.wasm'),
              path.resolve(process.cwd(), '../node_modules/tree-sitter-rust/tree-sitter-rust.wasm'),
            ];
            for (const cand of candidatePaths) {
              try {
                await fs.access(cand);
                wasmPath = cand;
                break;
              } catch {
                // Try next candidate
              }
            }
          } catch {
            // ignore
          }

          if (!wasmPath) {
            this.initFailed = true;
            return null;
          }

          const RustLanguage = await LanguageClass.load(wasmPath);
          parser.setLanguage(RustLanguage);
          this.languageInstance = RustLanguage;
          this.parserInstance = parser;
          return parser;
        } catch {
          // Tree-sitter failed to init, fall back to regex scanner
          this.initFailed = true;
          return null;
        }
      })();
    }

    return this.parserPromise;
  }
}

/**
 * Deterministic Context Compiler (Phase A)
 */
export class ContextCompiler {
  private maxTokenBudget: number;
  private allowBudgetExpansion: boolean;
  private maxExpandedBudget: number;
  private includeTests: boolean;
  private tokenizerMode?: 'exact' | 'estimated';

  constructor(options: ContextCompilerOptions = {}) {
    this.maxTokenBudget = options.maxTokenBudget ?? 3500;
    this.allowBudgetExpansion = options.allowBudgetExpansion ?? true;
    this.maxExpandedBudget = options.maxExpandedBudget ?? 5000;
    this.includeTests = options.includeTests ?? false;
    this.tokenizerMode = options.tokenizerMode;
  }

  /**
   * Computes SHA-256 revision hash for file content.
   */
  static computeRevision(content: string): string {
    return `sha256:${crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)}`;
  }

  /**
   * Parses Rust code using Tree-sitter AST, extracting top-level symbols, imports, attributes, and dependencies.
   */
  async parseRustSymbols(code: string, filePath: string, revision: string): Promise<RustSymbol[]> {
    const parser = await RustTreeSitterEngine.getParser();
    if (parser) {
      try {
        return this.parseWithTreeSitter(parser, code, filePath, revision);
      } catch {
        // fallback
      }
    }
    return this.parseWithLexicalScanner(code, filePath, revision);
  }

  private parseWithTreeSitter(parser: TSParser, code: string, filePath: string, revision: string): RustSymbol[] {
    const tree = parser.parse(code);
    if (!tree) return [];
    const symbols: RustSymbol[] = [];
    const root = tree.rootNode;
    const lines = code.split('\n');

    // Group outer attributes and doc comments with the succeeding symbol
    let pendingAttributes: TSSyntaxNode[] = [];

    for (let i = 0; i < root.childCount; i++) {
      const child = root.child(i);
      if (!child) continue;
      const nodeType = child.type;

      if (nodeType === 'attribute_item' || nodeType === 'line_comment' || nodeType === 'block_comment') {
        pendingAttributes.push(child);
        continue;
      }

      let kind: SymbolKind | null = null;
      let name = '';
      let visibility: 'pub' | 'pub(crate)' | 'private' = 'private';
      let isTest = false;

      // Check pending attributes for #[test] or #[cfg(test)]
      const hasTestAttr = pendingAttributes.some((a) =>
        a.text.includes('#[test]') || a.text.includes('#[cfg(test)]')
      );

      // Check visibility
      for (let j = 0; j < child.childCount; j++) {
        const sub = child.child(j);
        if (sub && sub.type === 'visibility_modifier') {
          if (sub.text.includes('crate')) {
            visibility = 'pub(crate)';
          } else {
            visibility = 'pub';
          }
          break;
        }
      }

      switch (nodeType) {
        case 'use_declaration':
          kind = 'import';
          name = child.text.replace(/^use\s+/, '').replace(/;$/, '').trim();
          break;
        case 'function_item': {
          kind = hasTestAttr ? 'test' : 'function';
          isTest = hasTestAttr;
          const idNode = child.children.find((c: TSSyntaxNode) => c.type === 'identifier');
          name = idNode ? idNode.text : 'anonymous_fn';
          break;
        }
        case 'struct_item': {
          kind = 'struct';
          const typeIdNode = child.children.find((c: TSSyntaxNode) => c.type === 'type_identifier');
          name = typeIdNode ? typeIdNode.text : 'anonymous_struct';
          break;
        }
        case 'enum_item': {
          kind = 'enum';
          const typeIdNode = child.children.find((c: TSSyntaxNode) => c.type === 'type_identifier');
          name = typeIdNode ? typeIdNode.text : 'anonymous_enum';
          break;
        }
        case 'trait_item': {
          kind = 'trait';
          const typeIdNode = child.children.find((c: TSSyntaxNode) => c.type === 'type_identifier');
          name = typeIdNode ? typeIdNode.text : 'anonymous_trait';
          break;
        }
        case 'impl_item': {
          kind = 'impl';
          const typeIdNodes = child.children.filter((c: TSSyntaxNode) => c.type === 'type_identifier');
          name = typeIdNodes.length > 0 ? `impl_${typeIdNodes.map((n: TSSyntaxNode) => n.text).join('_for_')}` : 'impl_block';
          break;
        }
        case 'type_item': {
          kind = 'type_alias';
          const typeIdNode = child.children.find((c: TSSyntaxNode) => c.type === 'type_identifier');
          name = typeIdNode ? typeIdNode.text : 'anonymous_type';
          break;
        }
        case 'mod_item': {
          kind = hasTestAttr ? 'test' : 'module';
          isTest = hasTestAttr;
          const idNode = child.children.find((c: TSSyntaxNode) => c.type === 'identifier');
          name = idNode ? idNode.text : 'anonymous_mod';
          break;
        }
        case 'const_item':
        case 'static_item': {
          kind = 'const';
          const idNode = child.children.find((c: TSSyntaxNode) => c.type === 'identifier');
          name = idNode ? idNode.text : 'anonymous_const';
          break;
        }
        case 'macro_definition': {
          kind = 'macro';
          const idNode = child.children.find((c: TSSyntaxNode) => c.type === 'identifier');
          name = idNode ? idNode.text : 'macro';
          break;
        }
      }

      if (kind) {
        // Collect line span including pending attributes
        const startLine = pendingAttributes.length > 0
          ? pendingAttributes[0].startPosition.row + 1
          : child.startPosition.row + 1;
        const endLine = child.endPosition.row + 1;

        const contentLines = lines.slice(startLine - 1, endLine);
        const content = contentLines.join('\n');
        const signature = child.text.split('{')[0].trim();

        // Extract referenced identifiers/types as dependencies
        const dependencies = this.extractDependencies(child);

        symbols.push({
          name,
          kind,
          visibility,
          provenance: {
            filePath,
            revision,
            startLine,
            endLine,
          },
          signature,
          content,
          dependencies,
          isTest,
        });

        pendingAttributes = [];
      }
    }

    return symbols;
  }

  /**
   * Collects referenced identifiers and type identifiers inside an AST subtree.
   */
  private extractDependencies(node: TSSyntaxNode): string[] {
    const deps = new Set<string>();
    const stack = [node];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;

      if (current.type === 'type_identifier' || current.type === 'identifier') {
        const txt = current.text;
        if (txt && txt.length > 1 && !/^(Self|self|true|false|Some|None|Ok|Err|usize|u8|u16|u32|u64|u128|i8|i16|i32|i64|i128|f32|f64|bool|str|String|Vec)$/.test(txt)) {
          deps.add(txt);
        }
      }

      for (let i = 0; i < current.childCount; i++) {
        const ch = current.child(i);
        if (ch) stack.push(ch);
      }
    }

    return Array.from(deps);
  }

  /**
   * Resilient fallback lexical scanner if Tree-sitter is unavailable.
   */
  private parseWithLexicalScanner(code: string, filePath: string, revision: string): RustSymbol[] {
    const lines = code.split('\n');
    const symbols: RustSymbol[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('//') || line.startsWith('/*')) continue;

      let kind: SymbolKind | null = null;
      let name = '';
      let visibility: 'pub' | 'pub(crate)' | 'private' = 'private';
      let isTest = false;

      if (line.startsWith('pub(crate) ')) {
        visibility = 'pub(crate)';
      } else if (line.startsWith('pub ')) {
        visibility = 'pub';
      }

      if (line.startsWith('use ') || line.startsWith('pub use ')) {
        kind = 'import';
        name = line.replace(/^(?:pub\s+)?use\s+/, '').replace(/;$/, '').trim();
      } else if (/^(?:pub(?:\(crate\))?\s+)?fn\s+/.test(line)) {
        kind = 'function';
        const m = line.match(/(?:fn\s+)([a-zA-Z0-9_]+)/);
        name = m ? m[1] : 'fn';
      } else if (/^(?:pub(?:\(crate\))?\s+)?struct\s+/.test(line)) {
        kind = 'struct';
        const m = line.match(/(?:struct\s+)([a-zA-Z0-9_]+)/);
        name = m ? m[1] : 'struct';
      } else if (/^(?:pub(?:\(crate\))?\s+)?enum\s+/.test(line)) {
        kind = 'enum';
        const m = line.match(/(?:enum\s+)([a-zA-Z0-9_]+)/);
        name = m ? m[1] : 'enum';
      } else if (/^(?:pub(?:\(crate\))?\s+)?trait\s+/.test(line)) {
        kind = 'trait';
        const m = line.match(/(?:trait\s+)([a-zA-Z0-9_]+)/);
        name = m ? m[1] : 'trait';
      } else if (/^impl(?:<[^>]+>)?\s+/.test(line)) {
        kind = 'impl';
        const m = line.match(/impl(?:<[^>]+>)?\s+([a-zA-Z0-9_]+)/);
        name = m ? `impl_${m[1]}` : 'impl_block';
      } else if (/^(?:pub(?:\(crate\))?\s+)?type\s+/.test(line)) {
        kind = 'type_alias';
        const m = line.match(/(?:type\s+)([a-zA-Z0-9_]+)/);
        name = m ? m[1] : 'type_alias';
      }

      if (kind) {
        // Collect leading attributes
        let leadingStart = i;
        while (leadingStart > 0) {
          const prev = lines[leadingStart - 1].trim();
          if (prev.startsWith('#[') || prev.startsWith('///')) {
            if (prev.includes('#[test]') || prev.includes('#[cfg(test)]')) {
              isTest = true;
            }
            leadingStart--;
          } else {
            break;
          }
        }

        let braceCount = 0;
        let started = false;
        let endLine = i;
        const bodyLines: string[] = lines.slice(leadingStart, i);

        for (let j = i; j < lines.length; j++) {
          const l = lines[j];
          bodyLines.push(l);
          for (const char of l) {
            if (char === '{') {
              braceCount++;
              started = true;
            } else if (char === '}') {
              braceCount--;
            }
          }
          if (started && braceCount === 0) {
            endLine = j;
            break;
          }
          if (!started && l.includes(';')) {
            endLine = j;
            break;
          }
        }

        const content = bodyLines.join('\n');
        // Simple regex-based dependency extraction
        const deps = Array.from(new Set(content.match(/\b[A-Z][a-zA-Z0-9_]+\b/g) || []));

        symbols.push({
          name,
          kind: isTest ? 'test' : kind,
          visibility,
          provenance: {
            filePath,
            revision,
            startLine: leadingStart + 1,
            endLine: endLine + 1,
          },
          signature: line.split('{')[0].trim(),
          content,
          dependencies: deps,
          isTest,
        });

        i = endLine;
      }
    }

    return symbols;
  }

  /**
   * Recursively traverses workspace directories to find all Rust source and test files.
   */
  async findRustFiles(workspacePath: string): Promise<string[]> {
    const results: string[] = [];
    const searchDirs = ['src', 'tests'];

    for (const sub of searchDirs) {
      const fullDir = path.join(workspacePath, sub);
      try {
        await fs.access(fullDir);
      } catch {
        continue;
      }

      const walk = async (currentDir: string, relBase: string) => {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          const relPath = path.join(relBase, entry.name);

          if (entry.isDirectory()) {
            if (entry.name !== 'target' && entry.name !== '.git') {
              await walk(fullPath, relPath);
            }
          } else if (entry.isFile() && entry.name.endsWith('.rs')) {
            results.push(relPath);
          }
        }
      };

      await walk(fullDir, sub);
    }

    return results.sort();
  }

  /**
   * Compiles bounded, deterministic Rust context with mandatory dependency tracking and omission ledger.
   */
  async compileContext(
    workspacePath: string,
    diagnostics = '',
    taskPrompt = ''
  ): Promise<ContextCompilationResult> {
    const files = await this.findRustFiles(workspacePath);
    const workspaceRevisions: Record<string, string> = {};
    const allSymbols: RustSymbol[] = [];
    const omissionLedger: OmissionLedgerEntry[] = [];

    // 1. Read files and parse symbols
    for (const relPath of files) {
      const absPath = path.join(workspacePath, relPath);
      let content = '';
      try {
        content = await fs.readFile(absPath, 'utf8');
      } catch {
        omissionLedger.push({
          filePath: relPath,
          symbolName: 'entire_file',
          kind: 'file',
          reason: 'irrelevant',
          estimatedTokens: 0,
          isMandatory: false,
        });
        continue;
      }

      const revision = ContextCompiler.computeRevision(content);
      workspaceRevisions[relPath] = revision;

      const fileSymbols = await this.parseRustSymbols(content, relPath, revision);
      allSymbols.push(...fileSymbols);
    }

    // 2. Score relevance and identify mandatory symbols
    const lowerPrompt = taskPrompt.toLowerCase();
    const lowerDiagnostics = diagnostics.toLowerCase();

    const scoredSymbols = allSymbols.map((sym) => {
      let score = 0;
      let isMandatory = false;
      const lowerName = sym.name.toLowerCase();
      const lowerPath = sym.provenance.filePath.toLowerCase();
      const baseName = path.basename(sym.provenance.filePath, '.rs').toLowerCase();

      // Signal A: Diagnostics match (compiler errors, failing tests, panic locations)
      const pathMentionedInDiagnostics =
        lowerDiagnostics.includes(lowerPath) ||
        lowerDiagnostics.includes(baseName);
      if (pathMentionedInDiagnostics) {
        score += 60;
      }

      if (lowerDiagnostics.includes(lowerName) && sym.name !== 'test') {
        score += 100;
        isMandatory = true;
      }

      // Signal B: Prompt match
      const pathMentionedInPrompt =
        lowerPrompt.includes(lowerPath) ||
        lowerPrompt.includes(baseName);
      if (pathMentionedInPrompt) {
        score += 50;
      }

      // If symbol is an impl block, check underlying type
      let implTypeName = '';
      if (sym.kind === 'impl') {
        implTypeName = sym.name.replace(/^impl_/, '').split('_for_')[0].toLowerCase();
      }

      if (
        (lowerName.length > 2 && lowerPrompt.includes(lowerName)) ||
        (implTypeName.length > 2 && lowerPrompt.includes(implTypeName))
      ) {
        score += 80;
        isMandatory = true;
      }

      // Signal C: Structs, enums, traits, or impls in directly targeted files
      if (pathMentionedInPrompt || pathMentionedInDiagnostics) {
        if (sym.kind === 'struct' || sym.kind === 'enum' || sym.kind === 'trait' || sym.kind === 'impl') {
          score += 40;
        }
        if (sym.kind === 'function') {
          score += 30;
        }
        if (sym.kind === 'import') {
          score += 20;
        }
      }

      // Signal D: Tests (only if includeTests or mentioned in failures)
      if (sym.isTest) {
        if (this.includeTests && (lowerPrompt.includes(lowerName) || lowerDiagnostics.includes(lowerName))) {
          score += 40;
        } else {
          score -= 60;
        }
      }

      // Signal E: Visibility (public APIs get priority)
      if (sym.visibility === 'pub') {
        score += 10;
      }

      // Penalize symbols in files with zero connection to prompt or diagnostics
      if (!pathMentionedInPrompt && !pathMentionedInDiagnostics && !lowerPrompt.includes(lowerName) && !lowerDiagnostics.includes(lowerName)) {
        score -= 20;
      }

      return {
        symbol: sym,
        priorityScore: score,
        isMandatory,
      };
    });

    // 3. Mark dependencies of mandatory symbols as also mandatory
    const mandatorySymbolNames = new Set(
      scoredSymbols.filter((s) => s.isMandatory).map((s) => s.symbol.name)
    );

    for (const item of scoredSymbols) {
      if (item.isMandatory) {
        for (const dep of item.symbol.dependencies) {
          const depItem = scoredSymbols.find((s) => s.symbol.name === dep);
          if (depItem) {
            depItem.isMandatory = true;
            depItem.priorityScore += 40;
            mandatorySymbolNames.add(dep);
          }
        }
      }
    }

    // 4. Sort symbols by priority score descending
    scoredSymbols.sort((a, b) => b.priorityScore - a.priorityScore);

    // 5. Select context according to bounded token budget
    let currentTokens = 0;
    const selectedItems: SelectedContextItem[] = [];
    const missingMandatorySymbols: string[] = [];

    let effectiveBudget = this.maxTokenBudget;

    for (const item of scoredSymbols) {
      // Exclude irrelevant tests if not requested
      if (item.symbol.isTest && !this.includeTests && !item.isMandatory) {
        omissionLedger.push({
          filePath: item.symbol.provenance.filePath,
          symbolName: item.symbol.name,
          kind: item.symbol.kind,
          reason: 'test_only',
          estimatedTokens: TokenizerService.count(item.symbol.content, 'estimated').count,
          isMandatory: item.isMandatory,
        });
        continue;
      }

      // Exclude very low priority symbols
      if (item.priorityScore <= 0 && !item.isMandatory) {
        omissionLedger.push({
          filePath: item.symbol.provenance.filePath,
          symbolName: item.symbol.name,
          kind: item.symbol.kind,
          reason: 'irrelevant',
          estimatedTokens: TokenizerService.count(item.symbol.content, 'estimated').count,
          isMandatory: item.isMandatory,
        });
        continue;
      }

      const tokenResult = TokenizerService.count(item.symbol.content, this.tokenizerMode);
      const symbolTokens = tokenResult.count;

      if (currentTokens + symbolTokens <= effectiveBudget) {
        selectedItems.push({
          symbol: item.symbol,
          tokenCount: symbolTokens,
          tokenCountMode: tokenResult.mode,
          isMandatory: item.isMandatory,
          priorityScore: item.priorityScore,
        });
        currentTokens += symbolTokens;
      } else {
        // Budget exceeded
        if (item.isMandatory && this.allowBudgetExpansion && currentTokens + symbolTokens <= this.maxExpandedBudget) {
          // Safely expand budget for mandatory dependency
          effectiveBudget = currentTokens + symbolTokens;
          selectedItems.push({
            symbol: item.symbol,
            tokenCount: symbolTokens,
            tokenCountMode: tokenResult.mode,
            isMandatory: true,
            priorityScore: item.priorityScore,
          });
          currentTokens += symbolTokens;
        } else {
          if (item.isMandatory) {
            missingMandatorySymbols.push(item.symbol.name);
          }
          omissionLedger.push({
            filePath: item.symbol.provenance.filePath,
            symbolName: item.symbol.name,
            kind: item.symbol.kind,
            reason: 'budget_exceeded',
            estimatedTokens: symbolTokens,
            isMandatory: item.isMandatory,
          });
        }
      }
    }

    // Check status
    let status: ContextCompilationResult['status'] = 'ok';
    let reason: string | undefined;

    if (missingMandatorySymbols.length > 0) {
      status = 'mandatory_context_missing';
      reason = `Mandatory symbols could not fit within token budget (${effectiveBudget}): ${missingMandatorySymbols.join(', ')}`;
    } else if (selectedItems.length === 0 && files.length > 0) {
      status = 'context_overflow';
      reason = 'Context exceeded allowable token limits and no symbols could be selected.';
    }

    // Format context with provenance and omission ledger
    let formatted = '## Selected Code Context (Context Compiler v2)\n\n';

    // Group selected items by file
    const byFile = new Map<string, SelectedContextItem[]>();
    for (const item of selectedItems) {
      const p = item.symbol.provenance.filePath;
      if (!byFile.has(p)) byFile.set(p, []);
      byFile.get(p)!.push(item);
    }

    for (const [filePath, items] of byFile.entries()) {
      const revision = workspaceRevisions[filePath] ?? 'unknown';
      formatted += `### File: \`${filePath}\` (rev: \`${revision}\`)\n\`\`\`rust\n`;
      for (const it of items) {
        const prov = it.symbol.provenance;
        const mandatoryTag = it.isMandatory ? ' [MANDATORY]' : '';
        formatted += `// Symbol: ${it.symbol.name} (${it.symbol.kind}, lines ${prov.startLine}-${prov.endLine})${mandatoryTag}\n`;
        formatted += `${it.symbol.content}\n\n`;
      }
      formatted += '```\n\n';
    }

    if (omissionLedger.length > 0) {
      formatted += `[Context Omission Ledger: ${omissionLedger.length} unreferenced symbol(s) omitted across ${new Set(omissionLedger.map((o) => o.filePath)).size} file(s) under budget bounding]\n\n`;
    }

    const overallMode = selectedItems.every((i) => i.tokenCountMode === 'exact') ? 'exact' : 'estimated';

    return {
      status,
      formattedContext: formatted,
      totalTokens: currentTokens,
      tokenCountMode: overallMode,
      selectedItems,
      omissionLedger,
      missingMandatorySymbols,
      workspaceRevisions,
      reason,
    };
  }
}
