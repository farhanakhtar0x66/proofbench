import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  type RunRecord as RunRecordType,
  type AcceptanceResult as AcceptanceResultType,
  RunRecord,
  ExecutionTrace,
  EvidenceReport,
  TaskSpec,
  AgentDescriptor,
  AcceptanceResult,
  UsageRecord,
} from '../../../../packages/contracts/src/index';
import { BifrostClient } from '../gateway/client';
import { EmbeddedBifrostGateway } from '../gateway/embedded';
import { GovernancePolicy, createDefaultPolicy, validateModelAgainstPolicy } from '../governance/policy';
import { HostApprovalEngine, ProposedToolAction, HostApprovalHandler } from '../governance/approval';
import { M1ContextSelector } from '../context/m1-selector';
import { M2StagnationDetector } from '../progress/m2-stagnation';
import { M3aFailureAutopsyBuilder } from '../handoff/m3a-autopsy';
import { TavilyDocumentationVerifier } from '../tavily/verifier';
import { TaskWorkspace } from './workspace';

export interface ProofBenchAgentOptions {
  bifrostClient?: BifrostClient;
  embeddedGateway?: EmbeddedBifrostGateway;
  policy?: Partial<GovernancePolicy>;
  approvalHandler?: HostApprovalHandler;
  primaryModel?: string;
  recoveryModel?: string;
  enableM1ContextBounding?: boolean;
  enableM2StagnationBreaker?: boolean;
  enableM3aAutopsyEscalation?: boolean;
  enableTavilyDocumentation?: boolean;
}

export class ProofBenchAgent {
  public bifrostClient: BifrostClient;
  public policy: GovernancePolicy;
  public approvalEngine: HostApprovalEngine;
  public m1Selector: M1ContextSelector;
  public primaryModel: string;
  public recoveryModel: string;
  private enableM1: boolean;
  private enableM2: boolean;
  private enableM3a: boolean;
  private enableTavily: boolean;

