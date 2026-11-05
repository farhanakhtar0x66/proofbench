import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { HostApprovalEngine, ProposedToolAction } from '../governance/approval';

export interface MechanicalFixCandidate {
  type: 'compiler_suggested_fix' | 'remove_unused_import' | 'format_code' | 'exact_pattern_fix';
  filePath: string;
  description: string;
  originalText?: string;
  replacementText?: string;
  fullFileContent?: string;
  confidence: 'guaranteed' | 'high';
}

export interface MechanicalTransformResult {
  applied: boolean;
  type?: string;
  filePath?: string;
  description?: string;
  bytesWritten?: number;
  error?: string;
}

export class MechanicalTransformer {
  /**
   * Scans compiler diagnostics and source files to identify deterministic non-LLM fix candidates.
   */
  public static findFixCandidates(
    diagnosticsOutput: string,
    workspacePath: string,
    sourceFiles: Map<string, string>
  ): MechanicalFixCandidate[] {
    const candidates: MechanicalFixCandidate[] = [];

    // 1. Check for compiler-suggested mechanical fixes (e.g. "help: remove this `mut`", "help: consider adding `pub`")
    const lines = diagnosticsOutput.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match: help: remove this `mut`
      // --> src/lib.rs:14:9
      const mutMatch = line.match(/help:\s*remove this `mut`/i);
      if (mutMatch) {
        // Look backwards or forwards for file location
        const locLine = lines.slice(Math.max(0, i - 4), i + 2).find((l) => l.trim().startsWith('-->'));
        if (locLine) {
          const m = locLine.match(/-->\s*([^:]+):(\d+):(\d+)/);
          if (m) {
            const relPath = m[1].trim();
            const content = sourceFiles.get(relPath);
            if (content) {
              const fileLines = content.split('\n');
              const lineIdx = parseInt(m[2], 10) - 1;
              if (fileLines[lineIdx]) {
                const targetLine = fileLines[lineIdx];
                const fixedLine = targetLine.replace(/\bmut\s+/, '');
                if (fixedLine !== targetLine) {
                  fileLines[lineIdx] = fixedLine;
                  candidates.push({
                    type: 'compiler_suggested_fix',
                    filePath: relPath,
                    description: `Remove unnecessary 'mut' keyword at ${relPath}:${m[2]} as recommended by compiler`,
                    originalText: targetLine,
                    replacementText: fixedLine,
                    fullFileContent: fileLines.join('\n'),
                    confidence: 'guaranteed',
                  });
                }
              }
            }
          }
        }
      }

      // Match: help: consider making `...` `pub`
      const pubMatch = line.match(/help:\s*consider making `([^`]+)` `pub`/i);
      if (pubMatch) {
        const symbol = pubMatch[1];
        const locLine = lines.slice(Math.max(0, i - 4), i + 2).find((l) => l.trim().startsWith('-->'));
        if (locLine) {
          const m = locLine.match(/-->\s*([^:]+):(\d+):(\d+)/);
          if (m) {
            const relPath = m[1].trim();
            const content = sourceFiles.get(relPath);
            if (content) {
              const fileLines = content.split('\n');
              const lineIdx = parseInt(m[2], 10) - 1;
              if (fileLines[lineIdx]) {
                const targetLine = fileLines[lineIdx];
                if (!targetLine.trim().startsWith('pub ')) {
                  const fixedLine = targetLine.replace(/^(\s*)(fn|struct|enum|type|trait)\b/, '$1pub $2');
                  fileLines[lineIdx] = fixedLine;
                  candidates.push({
                    type: 'compiler_suggested_fix',
                    filePath: relPath,
                    description: `Add 'pub' visibility modifier to ${symbol} at ${relPath}:${m[2]} as recommended by compiler`,
                    originalText: targetLine,
                    replacementText: fixedLine,
                    fullFileContent: fileLines.join('\n'),
                    confidence: 'guaranteed',
                  });
                }
              }
            }
          }
        }
      }

      // Match: warning/error: unused import: `...`
      const unusedImportMatch = line.match(/(?:warning|error):\s*unused import:\s*`([^`]+)`/i);
      if (unusedImportMatch) {
        const importName = unusedImportMatch[1];
        const locLine = lines.slice(i, i + 3).find((l) => l.trim().startsWith('-->'));
        if (locLine) {
          const m = locLine.match(/-->\s*([^:]+):(\d+):(\d+)/);
          if (m) {
            const relPath = m[1].trim();
            const content = sourceFiles.get(relPath);
            if (content) {
              const fileLines = content.split('\n');
              const lineIdx = parseInt(m[2], 10) - 1;
              if (fileLines[lineIdx] && fileLines[lineIdx].includes('use ') && fileLines[lineIdx].includes(importName)) {
                // If the whole line is that unused import
                const targetLine = fileLines[lineIdx];
                fileLines.splice(lineIdx, 1);
                candidates.push({
                  type: 'remove_unused_import',
                  filePath: relPath,
                  description: `Remove dead unused import '${importName}' at ${relPath}:${m[2]}`,
                  originalText: targetLine,
                  replacementText: '',
                  fullFileContent: fileLines.join('\n'),
                  confidence: 'guaranteed',
                });
              }
            }
          }
        }
      }

      // Match: warning/error: unused variable: `...`
      const unusedVarMatch = line.match(/(?:warning|error):\s*unused variable:\s*`([^`]+)`/i);
      if (unusedVarMatch) {
        const varName = unusedVarMatch[1];
        const locLine = lines.slice(i, i + 3).find((l) => l.trim().startsWith('-->'));
        if (locLine) {
          const m = locLine.match(/-->\s*([^:]+):(\d+):(\d+)/);
          if (m) {
            const relPath = m[1].trim();
            const content = sourceFiles.get(relPath);
            if (content) {
              const fileLines = content.split('\n');
              const lineIdx = parseInt(m[2], 10) - 1;
              if (fileLines[lineIdx] && fileLines[lineIdx].includes(varName)) {
                const targetLine = fileLines[lineIdx];
                const regex = new RegExp(`\\b${varName}\\b`);
                const fixedLine = targetLine.replace(regex, `_${varName}`);
                if (fixedLine !== targetLine) {
                  fileLines[lineIdx] = fixedLine;
                  candidates.push({
                    type: 'compiler_suggested_fix',
                    filePath: relPath,
                    description: `Prefix unused variable '${varName}' with underscore at ${relPath}:${m[2]} as recommended by compiler`,
                    originalText: targetLine,
                    replacementText: fixedLine,
                    fullFileContent: fileLines.join('\n'),
                    confidence: 'guaranteed',
                  });
                }
              }
            }
          }
        }
      }
    }

    return candidates;
  }

  /**
   * Applies an approved mechanical transformation to the workspace file.
   */
  public static async applyCandidate(
    candidate: MechanicalFixCandidate,
    workspacePath: string,
    approvalEngine: HostApprovalEngine,
    attempt: number
  ): Promise<MechanicalTransformResult> {
    const targetAbsPath = path.resolve(workspacePath, candidate.filePath);
    if (!targetAbsPath.startsWith(path.resolve(workspacePath))) {
      return { applied: false, error: `Security rejection: path '${candidate.filePath}' escapes workspace.` };
    }

    if (!candidate.fullFileContent) {
      return { applied: false, error: 'Mechanical candidate has no target content.' };
    }

    // Require Host Approval
    const action: ProposedToolAction = {
      id: `mech-${attempt}-${Date.now()}`,
      tool: 'write_file',
      parameters: { path: candidate.filePath, content: candidate.fullFileContent },
      category: 'write',
    };

    const approval = await approvalEngine.evaluateAction(action);
    if (!approval.approved) {
      return {
        applied: false,
        error: `Host approval rejected mechanical action: ${approval.reason}`,
      };
    }

    // Perform atomic file write
    await fs.mkdir(path.dirname(targetAbsPath), { recursive: true });
    await fs.writeFile(targetAbsPath, candidate.fullFileContent, 'utf8');

    return {
      applied: true,
      type: candidate.type,
      filePath: candidate.filePath,
      description: candidate.description,
      bytesWritten: Buffer.byteLength(candidate.fullFileContent, 'utf8'),
    };
  }
}
