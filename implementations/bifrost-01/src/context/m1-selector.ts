import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface SymbolDefinition {
  name: string;
  kind: 'function' | 'struct' | 'enum' | 'trait' | 'impl' | 'module';
  startLine: number;
  endLine: number;
  content: string;
  signature: string;
}

export interface SelectedContextItem {
  filePath: string;
  symbolName: string;
  kind: string;
  content: string;
  tokens: number;
}

export interface M1ContextResult {
  status: 'ok' | 'context_overflow' | 'analysis_incomplete';
  formattedContext: string;
  totalTokens: number;
  selectedItems: SelectedContextItem[];
  omittedItems: Array<{ filePath: string; symbolName?: string; reason: string }>;
  reason?: string;
}

export interface M1SelectorOptions {
  maxTokenBudget?: number; // default 4,000 tokens per NeuroMesh M1 specification
  errorDiagnostics?: string;
}

export class M1ContextSelector {
  private maxTokenBudget: number;

  constructor(options: M1SelectorOptions = {}) {
    this.maxTokenBudget = options.maxTokenBudget ?? 4000;
  }

  estimateTokens(text: string): number {
    if (!text) return 0;
    // Bounded tokenizer estimate: ~3.8 to 4.0 characters per token for code
    return Math.ceil(text.length / 3.8);
  }

  parseRustSymbols(code: string): SymbolDefinition[] {
    const lines = code.split('\n');
    const symbols: SymbolDefinition[] = [];

    // Lightweight deterministic AST scanner for top-level definitions
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('//') || line.startsWith('/*')) continue;

      let kind: SymbolDefinition['kind'] | null = null;
      let name = '';

      if (line.startsWith('pub fn ') || line.startsWith('fn ')) {
        kind = 'function';
        const fnMatch = line.match(/(?:pub\s+)?fn\s+([a-zA-Z0-9_]+)/);
        name = fnMatch ? fnMatch[1] : 'anonymous_fn';
      } else if (line.startsWith('pub struct ') || line.startsWith('struct ')) {
        kind = 'struct';
        const structMatch = line.match(/(?:pub\s+)?struct\s+([a-zA-Z0-9_]+)/);
        name = structMatch ? structMatch[1] : 'anonymous_struct';
      } else if (line.startsWith('pub enum ') || line.startsWith('enum ')) {
        kind = 'enum';
        const enumMatch = line.match(/(?:pub\s+)?enum\s+([a-zA-Z0-9_]+)/);
        name = enumMatch ? enumMatch[1] : 'anonymous_enum';
      } else if (line.startsWith('pub trait ') || line.startsWith('trait ')) {
        kind = 'trait';
        const traitMatch = line.match(/(?:pub\s+)?trait\s+([a-zA-Z0-9_]+)/);
        name = traitMatch ? traitMatch[1] : 'anonymous_trait';
      } else if (line.startsWith('impl ') || line.startsWith('impl<')) {
        kind = 'impl';
        const implMatch = line.match(/impl(?:<[^>]+>)?\s+([a-zA-Z0-9_]+)/);
        name = implMatch ? `impl_${implMatch[1]}` : 'impl_block';
      }

      if (kind) {
        // Collect multi-line body with brace matching
        let braceCount = 0;
        let started = false;
        let endLine = i;
        const bodyLines: string[] = [];

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
        }

        symbols.push({
          name,
          kind,
          startLine: i + 1,
          endLine: endLine + 1,
          signature: line.split('{')[0].trim(),
          content: bodyLines.join('\n'),
        });

        // Skip to end of symbol
        i = endLine;
      }
    }

    return symbols;
  }

  async selectContext(workspacePath: string, diagnostics = ''): Promise<M1ContextResult> {
    const srcDir = path.join(workspacePath, 'src');
    let files: string[] = [];
    try {
      const entries = await fs.readdir(srcDir);
      files = entries.filter((f) => f.endsWith('.rs')).map((f) => path.join('src', f));
    } catch {
      files = [];
    }

    const selectedItems: SelectedContextItem[] = [];
    const omittedItems: M1ContextResult['omittedItems'] = [];
    let currentTokens = 0;

    // Prioritize files mentioned in compiler diagnostics or test output
    const prioritizedFiles = files.sort((a, b) => {
      const aMentioned = diagnostics.includes(a);
      const bMentioned = diagnostics.includes(b);
      if (aMentioned && !bMentioned) return -1;
      if (!aMentioned && bMentioned) return 1;
      return a.localeCompare(b);
    });

    for (const relPath of prioritizedFiles) {
      const absPath = path.join(workspacePath, relPath);
      let content = '';
      try {
        content = await fs.readFile(absPath, 'utf8');
      } catch {
        omittedItems.push({ filePath: relPath, reason: 'Failed to read file' });
        continue;
      }

      const symbols = this.parseRustSymbols(content);

      if (symbols.length === 0) {
        // Include entire file if small enough
        const fileTokens = this.estimateTokens(content);
        if (currentTokens + fileTokens <= this.maxTokenBudget) {
          selectedItems.push({
            filePath: relPath,
            symbolName: 'entire_file',
            kind: 'file',
            content,
            tokens: fileTokens,
          });
          currentTokens += fileTokens;
        } else {
          omittedItems.push({
            filePath: relPath,
            reason: `File exceeded remaining token budget (${fileTokens} tokens required, ${this.maxTokenBudget - currentTokens} remaining)`,
          });
        }
      } else {
        // Include individual symbols
        for (const sym of symbols) {
          const symTokens = this.estimateTokens(sym.content);
          if (currentTokens + symTokens <= this.maxTokenBudget) {
            selectedItems.push({
              filePath: relPath,
              symbolName: sym.name,
              kind: sym.kind,
              content: sym.content,
              tokens: symTokens,
            });
            currentTokens += symTokens;
          } else {
            omittedItems.push({
              filePath: relPath,
              symbolName: sym.name,
              reason: `Symbol ${sym.name} omitted: exceeded token limit (${symTokens} tokens, remaining: ${this.maxTokenBudget - currentTokens})`,
            });
          }
        }
      }
    }

    if (selectedItems.length === 0 && files.length > 0) {
      return {
        status: 'context_overflow',
        formattedContext: '',
        totalTokens: 0,
        selectedItems: [],
        omittedItems,
        reason: 'Mandatory source context exceeded the 4,000 token limit',
      };
    }

    // Build deterministic formatted context
    let formatted = '## Deterministically Selected Code Context (M1)\n\n';
    for (const item of selectedItems) {
      formatted += `### File: \`${item.filePath}\` (Symbol: \`${item.symbolName}\`)\n\`\`\`rust\n${item.content}\n\`\`\`\n\n`;
    }
    if (omittedItems.length > 0) {
      formatted += '### Context Omissions\n';
      for (const o of omittedItems) {
        formatted += `- \`${o.filePath}\`${o.symbolName ? ` (\`${o.symbolName}\`)` : ''}: ${o.reason}\n`;
      }
      formatted += '\n';
    }

    return {
      status: 'ok',
      formattedContext: formatted,
      totalTokens: currentTokens,
      selectedItems,
      omittedItems,
    };
  }
}