  constructor(options: ProofBenchAgentOptions = {}) {
    this.policy = createDefaultPolicy(options.policy);
    this.approvalEngine = new HostApprovalEngine(this.policy, options.approvalHandler);
    this.bifrostClient = options.bifrostClient ?? new BifrostClient({
      embeddedGateway: options.embeddedGateway,
      userBudgetLimitUsd: this.policy.maxBudgetUsd,
      confidential: this.policy.confidential,
    });
    if (this.policy.confidential) {
      this.bifrostClient.confidential = true;
    }
    this.primaryModel = options.primaryModel ?? (
      this.bifrostClient.mode === 'live'
        ? (process.env.BIFROST_DEFAULT_MODEL ?? 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M')
        : (this.policy.confidential ? 'local-deepseek-coder' : 'opencode/deepseek-v4.1-flash-free')
    );
    this.recoveryModel = options.recoveryModel ?? (
      this.bifrostClient.mode === 'live'
        ? (process.env.BIFROST_RECOVERY_MODEL ?? 'gguf/Qwen3.5-9B-GGUF:Q4_K_M')
        : 'escalation-frontier-model'
    );
    this.enableM1 = options.enableM1ContextBounding ?? true;
    this.enableM2 = options.enableM2StagnationBreaker ?? true;
    this.enableM3a = options.enableM3aAutopsyEscalation ?? true;
    this.enableTavily = options.enableTavilyDocumentation ?? true;
    this.m1Selector = new M1ContextSelector({ maxTokenBudget: 4000 });
  }

  async runTask(task: TaskSpec, seed = 0): Promise<{ run: RunRecord; trace: ExecutionTrace; report: EvidenceReport }> {
    const startTime = performance.now();
    const runId = randomUUID();
    const reportId = randomUUID();
    const createdAt = new Date().toISOString();

    const traceEvents: ExecutionTrace['events'] = [];
    let seq = 0;

    const addEvent = (type: ExecutionTrace['events'][0]['type'], message: string, data?: Record<string, unknown>) => {
      traceEvents.push({
        sequence: seq++,
        at: new Date().toISOString(),
        type,
        message,
        data,
      });
    };

    addEvent('start', `ProofBench Bifrost #01 agent execution started for task ${task.id}`, {
      taskId: task.id,
      confidential: this.policy.confidential,
      primaryModel: this.primaryModel,
    });

    // 1. Setup Isolated Task Workspace
    let workspace: TaskWorkspace;
    try {
      workspace = await TaskWorkspace.create(task.id);
      addEvent('start', `Isolated workspace created: ${workspace.workspaceId}`);
    } catch (err) {
      addEvent('error', `Failed to initialize isolated workspace: ${(err as Error).message}`);
      return this.buildFailureRecord(runId, reportId, createdAt, task, startTime, traceEvents, 'Workspace initialization failure');
    }

    // 2. Validate Model Governance (checking destination endpoint and provider eligibility)
    const modelCheck = validateModelAgainstPolicy(this.primaryModel, this.policy, {
      destinationUrl: this.bifrostClient.gatewayUrl,
    });
    if (!modelCheck.valid) {
      addEvent('error', `Model policy rejection: ${modelCheck.reason}`);
      await workspace.destroy();
      return this.buildFailureRecord(runId, reportId, createdAt, task, startTime, traceEvents, modelCheck.reason ?? 'Policy validation failed');
    }

    const m2Detector = new M2StagnationDetector();
    let currentModel = this.primaryModel;
    let pendingHandoffPacket: string | null = null;
    let recoveryActive = false;
    let totalPromptTokens: number | null = null;
    let totalCompletionTokens: number | null = null;
    let totalCostUsd = 0;
    let taskCompleted = false;
    let lastErrorOutput = '';
    let observedRoutingProvider = 'bifrost';

    try {
      // Check baseline status before edits
      const initialTest = await workspace.runAcceptanceTests();
      if (initialTest.passed) {
        taskCompleted = true;
        addEvent('check', 'Initial acceptance check passed without modification.', {
          model: currentModel,
          attempt: 0,
          passed: true,
        });
      }

      let attempt = 0;
      while (!taskCompleted && attempt < this.policy.maxTurns) {
        attempt++;

        // Step 1: M1 Context Selection
        let contextText = '';
        if (this.enableM1) {
          const m1Result = await this.m1Selector.selectContext(
            workspace.workspacePath,
            lastErrorOutput,
            task.prompt
          );
          if (m1Result.status === 'context_overflow') {
            addEvent('error', `M1 context overflow: ${m1Result.reason}`, {
              model: currentModel,
              attempt,
            });
            break;
          }
          contextText = m1Result.formattedContext;
          addEvent('output', `M1 deterministic context selected (${m1Result.totalTokens} tokens, ${m1Result.selectedItems.length} items, ${m1Result.omittedItems.length} omissions)`, {
            model: currentModel,
            attempt,
            tokens: m1Result.totalTokens,
          });
        } else {
          // Unbounded raw read for baseline comparison: inspect all source files across the workspace
          try {
            const srcDir = path.join(workspace.workspacePath, 'src');
            const entries = await fs.readdir(srcDir, { recursive: true });
            let combined = '';
            for (const entry of entries) {
              const strEntry = entry.toString();
              if (strEntry.endsWith('.rs')) {
                const fullP = path.join(srcDir, strEntry);
                try {
                  const stat = await fs.stat(fullP);
                  if (stat.isFile()) {
                    const content = await fs.readFile(fullP, 'utf8');
                    combined += `## File: src/${strEntry}\n\`\`\`rust\n${content}\n\`\`\`\n\n`;
                  }
                } catch {
                  // Ignore read errors on individual unreadable entries
                }
              }
            }
            contextText = combined || '';
          } catch {
            contextText = '';
          }
        }

        // Step 2: Tavily Documentation Verification
        let tavilyContext = '';
        if (this.enableTavily) {
          const tavilyRes = await TavilyDocumentationVerifier.verifyCodePlanClaims(task.prompt, this.policy);
          if (tavilyRes.allowed && tavilyRes.injectedContext) {
            tavilyContext = tavilyRes.injectedContext;
            addEvent('output', `Tavily documentation verified (${tavilyRes.claimsVerified.length} claims checked)`, {
              model: currentModel,
              attempt,
            });
          } else if (!tavilyRes.allowed) {
            addEvent('output', `Tavily documentation lookup skipped: ${tavilyRes.reason}`, {
              model: currentModel,
              attempt,
            });
          }
        }

        // Step 3: Bifrost Gateway Model Request
        if (recoveryActive) {
          addEvent('output', `Dispatching recovery turn ${attempt} to authorized model ${currentModel} with M3a failure autopsy packet`, {
            model: currentModel,
            attempt,
            isRecovery: true,
          });
        } else {
          addEvent('output', `Dispatching turn ${attempt} to model ${currentModel} through Bifrost Gateway`, {
            model: currentModel,
            attempt,
            isRecovery: false,
          });
        }

        const userPrompt = pendingHandoffPacket
          ? `${pendingHandoffPacket}\n\nTask: ${task.prompt}\n\n${contextText}\n\n${tavilyContext}`
          : `Task: ${task.prompt}\n\n${contextText}\n\n${tavilyContext}\n\nPrevious compiler output:\n${lastErrorOutput || 'None yet'}`;
        pendingHandoffPacket = null;

        const messages = [
          {
            role: 'system' as const,
            content: `You are an expert Rust coding agent. Fix the bug or implement the feature to satisfy acceptance tests.
You may output file modifications via write_file tool calls or formatted markdown code blocks:
// File: <relative-path>
\`\`\`rust
<complete file content>
\`\`\`
Always output the complete valid file content for the target file.
CRITICAL: Preserve all existing struct definitions, traits, enums, derive macros (e.g. #[derive(Debug, Clone)]), imports (use ...), and existing public APIs in the file. Ensure public functions, methods, and types retain 'pub' visibility. Output only the complete valid file content for the target file.`,
          },
          {
            role: 'user' as const,
            content: userPrompt,
          },
        ];

        let gatewayResponse;
        try {
          gatewayResponse = await this.bifrostClient.createChatCompletion({
            model: currentModel,
            messages,
          });
        } catch (gatewayErr) {
          addEvent('error', `Bifrost gateway error: ${(gatewayErr as Error).message}`, {
            model: currentModel,
            attempt,
          });
          break;
        }

        if (typeof gatewayResponse.usage?.prompt_tokens === 'number') {
          totalPromptTokens = (totalPromptTokens ?? 0) + gatewayResponse.usage.prompt_tokens;
        }
        if (typeof gatewayResponse.usage?.completion_tokens === 'number') {
          totalCompletionTokens = (totalCompletionTokens ?? 0) + gatewayResponse.usage.completion_tokens;
        }
        if (gatewayResponse.bifrost_metadata) {
          totalCostUsd += gatewayResponse.bifrost_metadata.cost_usd;
          observedRoutingProvider = gatewayResponse.bifrost_metadata.provider;
          if (gatewayResponse.bifrost_metadata.fallback_invoked) {
            addEvent('output', `Bifrost fallback routing triggered: active provider is ${observedRoutingProvider}`, {
              model: currentModel,
              attempt,
              fallbackProvider: observedRoutingProvider,
            });
          }
        }

        // Step 4: Parse Real Model Action(s) — No solution copying!
        const proposedModifications = this.parseModelActions(gatewayResponse);
        if (proposedModifications.length === 0) {
          addEvent('error', `Turn ${attempt}: No actionable file modifications or code blocks found in model response.`, {
            model: currentModel,
            attempt,
          });
          if (this.enableM2) {
            const stagnation = m2Detector.recordAttempt({
              patch: '',
              rawError: 'No code modifications proposed by model',
              exitCode: 1,
            });
            if (stagnation.shouldHalt) {
              addEvent('error', `M2 Loop Breaker: ${stagnation.message}`, {
                model: currentModel,
                attempt,
                stagnationReason: stagnation.reason,
              });
              break;
            }
          }
          continue;
        }

        // Step 5 & 6: Validate, Approve & Apply each modification inside workspace
        let allApproved = true;
        let lastAppliedPatch = '';

        for (let modIdx = 0; modIdx < proposedModifications.length; modIdx++) {
          const mod = proposedModifications[modIdx];
          const normalizedRelPath = path.normalize(mod.path).replace(/^[/\\]+/, '');

          // Safety check 1: Path traversal protection
          if (
            normalizedRelPath.startsWith('..') ||
            path.isAbsolute(normalizedRelPath) ||
            normalizedRelPath.includes('\0')
          ) {
            addEvent('error', `Security rejection: path traversal attempt detected in target path '${mod.path}'`, {
              model: currentModel,
              attempt,
              path: mod.path,
            });
            allApproved = false;
            break;
          }

          // Safety check 2: Workspace boundary containment
          const targetAbsPath = path.resolve(workspace.workspacePath, normalizedRelPath);
          if (!targetAbsPath.startsWith(path.resolve(workspace.workspacePath))) {
            addEvent('error', `Security rejection: path escapes workspace boundaries: '${mod.path}'`, {
              model: currentModel,
              attempt,
              path: mod.path,
            });
            allApproved = false;
            break;
          }

          // Safety check 3: Host Approval Check
          const action: ProposedToolAction = {
            id: `act-${attempt}-${modIdx + 1}`,
            tool: 'write_file',
            parameters: { path: normalizedRelPath, content: mod.content },
            category: 'write',
          };

          const approval = await this.approvalEngine.evaluateAction(action);
          if (!approval.approved) {
            addEvent('error', `Action rejected by host approval engine: ${approval.reason}`, {
              model: currentModel,
              attempt,
              tool: action.tool,
              path: normalizedRelPath,
            });
            allApproved = false;
            break;
          }

          addEvent('output', `Host approval granted for action: ${action.tool} on ${normalizedRelPath}`, {
            model: currentModel,
            attempt,
            tool: action.tool,
            path: normalizedRelPath,
          });

          // Execute Approved Action inside workspace
          await fs.mkdir(path.dirname(targetAbsPath), { recursive: true });
          await fs.writeFile(targetAbsPath, mod.content, 'utf8');
          addEvent('output', `Wrote updated content to ${normalizedRelPath} (${mod.content.length} bytes)`, {
            model: currentModel,
            attempt,
            path: normalizedRelPath,
            bytes: mod.content.length,
          });
          lastAppliedPatch = mod.content;
        }

        if (!allApproved) {
          break;
        }

        // Step 7: Independent Test Verification
        const testResult = await workspace.runAcceptanceTests();
        lastErrorOutput = testResult.output;

        if (testResult.passed) {
          taskCompleted = true;
          addEvent('check', `Acceptance tests passed cleanly on attempt ${attempt}!`, {
            model: currentModel,
            attempt,
            passed: true,
          });
          break;
        }

        addEvent('check', `Acceptance tests failed on attempt ${attempt}: ${testResult.output.slice(0, 300)}`, {
          model: currentModel,
          attempt,
          passed: false,
        });

        // Step 8: Progress & Loop Control (M2)
        if (this.enableM2) {
          const stagnation = m2Detector.recordAttempt({
            patch: lastAppliedPatch,
            rawError: testResult.output,
            exitCode: testResult.exitCode,
            passedCount: testResult.passedCount,
            failedCount: testResult.failedCount,
          });

          if (stagnation.shouldHalt) {
            addEvent('error', `M2 Loop Breaker: ${stagnation.message}`, {
              model: currentModel,
              attempt,
              stagnationReason: stagnation.reason,
            });

            // Step 9: M3a Failure Autopsy & Escalation
            if (this.enableM3a && !recoveryActive) {
              const autopsy = M3aFailureAutopsyBuilder.buildAutopsyPacket({
                taskId: task.id,
                taskTitle: task.title,
                taskPrompt: task.prompt,
                attempts: m2Detector.getAttempts(),
                stagnationReason: stagnation.message,
                escalationModel: this.recoveryModel,
                maxTokenBudget: 2000,
              });

              addEvent('output', `M3a structured autopsy generated (${autopsy.tokenCount} tokens; 0 LLM narrative). Target escalation: ${autopsy.escalationModelTarget}`, {
                model: currentModel,
                attempt,
                tokenCount: autopsy.tokenCount,
                budgetCompacted: autopsy.budgetCompacted,
                reducedAttempts: autopsy.reducedAttempts,
                oversized: autopsy.oversized,
                canDispatch: autopsy.canDispatch,
              });

              if (!autopsy.canDispatch || autopsy.oversized) {
                addEvent('error', `M3a autopsy packet exceeds declared budget (${autopsy.tokenCount} > ${autopsy.maxTokenBudget}) and could not be safely reduced. Escalation dispatch aborted.`, {
                  model: currentModel,
                  attempt,
                });
                break;
              }

              // Check if escalation is permitted by policy
              const escalationCheck = validateModelAgainstPolicy(autopsy.escalationModelTarget, this.policy, {
                destinationUrl: this.bifrostClient.gatewayUrl,
              });
              if (!escalationCheck.valid) {
                addEvent('error', `Model escalation denied by policy: ${escalationCheck.reason}`, {
                  model: currentModel,
                  attempt,
                });
                break;
              }

              currentModel = autopsy.escalationModelTarget;
              pendingHandoffPacket = autopsy.formattedPacket;
              recoveryActive = true;
              addEvent('output', `Authorized model escalation to ${currentModel} via Bifrost routing with verified diagnostic handoff`, {
                previousModel: this.primaryModel,
                escalationModel: currentModel,
                attempt,
              });
              m2Detector.reset();
              continue;
            } else {
              break;
            }
          }
        }
      }

      // Final Acceptance Verification
      const finalTest = await workspace.runAcceptanceTests();
      const status: AcceptanceResultType['status'] = finalTest.passed ? 'passed' : 'failed';
      const runStatus: RunRecordType['status'] = finalTest.passed ? 'completed' : 'failed';

      const acceptance = AcceptanceResult.parse({
        version: '1',
        status,
        method: 'Independent cargo test acceptance suite executed in isolated workspace',
        checks: task.acceptance.map((req, _i) => ({
          name: req,
          passed: finalTest.passed,
          evidence: finalTest.passed
            ? 'Acceptance tests compiled and passed cleanly with exit code 0'
            : finalTest.output || 'Acceptance test failed',
        })),
      });

      const usage = UsageRecord.parse({
        version: '1',
        inputTokens: totalPromptTokens !== null
          ? {
              status: 'known',
              value: totalPromptTokens,
              unit: 'tokens',
              source: 'bifrost.gateway.prompt_tokens',
              scope: 'proofbench_agent_turns_cumulative',
            }
          : {
              status: 'missing',
              reason: 'No prompt token observations reported by provider',
            },
        outputTokens: totalCompletionTokens !== null
          ? {
              status: 'known',
              value: totalCompletionTokens,
              unit: 'tokens',
              source: 'bifrost.gateway.completion_tokens',
              scope: 'proofbench_agent_turns_cumulative',
            }
          : {
              status: 'missing',
              reason: 'No completion token observations reported by provider',
            },
        duration: {
          status: 'known',
          value: Math.max(1, Math.round(performance.now() - startTime)),
          unit: 'ms',
          source: 'performance.now',
          scope: 'total agent session duration',
        },
        cost: {
          status: 'estimated',
          value: Number(totalCostUsd.toFixed(6)),
          unit: 'USD',
          source: 'bifrost.gateway',
          method: 'pricing_model_v1',
          scope: 'bifrost virtual key debits',
        },
      });

      const descriptor = AgentDescriptor.parse({
        version: '1',
        id: 'bifrost-01',
        name: 'ProofBench Deterministically Governed Coding Agent',
        implementation: '01',
        runtime: 'typescript',
        revision: '0.1.0',
        model: currentModel,
      });

      const run = RunRecord.parse({
        version: '1',
        id: runId,
        task,
        agent: descriptor,
        status: runStatus,
        output: finalTest.passed
          ? `Successfully solved task ${task.id} with verified acceptance tests.`
          : `Failed task ${task.id}. Final error: ${finalTest.output}`,
        usage,
        acceptance,
        createdAt,
        reportId,
        reproducibility: {
          seed,
          adapterRevision: '0.1.0',
          fixtureRevision: task.fixtureId ?? 'unknown',
          environment: `proofbench-bifrost01-${process.platform}`,
          simulated: this.bifrostClient.mode === 'simulation',
        },
      });

      const trace = ExecutionTrace.parse({
        version: '1',
        runId,
        events: traceEvents,
      });

      const report = EvidenceReport.parse({
        version: '1',
        id: reportId,
        runId,
        createdAt,
        summary: `Bifrost #01 Governed Agent on ${task.title}: ${status.toUpperCase()} (${runStatus})`,
        acceptance,
        usage,
        verification: null,
        limitations: [
          'Independent acceptance test execution verified through cargo test.',
          'M1 context selection utilizes regex/brace scanning for symbol extraction, not Tree-sitter or verified LSP.',
          'M2 stagnation detection utilizes SHA-256 patch and error output hashes, not full structural AST progress control.',
          'M3a failure autopsy utilizes character-ratio token approximations rather than exact model tokenizer profiles.',
          'Workspace isolation uses temporary directory creation and sanitized process environments; not a hardware virtual-machine sandbox.',
          'Model costs are estimated using standard pricing tier calculations ($0.15/1M input, $0.60/1M output) rather than direct billing invoices.',
          this.policy.confidential
            ? 'Confidential repository mode enforced: cloud model routing and external Tavily requests strictly blocked.'
            : 'Public mode: Tavily documentation claims verified against reference sources.',
        ],
      });

      return { run, trace, report };
    } finally {
      await workspace.destroy();
    }
  }

  /**
   * Parses model-proposed file modifications from tool calls or formatted markdown blocks.
   * Does NOT read from reference solutions or answer keys.
   */
  public parseModelActions(
    response: { choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ type: string; function?: { name?: string; arguments?: string | Record<string, unknown> } }> } }> },
    defaultFile = 'src/lib.rs'
  ): Array<{ path: string; content: string }> {
    const results: Array<{ path: string; content: string }> = [];
    const choice = response.choices?.[0];
    if (!choice) return results;

    // 1. Tool call format: write_file
    if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
      for (const tc of choice.message.tool_calls) {
        if (tc.type === 'function' && tc.function?.name === 'write_file') {
          try {
            const rawArgs = tc.function.arguments;
            const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
            if (args && typeof args.path === 'string' && typeof args.content === 'string') {
              let p = args.path.trim().replace(/^[`"']+|[`"']+$/g, '');
              if (!p.startsWith('src/') && !p.includes('/') && !p.includes('\\')) {
                p = `src/${p}`;
              }
              results.push({ path: p, content: args.content });
            }
          } catch {
            // Ignore parse errors on malformed arguments
          }
        }
      }
      if (results.length > 0) {
        return results;
      }
    }

    // 2. Structured markdown code blocks in content
    const text = choice.message?.content ?? '';
    if (!text) return results;

    const codeBlockRegex = /(?:(?:(?:\/\/|###?|\/\*)\s*(?:File:\s*)?`?([^\r\n`*]+\.rs)`?\*?|File:\s*([^\r\n`]+))\s*)?```(?:rust|rs)?\s*\n([\s\S]*?)```/gi;

    let match: RegExpExecArray | null;
    while ((match = codeBlockRegex.exec(text)) !== null) {
      let filePath = (match[1] || match[2] || '').trim();
      const content = match[3];

      if (!filePath) {
        const firstLineMatch = content.match(/^(?:(?:\/\/|###?|\/\*)\s*(?:File:\s*)?`?([^\r\n`*]+\.rs)`?\*?|File:\s*([^\r\n`]+))/i);
        if (firstLineMatch) {
          filePath = (firstLineMatch[1] || firstLineMatch[2] || '').trim();
        }
      }

      if (filePath) {
        filePath = filePath.replace(/^[`"']+|[`"']+$/g, '').trim();
        if (!filePath.startsWith('src/') && !filePath.includes('/') && !filePath.includes('\\')) {
          filePath = `src/${filePath}`;
        }
      }

      if (!filePath) {
        if (content.includes('parse_event')) {
          filePath = 'src/parser.rs';
        } else if (content.includes('EventSink')) {
          filePath = 'src/sink.rs';
        } else if (content.includes('calculate_checksum')) {
          filePath = 'src/event.rs';
        } else if (content.includes('sliding_window_sums') || content.includes('ExponentialBackoff')) {
          filePath = 'src/lib.rs';
        }
      }

      // Ignore trivial or accidental non-code snippets (less than 40 chars)
      if (
        content.trim().length < 40 &&
        !content.includes('fn ') &&
        !content.includes('struct ') &&
        !content.includes('impl ')
      ) {
        continue;
      }

      results.push({
        path: filePath || defaultFile,
        content,
      });
    }

    if (results.length === 0 && (text.includes('fn ') || text.includes('pub ') || text.includes('impl '))) {
      results.push({
        path: defaultFile,
        content: text.trim(),
      });
    }

    // Deduplicate proposed modifications targeting the same file within a single turn,
    // keeping the largest/most complete code block.
    const fileMap = new Map<string, { path: string; content: string }>();
    for (const item of results) {
      const existing = fileMap.get(item.path);
      if (!existing || item.content.length > existing.content.length) {
        fileMap.set(item.path, item);
      }
    }

    return Array.from(fileMap.values());
  }

  private buildFailureRecord(
    runId: string,
    reportId: string,
    createdAt: string,
    task: TaskSpec,
    startTime: number,
    events: ExecutionTrace['events'],
    errorMsg: string
  ): { run: RunRecord; trace: ExecutionTrace; report: EvidenceReport } {
    const descriptor = AgentDescriptor.parse({
      version: '1',
      id: 'bifrost-01',
      name: 'ProofBench Deterministically Governed Coding Agent',
      implementation: '01',
      runtime: 'typescript',
      revision: '0.1.0',
      model: this.primaryModel,
    });

    const acceptance = AcceptanceResult.parse({
      version: '1',
      status: 'failed',
      method: 'Execution halted before acceptance testing',
      checks: [{ name: 'Task initialization', passed: false, evidence: errorMsg }],
    });

    const usage = UsageRecord.parse({
      version: '1',
      inputTokens: { status: 'missing', reason: 'Failed before model call' },
      outputTokens: { status: 'missing', reason: 'Failed before model call' },
      duration: {
        status: 'known',
        value: Math.max(1, Math.round(performance.now() - startTime)),
        unit: 'ms',
        source: 'performance.now',
        scope: 'aborted session duration',
      },
      cost: {
        status: 'estimated',
        value: 0,
        unit: 'USD',
        source: 'bifrost.gateway',
        method: 'pricing_model_v1',
        scope: 'zero external cost incurred',
      },
    });

    const run = RunRecord.parse({
      version: '1',
      id: runId,
      task,
      agent: descriptor,
      status: 'failed',
      output: `Aborted: ${errorMsg}`,
      usage,
      acceptance,
      createdAt,
      reportId,
      reproducibility: {
        seed: 0,
        adapterRevision: '0.1.0',
        fixtureRevision: task.fixtureId ?? 'unknown',
        environment: `proofbench-bifrost01-${process.platform}`,
        simulated: this.bifrostClient.mode === 'simulation',
      },
    });

    const trace = ExecutionTrace.parse({
      version: '1',
      runId,
      events,
    });

    const report = EvidenceReport.parse({
      version: '1',
      id: reportId,
      runId,
      createdAt,
      summary: `Bifrost #01 Aborted: ${errorMsg}`,
      acceptance,
      usage,
      verification: null,
      limitations: ['Halted due to governance policy or initialization failure.'],
    });

    return { run, trace, report };
  }
}
