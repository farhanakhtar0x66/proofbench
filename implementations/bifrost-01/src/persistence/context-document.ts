/**
 * ProofBench Adaptive Execution Engine v1 — Universal Project Context (CONTEXT.MD)
 * Manages deterministic generation, parsing, validation, and serialization of CONTEXT.MD.
 *
 * AUTHORITY RULES:
 * - CONTEXT.MD is a project-state snapshot, NOT a privileged instruction file.
 * - Actual filesystem, verified test results, and host policy remain authoritative.
 * - Models may propose state updates, but only the host engine authorizes verified fields.
 * - No secrets, API keys, or raw research code are written to CONTEXT.MD.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import type { TaskSpec } from '../../../../packages/contracts/src/index';
import type {
  ProjectContextData,
  ProjectIdentity,
  OriginalRequirements,
  ProjectArchitecture,
  ActiveTaskState,
  AcceptedDecision,
  VerifiedProgressItem,
  KnownFailureItem,
  NextActionItem,
  EvidenceReference,
  ProjectCheckpoint,
  ExecutionTier,
  EnginePhase,
} from './types';

export class ContextDocumentManager {
  public static readonly FILE_NAME = 'CONTEXT.MD';

  /**
   * Serializes structured ProjectContextData into human-readable Markdown format.
   */
  static serialize(data: ProjectContextData): string {
    const lines: string[] = [];

    // Header
    lines.push('# Project Context');
    lines.push('');

    // 1. Project Identity
    lines.push('## Project Identity');
    lines.push(`- Project name: ${data.identity.projectName}`);
    lines.push(`- Language and stack: ${data.identity.language} (${data.identity.stack})`);
    lines.push(`- Repository root: ${data.identity.repositoryRoot}`);
    lines.push(`- Current source revision: ${data.identity.sourceRevision}`);
    lines.push('');

    // 2. Original Requirements
    lines.push('## Original Requirements');
    lines.push(`- Task identifier: ${data.requirements.taskId}`);
    lines.push(`- Task title: ${data.requirements.taskTitle}`);
    lines.push(`- User's original task: ${data.requirements.taskPrompt}`);
    lines.push('- Acceptance criteria:');
    if (data.requirements.acceptanceCriteria.length === 0) {
      lines.push('  - None declared');
    } else {
      for (const crit of data.requirements.acceptanceCriteria) {
        lines.push(`  - ${crit}`);
      }
    }
    if (data.requirements.userPreferences && Object.keys(data.requirements.userPreferences).length > 0) {
      lines.push('- Applicable user preferences:');
      for (const [k, v] of Object.entries(data.requirements.userPreferences)) {
        lines.push(`  - ${k}: ${v}`);
      }
    }
    lines.push('');

    // 3. Project Architecture
    lines.push('## Project Architecture');
    lines.push('- Relevant modules:');
    if (data.architecture.relevantModules.length === 0) {
      lines.push('  - None discovered');
    } else {
      for (const mod of data.architecture.relevantModules) {
        lines.push(`  - ${mod}`);
      }
    }
    lines.push('- Existing interfaces:');
    if (data.architecture.existingInterfaces.length === 0) {
      lines.push('  - None documented');
    } else {
      for (const iface of data.architecture.existingInterfaces) {
        lines.push(`  - ${iface}`);
      }
    }
    lines.push('- Verified dependencies:');
    if (data.architecture.verifiedDependencies.length === 0) {
      lines.push('  - None');
    } else {
      for (const dep of data.architecture.verifiedDependencies) {
        lines.push(`  - ${dep}`);
      }
    }
    lines.push('');

    // 4. Active Task
    lines.push('## Active Task');
    lines.push(`- Task identifier: ${data.activeTask.taskId}`);
    lines.push(`- Current phase: ${data.activeTask.currentPhase}`);
    lines.push(`- Responsible execution tier: ${data.activeTask.responsibleTier}`);
    lines.push(`- Remaining work: ${data.activeTask.remainingWork}`);
    lines.push('');

    // 5. Accepted Decisions
    lines.push('## Accepted Decisions');
    if (data.acceptedDecisions.length === 0) {
      lines.push('- None recorded');
    } else {
      for (const dec of data.acceptedDecisions) {
        const refStr = dec.evidenceRef ? ` [ref: ${dec.evidenceRef}]` : '';
        lines.push(`- [${dec.verifiedAt}] ${dec.decision} — ${dec.rationale}${refStr}`);
      }
    }
    lines.push('');

    // 6. Verified Progress
    lines.push('## Verified Progress');
    if (data.verifiedProgress.length === 0) {
      lines.push('- None yet');
    } else {
      for (const prog of data.verifiedProgress) {
        lines.push(`- [${prog.type.toUpperCase()}] ${prog.description} (rev: ${prog.revision}, at: ${prog.timestamp})`);
      }
    }
    lines.push('');

    // 7. Known Failures
    lines.push('## Known Failures');
    if (data.knownFailures.length === 0) {
      lines.push('- None recorded');
    } else {
      for (const fail of data.knownFailures) {
        lines.push(`- [Attempt ${fail.attemptNumber} | ${fail.errorType}] ${fail.details.replace(/\n/g, ' ')}`);
      }
    }
    lines.push('');

    // 8. Next Action
    lines.push('## Next Action');
    lines.push(`- Concrete bounded next step: ${data.nextAction.step}`);
    lines.push(`- Required evidence: ${data.nextAction.requiredEvidence}`);
    lines.push(`- Suggested execution tier: ${data.nextAction.suggestedTier}`);
    lines.push('');

    // 9. Evidence References
    lines.push('## Evidence References');
    if (data.evidenceReferences.length === 0) {
      lines.push('- None');
    } else {
      for (const ref of data.evidenceReferences) {
        lines.push(`- [${ref.type}] ${ref.pathOrId}: ${ref.summary}`);
      }
    }
    lines.push('');

    // 10. Checkpoint
    lines.push('## Checkpoint');
    lines.push(`- State revision: ${data.checkpoint.stateRevision}`);
    lines.push(`- Source revision: ${data.checkpoint.sourceRevision}`);
    lines.push(`- Last verified transition: ${data.checkpoint.lastVerifiedTransition}`);
    lines.push(`- Checkpoint timestamp: ${data.checkpoint.timestamp}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Parses Markdown content into ProjectContextData with resilient fallbacks.
   */
  static parse(markdown: string): ProjectContextData {
    const getSection = (title: string): string => {
      const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`##\\s+${escaped}[\\r\\n]+([\\s\\S]*?)(?=(?:##\\s+|$))`, 'i');
      const match = markdown.match(regex);
      return match ? match[1].trim() : '';
    };

    const extractBullets = (sectionText: string): string[] => {
      return sectionText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('- '))
        .map((l) => l.slice(2).trim())
        .filter((l) => l.length > 0 && l !== 'None' && l !== 'None recorded' && l !== 'None yet' && l !== 'None discovered');
    };

    const extractKeyValue = (sectionText: string, keyPrefix: string, fallback = ''): string => {
      const regex = new RegExp(`-\\s*${keyPrefix}\\s*:\\s*([^\\r\\n]+)`, 'i');
      const match = sectionText.match(regex);
      return match ? match[1].trim() : fallback;
    };

    // 1. Identity
    const idSec = getSection('Project Identity');
    const identity: ProjectIdentity = {
      projectName: extractKeyValue(idSec, 'Project name', 'unknown-project'),
      language: extractKeyValue(idSec, 'Language and stack', 'rust').split('(')[0].trim(),
      stack: extractKeyValue(idSec, 'Language and stack', 'cargo').includes('(')
        ? (extractKeyValue(idSec, 'Language and stack').match(/\((.*?)\)/)?.[1] ?? 'cargo')
        : 'cargo',
      repositoryRoot: extractKeyValue(idSec, 'Repository root', '.'),
      sourceRevision: extractKeyValue(idSec, 'Current source revision', 'sha256:unknown'),
    };

    // 2. Requirements
    const reqSec = getSection('Original Requirements');
    const criteria: string[] = [];
    let inCriteria = false;
    for (const rawLine of reqSec.split('\n')) {
      if (rawLine.includes('Acceptance criteria:')) {
        inCriteria = true;
        continue;
      }
      if (inCriteria) {
        const trimmed = rawLine.trim();
        if (trimmed.startsWith('- ') && (rawLine.startsWith(' ') || rawLine.startsWith('\t'))) {
          const item = trimmed.slice(2).trim();
          if (item !== 'None declared') {
            criteria.push(item);
          }
        } else if (trimmed.startsWith('- ')) {
          inCriteria = false;
        }
      }
    }

    const requirements: OriginalRequirements = {
      taskId: extractKeyValue(reqSec, 'Task identifier', 'unknown-task'),
      taskTitle: extractKeyValue(reqSec, 'Task title', 'Untitled Task'),
      taskPrompt: extractKeyValue(reqSec, "User's original task", ''),
      acceptanceCriteria: criteria.length > 0 ? criteria : ['cargo test exits with code 0'],
    };

    // 3. Architecture
    const archSec = getSection('Project Architecture');
    const archLines = archSec.split('\n').map((l) => l.trim());
    const relevantModules: string[] = [];
    const existingInterfaces: string[] = [];
    const verifiedDependencies: string[] = [];

    let currentArchSub = '';
    for (const line of archLines) {
      if (line.includes('Relevant modules:')) currentArchSub = 'modules';
      else if (line.includes('Existing interfaces:')) currentArchSub = 'interfaces';
      else if (line.includes('Verified dependencies:')) currentArchSub = 'dependencies';
      else if (line.startsWith('- ') || line.startsWith('  - ')) {
        const item = line.replace(/^[-\s]+/, '').trim();
        if (item && !item.startsWith('None')) {
          if (currentArchSub === 'modules') relevantModules.push(item);
          else if (currentArchSub === 'interfaces') existingInterfaces.push(item);
          else if (currentArchSub === 'dependencies') verifiedDependencies.push(item);
        }
      }
    }

    const architecture: ProjectArchitecture = {
      relevantModules,
      existingInterfaces,
      verifiedDependencies,
    };

    // 4. Active Task
    const actSec = getSection('Active Task');
    const activeTask: ActiveTaskState = {
      taskId: extractKeyValue(actSec, 'Task identifier', requirements.taskId),
      currentPhase: (extractKeyValue(actSec, 'Current phase', 'ADMISSION') as EnginePhase),
      responsibleTier: (extractKeyValue(actSec, 'Responsible execution tier', 'NON_LLM') as ExecutionTier),
      remainingWork: extractKeyValue(actSec, 'Remaining work', 'Execute task specification'),
    };

    // 5. Accepted Decisions
    const decSec = getSection('Accepted Decisions');
    const acceptedDecisions: AcceptedDecision[] = [];
    for (const bullet of extractBullets(decSec)) {
      const match = bullet.match(/\[(.*?)\]\s*(.*?)\s*—\s*(.*)/);
      if (match) {
        acceptedDecisions.push({
          id: `dec-${acceptedDecisions.length + 1}`,
          verifiedAt: match[1],
          decision: match[2],
          rationale: match[3],
        });
      } else {
        acceptedDecisions.push({
          id: `dec-${acceptedDecisions.length + 1}`,
          verifiedAt: new Date().toISOString(),
          decision: bullet,
          rationale: 'Accepted without explicit rationale',
        });
      }
    }

    // 6. Verified Progress
    const progSec = getSection('Verified Progress');
    const verifiedProgress: VerifiedProgressItem[] = [];
    for (const bullet of extractBullets(progSec)) {
      const match = bullet.match(/\[(.*?)\]\s*(.*?)\s*\(rev:\s*([^,]+),\s*at:\s*(.*?)\)/i);
      if (match) {
        verifiedProgress.push({
          id: `prog-${verifiedProgress.length + 1}`,
          type: (match[1].toLowerCase() as 'edit' | 'check' | 'test'),
          description: match[2],
          revision: match[3],
          timestamp: match[4],
        });
      } else {
        verifiedProgress.push({
          id: `prog-${verifiedProgress.length + 1}`,
          type: 'check',
          description: bullet,
          revision: identity.sourceRevision,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 7. Known Failures
    const failSec = getSection('Known Failures');
    const knownFailures: KnownFailureItem[] = [];
    for (const bullet of extractBullets(failSec)) {
      const match = bullet.match(/\[Attempt\s*(\d+)\s*\|\s*(.*?)\]\s*(.*)/i);
      if (match) {
        knownFailures.push({
          id: `fail-${knownFailures.length + 1}`,
          attemptNumber: parseInt(match[1], 10),
          errorType: (match[2] as KnownFailureItem['errorType']),
          details: match[3],
        });
      } else {
        knownFailures.push({
          id: `fail-${knownFailures.length + 1}`,
          attemptNumber: 1,
          errorType: 'compiler_diagnostic',
          details: bullet,
        });
      }
    }

    // 8. Next Action
    const nextSec = getSection('Next Action');
    const nextAction: NextActionItem = {
      step: extractKeyValue(nextSec, 'Concrete bounded next step', 'Perform repository analysis'),
      requiredEvidence: extractKeyValue(nextSec, 'Required evidence', 'Clean compilation & passing acceptance tests'),
      suggestedTier: (extractKeyValue(nextSec, 'Suggested execution tier', 'NON_LLM') as ExecutionTier),
    };

    // 9. Evidence References
    const refSec = getSection('Evidence References');
    const evidenceReferences: EvidenceReference[] = [];
    for (const bullet of extractBullets(refSec)) {
      const match = bullet.match(/\[(.*?)\]\s*([^:]+):\s*(.*)/);
      if (match) {
        evidenceReferences.push({
          id: `ev-${evidenceReferences.length + 1}`,
          type: (match[1] as EvidenceReference['type']),
          pathOrId: match[2],
          summary: match[3],
        });
      }
    }

    // 10. Checkpoint
    const cpSec = getSection('Checkpoint');
    const checkpoint: ProjectCheckpoint = {
      stateRevision: extractKeyValue(cpSec, 'State revision', 'rev-0'),
      sourceRevision: extractKeyValue(cpSec, 'Source revision', identity.sourceRevision),
      lastVerifiedTransition: extractKeyValue(cpSec, 'Last verified transition', 'NONE'),
      timestamp: extractKeyValue(cpSec, 'Checkpoint timestamp', new Date().toISOString()),
    };

    return {
      identity,
      requirements,
      architecture,
      activeTask,
      acceptedDecisions,
      verifiedProgress,
      knownFailures,
      nextAction,
      evidenceReferences,
      checkpoint,
    };
  }

  /**
   * Initializes ProjectContextData from observed repository facts and frozen TaskSpec.
   */
  static async initializeFromObservedFacts(
    workspacePath: string,
    task: TaskSpec,
    sourceRevision: string
  ): Promise<ProjectContextData> {
    const projectName = path.basename(workspacePath);

    // Discover modules by scanning workspace
    const discoveredModules: string[] = [];
    const srcDir = path.join(workspacePath, 'src');
    if (existsSync(srcDir)) {
      try {
        const entries = await fs.readdir(srcDir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isFile() && e.name.endsWith('.rs')) {
            discoveredModules.push(`src/${e.name}`);
          } else if (e.isDirectory()) {
            discoveredModules.push(`src/${e.name}/*`);
          }
        }
      } catch {
        // Fallback
      }
    }

    const stateRev = `st-${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    return {
      identity: {
        projectName,
        language: 'Rust',
        stack: 'Cargo',
        repositoryRoot: workspacePath,
        sourceRevision,
      },
      requirements: {
        taskId: task.id,
        taskTitle: task.title,
        taskPrompt: task.prompt,
        acceptanceCriteria: task.acceptance ?? ['cargo test exits with code 0'],
      },
      architecture: {
        relevantModules: discoveredModules.length > 0 ? discoveredModules : ['src/lib.rs'],
        existingInterfaces: [],
        verifiedDependencies: [],
      },
      activeTask: {
        taskId: task.id,
        currentPhase: 'ADMISSION',
        responsibleTier: 'NON_LLM',
        remainingWork: 'Analyze task requirements and verify initial workspace state',
      },
      acceptedDecisions: [],
      verifiedProgress: [
        {
          id: 'prog-0',
          type: 'check',
          description: 'Workspace admitted and isolated task baseline captured',
          timestamp: now,
          revision: sourceRevision,
        },
      ],
      knownFailures: [],
      nextAction: {
        step: 'Run non-LLM baseline check and AST context discovery',
        requiredEvidence: 'Clean AST parsing and baseline compiler diagnostics',
        suggestedTier: 'NON_LLM',
      },
      evidenceReferences: [],
      checkpoint: {
        stateRevision: stateRev,
        sourceRevision,
        lastVerifiedTransition: 'INIT -> ADMISSION',
        timestamp: now,
      },
    };
  }

  /**
   * Loads or initializes CONTEXT.MD inside the workspace.
   */
  static async loadOrInitialize(
    workspacePath: string,
    task: TaskSpec,
    sourceRevision: string
  ): Promise<{ data: ProjectContextData; wasCreated: boolean }> {
    const contextFilePath = path.join(workspacePath, this.FILE_NAME);

    if (existsSync(contextFilePath)) {
      try {
        const content = await fs.readFile(contextFilePath, 'utf8');
        const parsed = this.parse(content);
        return { data: parsed, wasCreated: false };
      } catch {
        // Corrupted file, regenerate
      }
    }

    const initialData = await this.initializeFromObservedFacts(workspacePath, task, sourceRevision);
    await this.writeContextDocument(workspacePath, initialData);
    return { data: initialData, wasCreated: true };
  }

  /**
   * Atomically writes CONTEXT.MD to the workspace root.
   */
  static async writeContextDocument(workspacePath: string, data: ProjectContextData): Promise<void> {
    const targetPath = path.join(workspacePath, this.FILE_NAME);
    const tmpPath = path.join(workspacePath, `${this.FILE_NAME}.tmp-${crypto.randomBytes(4).toString('hex')}`);
    const markdown = this.serialize(data);

    await fs.writeFile(tmpPath, markdown, 'utf8');
    await fs.rename(tmpPath, targetPath);
  }

  /**
   * Computes composite SHA-256 source revision across all Rust source files in workspace.
   */
  static async computeSourceRevision(workspacePath: string): Promise<string> {
    const srcDir = path.join(workspacePath, 'src');
    const hashes: string[] = [];
    try {
      const entries = await fs.readdir(srcDir, { recursive: true });
      const sorted = entries.map((e) => e.toString()).sort();
      for (const entry of sorted) {
        if (entry.endsWith('.rs')) {
          const full = path.join(srcDir, entry);
          const stat = await fs.stat(full);
          if (stat.isFile()) {
            const content = await fs.readFile(full);
            const h = crypto.createHash('sha256').update(content).digest('hex');
            hashes.push(`${entry}:${h}`);
          }
        }
      }
    } catch {
      // Empty or non-standard directory
    }
    const combined = hashes.join(';');
    return `sha256:${crypto.createHash('sha256').update(combined || 'empty').digest('hex').slice(0, 16)}`;
  }

  /**
   * Validates CONTEXT.MD against actual filesystem state and detects discrepancies.
   */
  static validateAgainstFilesystem(
    data: ProjectContextData,
    currentSourceRevision: string
  ): { valid: boolean; conflicts: string[] } {
    const conflicts: string[] = [];

    if (data.identity.sourceRevision !== currentSourceRevision) {
      conflicts.push(
        `Source revision discrepancy: CONTEXT.MD records ${data.identity.sourceRevision}, but workspace is currently at ${currentSourceRevision}`
      );
    }

    if (data.checkpoint.sourceRevision !== currentSourceRevision) {
      conflicts.push(
        `Checkpoint source revision discrepancy: Checkpoint was taken at ${data.checkpoint.sourceRevision}, current is ${currentSourceRevision}`
      );
    }

    return {
      valid: conflicts.length === 0,
      conflicts,
    };
  }
}
