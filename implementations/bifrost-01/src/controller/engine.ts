import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  RunRecord,
  ExecutionTrace,
  EvidenceReport,
  TaskSpec,
  AgentDescriptor,
  AcceptanceResult,
  UsageRecord,
} from '../../../../packages/contracts/src/index';
import { BifrostClient } from '../gateway/client';
import {
  GovernancePolicy,
  createDefaultPolicy,
  isLocalDestination,
} from '../governance/policy';
import {
  HostApprovalEngine,
  ProposedToolAction,
} from '../governance/approval';
import { TaskWorkspace } from '../runtime/workspace';
import {
  ContextCompiler,
  PromptCompiler,
  IncrementalEditManager,
  DeterministicModelSelector,
  MechanicalTransformer,
  type DiagnosticRecord,
  type ContextCompilationResult,
  type FileResolutionContext,
} from '../compiler/index';
import {
  ModelRegistry,
  UniversalHandoffProtocol,
  OscillationDetector,
  type UniversalHandoffPacket,
  type TierTransitionProposal,
} from '../routing/index';
import {
  ContextDocumentManager,
  DurableStore,
  type ExecutionTier,
  type EnginePhase,
  type ProjectContextData,
  type ControllerState,
  type TierTransitionRecord,
} from '../persistence/index';
import { TavilyDocumentationVerifier } from '../tavily/verifier';
import { M2StagnationDetector } from '../progress/m2-stagnation';
import { M3aFailureAutopsyBuilder } from '../handoff/m3a-autopsy';
import {
  AdaptiveExecutionEngineOptions,
  EngineRunOptions,
  EngineExecutionResult,
  EngineRoutingPolicy,
} from './types';

export class AdaptiveExecutionEngine {
  public bifrostClient: BifrostClient;
  public policy: GovernancePolicy;
  public approvalEngine: HostApprovalEngine;
  public modelRegistry: ModelRegistry;
  public contextCompiler: ContextCompiler;
  public modelSelector: DeterministicModelSelector;
  public oscillationDetector: OscillationDetector;
  public maxTurns: number;
  public routingPolicy: EngineRoutingPolicy;
  private enableTavily: boolean;
  private enableOscillationBreaker: boolean;

  constructor(options: AdaptiveExecutionEngineOptions = {}) {
    this.routingPolicy = options.routingPolicy ?? 'bidirectional_adaptive';
    this.policy = createDefaultPolicy(options.policy);
    this.approvalEngine = new HostApprovalEngine(this.policy, options.approvalHandler);
    this.bifrostClient =
      options.bifrostClient ??
      new BifrostClient({
        embeddedGateway: options.embeddedGateway,
        userBudgetLimitUsd: this.policy.maxBudgetUsd,
        confidential: this.policy.confidential,
      });

    if (this.policy.confidential) {
      this.bifrostClient.confidential = true;
    }

    const isLive = this.bifrostClient.mode === 'live';
    this.modelRegistry = new ModelRegistry({
      smallModel: options.smallModel,
      strongerModel: options.strongerModel,
      isLive,
      gatewayUrl: this.bifrostClient.gatewayUrl,
    });

    const smallModelId = this.modelRegistry.getModelForTier('SMALL_LLM').id;
    const strongerModelId = this.modelRegistry.getModelForTier('STRONGER_LLM').id;

    this.contextCompiler = new ContextCompiler({ maxTokenBudget: 3500 });
    this.modelSelector = new DeterministicModelSelector({
      smallModel: smallModelId,
      frontierModel: strongerModelId,
      maxBudget: 3500,
    });
    this.oscillationDetector = new OscillationDetector({ maxOscillations: 2 });

    this.maxTurns = options.maxTurns ?? this.policy.maxTurns;
    this.enableTavily = options.enableTavily ?? true;
    this.enableOscillationBreaker = options.enableOscillationBreaker ?? true;
  }

  public async runTask(
    task: TaskSpec,
    runOptions: EngineRunOptions = {}
  ): Promise<EngineExecutionResult> {
    const startTime = performance.now();
    const runCpuStart = process.cpuUsage();
    const runId = randomUUID();
    const reportId = randomUUID();
    const createdAt = new Date().toISOString();

    const traceEvents: ExecutionTrace['events'] = [];
    let seq = 0;

    const addTraceEvent = (
      type: ExecutionTrace['events'][0]['type'],
      message: string,
      data?: Record<string, unknown>
    ) => {
      traceEvents.push({
        sequence: seq++,
        at: new Date().toISOString(),
        type,
        message,
        data,
      });
    };

    addTraceEvent('start', `ProofBench Adaptive Execution Engine v1 started for task ${task.id}`, {
      taskId: task.id,
      confidential: this.policy.confidential,
      gatewayMode: this.bifrostClient.mode,
    });

    // =========================================================================
    // PHASE 1: ADMISSION
    // =========================================================================
    let currentPhase: EnginePhase = 'ADMISSION';
    let currentTier: ExecutionTier = 'NON_LLM';
    let workspace: TaskWorkspace | null = null;
    let workspacePath = runOptions.workspacePath;

    if (!workspacePath) {
      try {
        workspace = await TaskWorkspace.create(task.id);
        workspacePath = workspace.workspacePath;
        addTraceEvent('start', `Isolated task workspace initialized: ${workspace.workspaceId}`);
      } catch (err) {
        addTraceEvent('error', `Failed to create isolated workspace: ${(err as Error).message}`);
        return this.buildFailureResult(
          runId,
          reportId,
          createdAt,
          task,
          startTime,
          traceEvents,
          'Workspace admission failure',
          runCpuStart
        );
      }
    }

    const durableStore = new DurableStore(workspacePath);
    await durableStore.initialize();

    // Check for existing checkpoint resumption
    let controllerState: ControllerState | null = null;
    let contextData: ProjectContextData | null = null;
    let resumedFromCheckpoint = false;

    const latestCheckpoint = await durableStore.getLatestCheckpoint();
    if (latestCheckpoint) {
      const currentRev = await ContextDocumentManager.computeSourceRevision(workspacePath);
      if (latestCheckpoint.sourceRevision === currentRev) {
        controllerState = latestCheckpoint.stateSnapshot;
        contextData = latestCheckpoint.contextSnapshot;
        resumedFromCheckpoint = true;
        currentTier = controllerState.currentTier;
        addTraceEvent(
          'output',
          `Resumed execution from checkpoint ${latestCheckpoint.checkpointId} at turn ${controllerState.turnCount} (source revision: ${currentRev.slice(0, 8)}) in tier ${currentTier}`,
          { checkpointId: latestCheckpoint.checkpointId, turnCount: controllerState.turnCount, tier: currentTier }
        );
      } else {
        await durableStore.appendEvent(
          'resumption_mismatch',
          'ADMISSION',
          'NON_LLM',
          currentRev,
          {
            checkpointRev: latestCheckpoint.sourceRevision,
            currentRev,
            message: 'Filesystem modified externally since checkpoint; proceeding with refreshed facts.',
          }
        );
      }
    }

    const initialSourceRevision = await ContextDocumentManager.computeSourceRevision(workspacePath);

    if (!controllerState) {
      controllerState = {
        version: '1',
        runId,
        taskId: task.id,
        currentPhase: 'ADMISSION',
        currentTier: 'NON_LLM',
        sourceRevision: initialSourceRevision,
        stateRevision: `state-${Date.now()}`,
        turnCount: 0,
        totalTokens: { prompt: 0, completion: 0, total: 0 },
        deterministicOperationsCount: 0,
        transitions: [],
        status: 'running',
        createdAt,
        updatedAt: createdAt,
      };
      await durableStore.saveState(controllerState);
    }

    await durableStore.appendEvent(
      'phase_transition',
      'ADMISSION',
      currentTier,
      initialSourceRevision,
      { taskId: task.id, status: 'admitted', resumed: resumedFromCheckpoint }
    );

    // =========================================================================
    // PHASE 2: LOAD_CONTEXT
    // =========================================================================
    currentPhase = 'LOAD_CONTEXT';
    controllerState.currentPhase = currentPhase;

    const contextFilePath = path.join(workspacePath, 'CONTEXT.MD');
    let contextMdContent = '';
    try {
      contextMdContent = await fs.readFile(contextFilePath, 'utf8');
      contextData = ContextDocumentManager.parse(contextMdContent);

      const valRes = ContextDocumentManager.validateAgainstFilesystem(
        contextData,
        initialSourceRevision
      );
      if (!valRes.valid) {
        addTraceEvent('output', `Detected discrepancies in existing CONTEXT.MD: ${valRes.conflicts.join('; ')}`);
        await durableStore.appendEvent(
          'context_discrepancy_detected',
          'LOAD_CONTEXT',
          currentTier,
          initialSourceRevision,
          { conflicts: valRes.conflicts }
        );
      }
    } catch {
      // CONTEXT.MD does not exist yet; initialize from facts
      contextData = await ContextDocumentManager.initializeFromObservedFacts(
        workspacePath,
        task,
        initialSourceRevision
      );
      contextMdContent = ContextDocumentManager.serialize(contextData);
      await ContextDocumentManager.writeContextDocument(workspacePath, contextData);
      await durableStore.createCheckpoint(controllerState, contextData);
      addTraceEvent('output', 'Initialized fresh CONTEXT.MD from observed workspace facts.');
    }

    await durableStore.appendEvent(
      'phase_transition',
      'LOAD_CONTEXT',
      currentTier,
      initialSourceRevision,
      { contextLoaded: true }
    );

    // =========================================================================
    // PHASE 3: ANALYZE (Non-LLM first step)
    // =========================================================================
    currentPhase = 'ANALYZE';
    controllerState.currentPhase = currentPhase;
    controllerState.deterministicOperationsCount++;

    const incrementalManager = new IncrementalEditManager(workspacePath, this.approvalEngine);
    await incrementalManager.captureSnapshot();

    const m2Detector = new M2StagnationDetector();
    const diagnosticsHistory: DiagnosticRecord[] = [];
    let avoidedModelRequests = 0;
    let totalPromptTokens: number | null = null;
    let totalCompletionTokens: number | null = null;
    let totalModelCalls = 0;
    let totalCostUsd = 0;
    let pendingHandoff: UniversalHandoffPacket | null = null;
    let pendingBoundedInstructions: string | undefined;
    let taskCompleted = false;
    let lastErrorOutput = '';
    let lastErrorSignature = '';
    let currentModel = this.modelRegistry.getModelForTier('NON_LLM').id;
    let lastAppliedPatch = '';
    let deterministicCpuDurationMs = 0;
    let childProcessCpuMs = 0;
    let inferenceDurationMs = 0;

    // Resumption State Restoration
    if (resumedFromCheckpoint && controllerState) {
      currentTier = controllerState.currentTier;
      if ((currentTier as string) !== 'HALT') {
        currentModel = this.modelRegistry.getModelForTier(currentTier).id;
      }
      if (controllerState.totalTokens.prompt > 0 || controllerState.totalTokens.completion > 0) {
        totalPromptTokens = controllerState.totalTokens.prompt;
        totalCompletionTokens = controllerState.totalTokens.completion;
      }
      avoidedModelRequests = controllerState.deterministicOperationsCount;

      // Restore historical diagnostics and M2 detector attempts from durable evidence
      for (let t = 1; t <= controllerState.turnCount; t++) {
        const evContent = await durableStore.getEvidence(`test-turn-${t}`);
        if (evContent) {
          const exitMatch = evContent.match(/Exit Code:\s*(\d+)/);
          const passedMatch = evContent.match(/Passed:\s*(\d+)/);
          const failedMatch = evContent.match(/Failed:\s*(\d+)/);
          const outputMatch = evContent.match(/Output:\s*([\s\S]*)$/);
          const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : 1;
          const rawOutput = outputMatch ? outputMatch[1] : evContent;

          diagnosticsHistory.push({
            attempt: t,
            rawOutput,
            exitCode,
            passedCount: passedMatch ? parseInt(passedMatch[1], 10) : undefined,
            failedCount: failedMatch ? parseInt(failedMatch[1], 10) : undefined,
          });
          lastErrorOutput = rawOutput;
          lastErrorSignature = `${exitCode}:${rawOutput.slice(0, 100)}`;

          m2Detector.recordAttempt({
            patch: `resumed-turn-${t}`,
            rawError: rawOutput,
            exitCode,
            passedCount: passedMatch ? parseInt(passedMatch[1], 10) : 0,
            failedCount: failedMatch ? parseInt(failedMatch[1], 10) : 1,
          });
        }
      }

      if (contextData?.nextAction?.step?.includes('bounded instructions') && contextData.nextAction.suggestedTier === 'SMALL_LLM') {
        const stepText = contextData.nextAction.step;
        pendingBoundedInstructions = stepText.includes(': ')
          ? stepText.slice(stepText.indexOf(': ') + 2).trim()
          : stepText;
      }

      // Check durable evidence for pending delegation handoff
      for (let t = controllerState.turnCount; t >= 1; t--) {
        const delegationEv = await durableStore.getEvidence(`handoff-turn-${t}-delegation`);
        if (delegationEv) {
          const match = delegationEv.match(/Bounded Instructions:\s*([\s\S]*?)(?:\n---|\nRelevant Files|$)/i);
          if (match && match[1].trim()) {
            pendingBoundedInstructions = match[1].trim();
            break;
          }
        }
      }

      addTraceEvent('output', `Restored ${diagnosticsHistory.length} diagnostic records and M2 loop breaker history from durable store.`);
    }

    // Check if initial workspace already satisfies acceptance tests
    const initialTest = await this.executeAcceptanceTests(workspacePath);
    childProcessCpuMs += initialTest.durationMs;
    if (initialTest.passed) {
      taskCompleted = true;
      currentPhase = 'COMPLETE';
      currentTier = 'NON_LLM';
      addTraceEvent('check', 'Initial acceptance tests passed cleanly with 0 modifications (0 LLM tokens).', {
        passed: true,
        tokens: 0,
      });
    } else if (!lastErrorOutput) {
      lastErrorOutput = initialTest.output;
      lastErrorSignature = `${initialTest.exitCode}:${initialTest.output.slice(0, 100)}`;
    }

    // Compile initial AST context
    let initialContext: ContextCompilationResult | null = null;
    try {
      initialContext = await this.contextCompiler.compileContext(workspacePath, '', task.prompt);
    } catch {
      // Fallback context compilation
    }

    // =========================================================================
    // MAIN EXECUTION LOOP (Phases 4 through 11)
    // =========================================================================
    while (!taskCompleted && controllerState.turnCount < this.maxTurns && (currentPhase as string) !== 'HALTED') {
      controllerState.turnCount++;
      const turn = controllerState.turnCount;
      lastAppliedPatch = '';

      // -----------------------------------------------------------------------
      // PHASE 4: PREPARE
      // -----------------------------------------------------------------------
      currentPhase = 'PREPARE';
      controllerState.currentPhase = currentPhase;

      let tavilyRes: Awaited<ReturnType<typeof TavilyDocumentationVerifier.verifyCodePlanClaims>> | null = null;
      if (this.enableTavily) {
        tavilyRes = await TavilyDocumentationVerifier.verifyCodePlanClaims(task.prompt, this.policy);
        if (tavilyRes.allowed && tavilyRes.injectedContext) {
          addTraceEvent('output', `Tavily documentation verified (${tavilyRes.claimsVerified.length} claims verified)`, {
            turn,
            tier: currentTier,
          });
        }
      }

      await incrementalManager.captureSnapshot();

      // Read current source files for AST analysis & mechanical checks
      const sourceFiles = await this.loadRustSourceFiles(workspacePath);

      // -----------------------------------------------------------------------
      // PHASE 5: SELECT_TIER (Non-LLM first, then Small, then Stronger)
      // -----------------------------------------------------------------------
      currentPhase = 'SELECT_TIER';
      controllerState.currentPhase = currentPhase;
      const previousTier = currentTier;
      let nextTier: ExecutionTier = currentTier;
      let transitionReason = '';

      // 1. Check for mechanical non-LLM candidate if diagnostics exist
      const mechanicalCandidates = MechanicalTransformer.findFixCandidates(
        lastErrorOutput,
        workspacePath,
        sourceFiles
      );

      if (mechanicalCandidates.length > 0 && mechanicalCandidates[0].confidence === 'guaranteed') {
        nextTier = 'NON_LLM';
        transitionReason = `Guaranteed mechanical compiler-guided fix candidate found (${mechanicalCandidates[0].description})`;
      } else if (this.routingPolicy === 'direct_small') {
        nextTier = 'SMALL_LLM';
        transitionReason = 'Direct Small LLM policy enforced';
      } else if (this.routingPolicy === 'direct_frontier') {
        nextTier = 'STRONGER_LLM';
        transitionReason = 'Direct Frontier LLM policy enforced';
      } else if (pendingHandoff && pendingHandoff.targetTier === 'STRONGER_LLM') {
        nextTier = 'STRONGER_LLM';
        transitionReason = `Authorized M3a escalation: ${pendingHandoff.rationale}`;
      } else if (pendingHandoff && pendingHandoff.targetTier === 'SMALL_LLM') {
        if (this.routingPolicy === 'escalation_only') {
          nextTier = 'STRONGER_LLM';
          transitionReason = 'Escalation-only policy forbids downward delegation; retaining Stronger LLM';
        } else {
          nextTier = 'SMALL_LLM';
          transitionReason = `Stronger model delegated implementation to Small LLM with bounded instructions: ${pendingHandoff.rationale}`;
        }
      } else if (pendingBoundedInstructions) {
        if (this.routingPolicy === 'escalation_only') {
          nextTier = 'STRONGER_LLM';
          transitionReason = 'Escalation-only policy forbids downward delegation; retaining Stronger LLM';
        } else {
          nextTier = 'SMALL_LLM';
          transitionReason = 'Stronger model delegated implementation to Small LLM with bounded instructions';
        }
      } else if (currentTier === 'STRONGER_LLM') {
        // Retain Stronger LLM unless deterministic controller sees localized remaining subtask
        if (this.routingPolicy === 'bidirectional_adaptive' && diagnosticsHistory.length > 0) {
          const latestDiag = diagnosticsHistory[diagnosticsHistory.length - 1];
          if (latestDiag.failedCount === 1 && latestDiag.passedCount && latestDiag.passedCount > 0) {
            nextTier = 'SMALL_LLM';
            transitionReason = 'Deterministic controller downgrade: complex architectural pass passed, localized test failure remaining';
            pendingBoundedInstructions = `Resolve remaining localized failure in ${latestDiag.rawOutput.slice(0, 300)}`;
          } else {
            nextTier = 'STRONGER_LLM';
            transitionReason = 'Continue in Stronger LLM for ongoing complex task resolution';
          }
        } else {
          nextTier = 'STRONGER_LLM';
          transitionReason = 'Continue in Stronger LLM for ongoing complex task resolution';
        }
      } else if (this.routingPolicy === 'escalation_only') {
        nextTier = 'SMALL_LLM';
        transitionReason = 'Escalation-only policy starts in Small LLM';
      } else if (initialContext) {
        // Deterministic evidence-based model selection
        const decision = this.modelSelector.selectModel(initialContext, diagnosticsHistory, task.prompt);
        if (decision.strategy === 'direct_frontier') {
          nextTier = 'STRONGER_LLM';
          transitionReason = `Direct Stronger LLM allocated by policy: ${decision.rationale[0]}`;
        } else {
          nextTier = 'SMALL_LLM';
          transitionReason = `Small LLM allocated for localized task: ${decision.rationale[0]}`;
        }
      } else {
        nextTier = 'SMALL_LLM';
        transitionReason = 'Default Small LLM allocation for coding task';
      }

      // Handle Tier Transition
      if (nextTier !== currentTier) {
        const transRecord: TierTransitionRecord = {
          id: `trans-${turn}-${Date.now()}`,
          fromTier: currentTier,
          toTier: nextTier,
          reason: transitionReason,
          timestamp: new Date().toISOString(),
          sourceRevision: await ContextDocumentManager.computeSourceRevision(workspacePath),
          authorizedBy: 'host_engine',
        };

        // Oscillation Check
        if (this.enableOscillationBreaker && (nextTier === 'SMALL_LLM' || nextTier === 'STRONGER_LLM')) {
          const oscCheck = this.oscillationDetector.recordTransition(transRecord, lastErrorSignature);
          if (oscCheck.oscillating) {
            addTraceEvent('error', `Oscillation Hazard: ${oscCheck.reason}`, {
              turn,
              fromTier: currentTier,
              toTier: nextTier,
              pattern: oscCheck.patternDetected,
            });
            currentPhase = 'HALTED';
            currentTier = 'HALT';
            controllerState.status = 'halted';
            controllerState.failureReason = oscCheck.reason;
            break;
          }
        }

        currentTier = nextTier;
        controllerState.currentTier = currentTier;
        controllerState.transitions.push(transRecord);

        if ((currentTier as string) !== 'HALT') {
          currentModel = this.modelRegistry.getModelForTier(currentTier).id;
        }

        addTraceEvent(
          'output',
          `Tier transition: ${previousTier} ➔ ${currentTier} (Model: ${currentModel}) [Reason: ${transitionReason}]`,
          { turn, fromTier: previousTier, toTier: currentTier, model: currentModel }
        );

        if (contextData) {
          contextData.verifiedProgress.push({
            id: `trans-${turn}`,
            type: 'check',
            description: `Tier transitioned: ${previousTier} ➔ ${currentTier} (${transitionReason})`,
            timestamp: transRecord.timestamp,
            revision: transRecord.sourceRevision,
          });
        }

        await durableStore.appendEvent(
          'tier_transition',
          'SELECT_TIER',
          currentTier,
          transRecord.sourceRevision,
          transRecord as unknown as Record<string, unknown>
        );
      }

      // -----------------------------------------------------------------------
      // PHASE 6: INFER_OR_EXECUTE
      // -----------------------------------------------------------------------
      currentPhase = 'INFER_OR_EXECUTE';
      controllerState.currentPhase = currentPhase;

      let appliedModificationsCount = 0;
      let allActionsApproved = true;

      if (currentTier === 'NON_LLM') {
        avoidedModelRequests++;
        controllerState.deterministicOperationsCount++;
        addTraceEvent('output', `Executing in NON_LLM deterministic tier (avoided model request count: ${avoidedModelRequests})`, {
          turn,
          tier: currentTier,
          avoidedRequests: avoidedModelRequests,
        });

        if (mechanicalCandidates.length > 0) {
          const appliedFiles = new Set<string>();
          for (const candidate of mechanicalCandidates) {
            if (appliedFiles.has(candidate.filePath)) continue;
            addTraceEvent('output', `Applying mechanical fix: ${candidate.description}`);
            const mechResult = await MechanicalTransformer.applyCandidate(
              candidate,
              workspacePath,
              this.approvalEngine,
              turn
            );

            if (mechResult.applied && mechResult.filePath) {
              appliedFiles.add(candidate.filePath);
              appliedModificationsCount++;
              lastAppliedPatch = candidate.fullFileContent || '';
              const patchSuffix = candidate.filePath.replace(/[^a-zA-Z0-9_-]/g, '_');
              await durableStore.savePatch(`patch-turn-${turn}-mech-${patchSuffix}`, {
                type: candidate.type,
                path: mechResult.filePath,
                afterHash: ContextCompiler.computeRevision(candidate.fullFileContent || ''),
                patchContent: candidate.description,
              });
              addTraceEvent('output', `Mechanical fix applied to ${mechResult.filePath} (${mechResult.bytesWritten} bytes)`);
            } else {
              addTraceEvent('error', `Mechanical fix failed or was rejected: ${mechResult.error}`);
              allActionsApproved = false;
            }
          }
        }
      } else {
        // LLM Tier: SMALL_LLM or STRONGER_LLM
        addTraceEvent('output', `Dispatching turn ${turn} to ${currentTier} model (${currentModel}) through Bifrost Gateway`, {
          turn,
          tier: currentTier,
          model: currentModel,
          hasHandoff: !!pendingHandoff,
          hasBoundedInstructions: !!pendingBoundedInstructions,
        });

        // 1. Context Compilation
        const modelDesc = this.modelRegistry.getModel(currentModel);
        const modelContextWindow = modelDesc?.contextWindow ?? 4096;
        const isStronger = currentTier === 'STRONGER_LLM';
        const targetInputBudget = isStronger
          ? Math.min(5000, modelContextWindow - 1400)
          : Math.min(2600, modelContextWindow - 1400);
        const targetContextBudget = isStronger
          ? Math.min(3500, Math.max(1200, targetInputBudget - 700))
          : Math.min(2000, Math.max(800, targetInputBudget - 700));

        const contextCompiler = new ContextCompiler({
          maxTokenBudget: targetContextBudget,
          allowBudgetExpansion: true,
          maxExpandedBudget: Math.max(targetContextBudget + 500, 2500),
        });
        const contextResult = await contextCompiler.compileContext(
          workspacePath,
          lastErrorOutput,
          task.prompt
        );

        // 2. Prompt Compilation
        const maxOutputBudget = Math.min(2048, Math.max(1024, modelContextWindow - targetInputBudget - 200));
        const compiledPrompt = PromptCompiler.compile({
          task,
          contextResult,
          diagnosticsHistory,
          tavilyEvidence: tavilyRes?.injectedContext
            ? {
                claimsVerified: tavilyRes.claimsVerified.map((c) => ({
                  text: c.claimText,
                  outcome: c.outcome,
                  freshness: c.freshness,
                })),
                injectedContext: tavilyRes.injectedContext,
              }
            : undefined,
          m3aAutopsyPacket: pendingHandoff?.formattedText,
          boundedInstructions: pendingBoundedInstructions ?? pendingHandoff?.boundedInstructions,
          incrementalEditsNotice: incrementalManager.getIncrementalNotice() ?? undefined,
          maxInputBudget: targetInputBudget,
          maxOutputBudget,
          activeModel: currentModel,
        });

        // Clear consumed handoff packet
        pendingHandoff = null;
        pendingBoundedInstructions = undefined;

        // 3. Bifrost Gateway Request
        const callStart = performance.now();
        let gatewayResponse;
        try {
          gatewayResponse = await this.bifrostClient.createChatCompletion({
            model: currentModel,
            messages: compiledPrompt.messages,
            max_tokens: compiledPrompt.allocatedOutputBudget ?? maxOutputBudget,
          });
          inferenceDurationMs += performance.now() - callStart;
          totalModelCalls++;
        } catch (gatewayErr) {
          inferenceDurationMs += performance.now() - callStart;
          totalModelCalls++;
          addTraceEvent('error', `Bifrost gateway error: ${(gatewayErr as Error).message}`, {
            turn,
            tier: currentTier,
            model: currentModel,
          });
          currentPhase = 'HALTED';
          controllerState.status = 'failed';
          controllerState.failureReason = (gatewayErr as Error).message;
          break;
        }

        // Token Accounting
        if (typeof gatewayResponse.usage?.prompt_tokens === 'number') {
          totalPromptTokens = (totalPromptTokens ?? 0) + gatewayResponse.usage.prompt_tokens;
          controllerState.totalTokens.prompt = totalPromptTokens;
        }
        if (typeof gatewayResponse.usage?.completion_tokens === 'number') {
          totalCompletionTokens = (totalCompletionTokens ?? 0) + gatewayResponse.usage.completion_tokens;
          controllerState.totalTokens.completion = totalCompletionTokens;
        }
        if (totalPromptTokens !== null && totalCompletionTokens !== null) {
          controllerState.totalTokens.total = totalPromptTokens + totalCompletionTokens;
        }
        if (gatewayResponse.bifrost_metadata) {
          totalCostUsd += gatewayResponse.bifrost_metadata.cost_usd;
        }

        const modelOutput = gatewayResponse.choices?.[0]?.message?.content || '';
        const callLatencyMs = Math.round(performance.now() - callStart);

        addTraceEvent(
          'output',
          `Inference turn ${turn} completed by ${gatewayResponse.model || currentModel} (${gatewayResponse.usage?.prompt_tokens ?? 0} in, ${gatewayResponse.usage?.completion_tokens ?? 0} out)`,
          {
            modelInference: {
              turn,
              tier: currentTier,
              requestedModel: currentModel,
              actualModel: gatewayResponse.model || currentModel,
              provider: gatewayResponse.bifrost_metadata?.provider || (gatewayResponse.bifrost_metadata?.fallback_invoked ? 'fallback' : 'local-llamacpp'),
              routingMetadata: {
                latencyMs: callLatencyMs,
                ...gatewayResponse.bifrost_metadata,
              },
              promptTokens: gatewayResponse.usage?.prompt_tokens ?? 0,
              completionTokens: gatewayResponse.usage?.completion_tokens ?? 0,
              totalTokens: (gatewayResponse.usage?.prompt_tokens ?? 0) + (gatewayResponse.usage?.completion_tokens ?? 0),
              sourceRevision: await ContextDocumentManager.computeSourceRevision(workspacePath),
              transitionReason: controllerState.transitions[controllerState.transitions.length - 1]?.reason,
              boundedInstructions: pendingBoundedInstructions,
              timestamp: new Date().toISOString(),
            },
          }
        );

        // 4. Check for Model Transition Proposal (e.g. Stronger -> Small delegation)
        const proposal: TierTransitionProposal | null = UniversalHandoffProtocol.parseTransitionProposal(
          modelOutput,
          currentModel
        );
        if (proposal) {
          if (this.routingPolicy === 'direct_small' && proposal.targetTier === 'STRONGER_LLM') {
            addTraceEvent('output', 'Rejected model transition proposal to STRONGER_LLM: direct_small policy enforced');
          } else if (this.routingPolicy === 'direct_frontier' && proposal.targetTier === 'SMALL_LLM') {
            addTraceEvent('output', 'Rejected model transition proposal to SMALL_LLM: direct_frontier policy enforced');
          } else if (this.routingPolicy === 'escalation_only' && proposal.targetTier === 'SMALL_LLM') {
            addTraceEvent('output', 'Rejected model transition proposal to SMALL_LLM: escalation_only policy enforced');
          } else {
            const val = UniversalHandoffProtocol.validateProposal(proposal, currentTier, {
            modelRegistry: this.modelRegistry,
            policy: this.policy,
            currentBudgetUsedUsd: totalCostUsd,
            diagnosticsAvailable: diagnosticsHistory.length > 0,
          });
          if (val.valid) {
            addTraceEvent(
              'output',
              `Model ${currentModel} proposed tier transition to ${proposal.targetTier}: ${proposal.rationale}`,
              { turn, proposal }
            );
            if (proposal.targetTier === 'SMALL_LLM' && proposal.boundedInstructions) {
              pendingBoundedInstructions = proposal.boundedInstructions;
              const smallModelId = this.modelRegistry.getModelForTier('SMALL_LLM').id;
              pendingHandoff = UniversalHandoffProtocol.createHandoff({
                id: `handoff-turn-${turn}-delegation`,
                direction: 'stronger_to_small',
                sourceTier: 'STRONGER_LLM',
                targetTier: 'SMALL_LLM',
                sourceModel: currentModel,
                targetModel: smallModelId,
                rationale: proposal.rationale,
                taskId: task.id,
                relevantFiles: Object.keys(sourceFiles),
                boundedInstructions: proposal.boundedInstructions,
              });
              await durableStore.saveEvidence(
                `handoff-turn-${turn}-delegation`,
                pendingHandoff.formattedText
              );
              await durableStore.appendEvent(
                'handoff_created',
                'INFER_OR_EXECUTE',
                currentTier,
                await ContextDocumentManager.computeSourceRevision(workspacePath),
                { handoffId: pendingHandoff.id, direction: pendingHandoff.direction, targetTier: 'SMALL_LLM' }
              );
              m2Detector.reset();
            } else if (proposal.targetTier === 'STRONGER_LLM') {
              const strongerModelId = this.modelRegistry.getModelForTier('STRONGER_LLM').id;
              const latestDiag = diagnosticsHistory[diagnosticsHistory.length - 1];
              pendingHandoff = UniversalHandoffProtocol.createHandoff({
                id: `handoff-turn-${turn}-escalation`,
                direction: 'small_to_stronger',
                sourceTier: 'SMALL_LLM',
                targetTier: 'STRONGER_LLM',
                sourceModel: currentModel,
                targetModel: strongerModelId,
                rationale: proposal.rationale,
                taskId: task.id,
                relevantFiles: Object.keys(sourceFiles),
                diagnostics: latestDiag
                  ? {
                      exitCode: latestDiag.exitCode,
                      passedCount: latestDiag.passedCount ?? 0,
                      failedCount: latestDiag.failedCount ?? 1,
                      failingTestNames: [],
                      compilerErrorCodes: [],
                      rawOutputSnippet: latestDiag.rawOutput.slice(0, 500),
                    }
                  : undefined,
              });
              await durableStore.saveEvidence(
                `handoff-turn-${turn}-escalation`,
                pendingHandoff.formattedText
              );
              await durableStore.appendEvent(
                'handoff_created',
                'INFER_OR_EXECUTE',
                currentTier,
                await ContextDocumentManager.computeSourceRevision(workspacePath),
                { handoffId: pendingHandoff.id, direction: pendingHandoff.direction, targetTier: 'STRONGER_LLM' }
              );
            }
          } else {
            addTraceEvent(
              'check',
              `Rejected model transition proposal to ${proposal.targetTier}: ${val.reason}`,
              { turn, proposal, rejectionReason: val.reason }
            );
          }
          }
        }

        // 5. Parse and apply code edits (Phases 7 & 8: VALIDATE & APPROVAL)
        // ---------------------------------------------------------------------
        currentPhase = 'VALIDATE';
        controllerState.currentPhase = currentPhase;

        const proposedMods = incrementalManager.parseProposedModifications(modelOutput);
        if (proposedMods.length > 0) {
          currentPhase = 'APPROVAL';
          controllerState.currentPhase = currentPhase;

          const editResult = await incrementalManager.applyModifications(proposedMods, turn);
          if (editResult.appliedModifications.length > 0) {
            appliedModificationsCount += editResult.appliedModifications.length;
            for (const ap of editResult.appliedModifications) {
              addTraceEvent(
                'output',
                `Host approval granted & applied ${ap.type} to ${ap.path} (${ap.bytesWritten} bytes, rev: ${ap.newRevision}).`,
                { turn, path: ap.path, revision: ap.newRevision }
              );
            }
            lastAppliedPatch = proposedMods.map((m) => m.replaceBlock || m.content || '').join('\n');
            allActionsApproved = true;
          }
          if (editResult.errors.length > 0) {
            for (const err of editResult.errors) {
              addTraceEvent(
                editResult.appliedModifications.length > 0 ? 'check' : 'error',
                `Edit validation issue: ${err}`,
                { turn, tier: currentTier }
              );
            }
            if (editResult.appliedModifications.length === 0) {
              allActionsApproved = false;
            }
          }
        } else {
          // Fallback to full file block / tool call parsing
          const fullFileMods = this.parseFallbackFileModifications(modelOutput, incrementalManager.getResolutionContext());
          if (fullFileMods.length === 0 && !pendingBoundedInstructions) {
            addTraceEvent('error', `Turn ${turn}: No actionable file modifications found in ${currentModel} response.`);
          } else {
            currentPhase = 'APPROVAL';
            controllerState.currentPhase = currentPhase;

            for (const mod of fullFileMods) {
              const normalizedPath = path.normalize(mod.path).replace(/^[/\\]+/, '');
              if (normalizedPath.startsWith('..') || path.isAbsolute(normalizedPath)) {
                addTraceEvent('error', `Security rejection: path traversal in '${mod.path}'`);
                allActionsApproved = false;
                break;
              }

              const targetAbsPath = path.resolve(workspacePath, normalizedPath);
              if (!targetAbsPath.startsWith(path.resolve(workspacePath))) {
                addTraceEvent('error', `Security rejection: escapes workspace in '${mod.path}'`);
                allActionsApproved = false;
                break;
              }

              const action: ProposedToolAction = {
                id: `act-${turn}-${Date.now()}`,
                tool: 'write_file',
                parameters: { path: normalizedPath, content: mod.content },
                category: 'write',
              };

              const approval = await this.approvalEngine.evaluateAction(action);
              if (!approval.approved) {
                addTraceEvent('error', `Host approval rejected action: ${approval.reason}`);
                allActionsApproved = false;
                break;
              }

              await fs.mkdir(path.dirname(targetAbsPath), { recursive: true });
              await fs.writeFile(targetAbsPath, mod.content, 'utf8');
              appliedModificationsCount++;
              lastAppliedPatch = mod.content;
              addTraceEvent('output', `Wrote updated content to ${normalizedPath} (${mod.content.length} bytes)`);
            }
          }
        }
      }

      if (!allActionsApproved) {
        if (currentTier === 'SMALL_LLM' && this.routingPolicy !== 'direct_small') {
          // Escalate to STRONGER_LLM when SMALL_LLM fails to produce an applicable patch
          const strongerModelId = this.modelRegistry.getModelForTier('STRONGER_LLM').id;
          pendingHandoff = UniversalHandoffProtocol.createHandoff({
            id: `handoff-${turn}-unapplicable`,
            direction: 'small_to_stronger',
            sourceTier: 'SMALL_LLM',
            targetTier: 'STRONGER_LLM',
            sourceModel: currentModel,
            targetModel: strongerModelId,
            rationale: 'Small LLM proposed unapplicable patch; escalating to stronger reasoning model.',
            taskId: task.id,
            relevantFiles: Object.keys(sourceFiles),
            diagnostics: {
              exitCode: 1,
              passedCount: 0,
              failedCount: 1,
              failingTestNames: [],
              compilerErrorCodes: [],
              rawOutputSnippet: 'Small LLM proposed search-and-replace block that did not match target file.',
            },
          });
          addTraceEvent('check', `Small LLM patch unapplicable; escalating to ${strongerModelId} for turn ${turn + 1}`, {
            turn,
            tier: currentTier,
          });
          continue;
        }
        break;
      }

      addTraceEvent('output', `Turn ${turn} modifications verified: ${appliedModificationsCount} total modifications staged.`);

      // =======================================================================
      // PHASE 9: VERIFY (Non-LLM independent verification)
      // =======================================================================
      currentPhase = 'VERIFY';
      controllerState.currentPhase = currentPhase;
      controllerState.deterministicOperationsCount++;

      const testResult = await this.executeAcceptanceTests(workspacePath);
      childProcessCpuMs += testResult.durationMs;
      lastErrorOutput = testResult.output;
      lastErrorSignature = `${testResult.exitCode}:${testResult.output.slice(0, 100)}`;

      diagnosticsHistory.push({
        attempt: turn,
        rawOutput: testResult.output,
        exitCode: testResult.exitCode,
        passedCount: testResult.passedCount,
        failedCount: testResult.failedCount,
      });

      await durableStore.saveEvidence(
        `test-turn-${turn}`,
        `Exit Code: ${testResult.exitCode}\nPassed: ${testResult.passedCount}\nFailed: ${testResult.failedCount}\nOutput:\n${testResult.output}`
      );

      if (testResult.passed) {
        taskCompleted = true;
        currentPhase = 'COMPLETE';
        currentTier = 'NON_LLM';
        addTraceEvent('check', `Acceptance tests passed cleanly on turn ${turn}!`, {
          turn,
          passed: true,
          exitCode: 0,
        });
      } else {
        addTraceEvent(
          'check',
          `Acceptance tests failed on turn ${turn} (Passed: ${testResult.passedCount}, Failed: ${testResult.failedCount})`,
          { turn, passed: false, exitCode: testResult.exitCode }
        );
      }

      // =======================================================================
      // PHASE 10: CHECKPOINT
      // =======================================================================
      currentPhase = taskCompleted ? 'COMPLETE' : 'CHECKPOINT';
      controllerState.currentPhase = currentPhase;

      const currentSourceRevision = await ContextDocumentManager.computeSourceRevision(workspacePath);
      controllerState.sourceRevision = currentSourceRevision;
      controllerState.stateRevision = `state-${Date.now()}`;
      controllerState.updatedAt = new Date().toISOString();

      if (contextData) {
        contextData.checkpoint.sourceRevision = currentSourceRevision;
        contextData.checkpoint.stateRevision = controllerState.stateRevision;
        contextData.checkpoint.timestamp = controllerState.updatedAt;
        contextData.activeTask.currentPhase = currentPhase;
        contextData.activeTask.responsibleTier = currentTier;

        if (taskCompleted) {
          contextData.verifiedProgress.push({
            id: `prog-${turn}`,
            type: 'test',
            description: `Acceptance tests passed on turn ${turn}`,
            timestamp: controllerState.updatedAt,
            revision: currentSourceRevision,
          });
          contextData.nextAction = {
            step: 'Task verified and complete',
            requiredEvidence: 'Clean cargo test execution',
            suggestedTier: 'NON_LLM',
          };
        } else {
          contextData.knownFailures.push({
            id: `fail-${turn}`,
            errorType: 'test_failure',
            details: testResult.output.slice(0, 150),
            attemptNumber: turn,
          });
          contextData.nextAction = {
            step: pendingBoundedInstructions
              ? `Execute bounded instructions in Small LLM: ${pendingBoundedInstructions}`
              : 'Escalate to stronger model via diagnostic handoff',
            requiredEvidence: 'Compiler error resolution',
            suggestedTier: pendingBoundedInstructions ? 'SMALL_LLM' : 'STRONGER_LLM',
          };
        }

        await ContextDocumentManager.writeContextDocument(workspacePath, contextData);
      }

      await durableStore.saveState(controllerState);
      await durableStore.createCheckpoint(controllerState, contextData!);

      if (taskCompleted) {
        break;
      }

      // =======================================================================
      // PHASE 11: DECIDE (Loop Breaker, Escalation, or Follow-up)
      // =======================================================================
      currentPhase = 'DECIDE';
      controllerState.currentPhase = currentPhase;

      const stagnation = m2Detector.recordAttempt({
        patch: lastAppliedPatch,
        rawError: testResult.output,
        exitCode: testResult.exitCode,
        passedCount: testResult.passedCount,
        failedCount: testResult.failedCount,
      });

      if (stagnation.shouldHalt) {
        if (pendingHandoff && (pendingHandoff as { direction?: string }).direction === 'stronger_to_small') {
          // Bounded downward delegation in progress; allow small LLM to proceed without stagnation halt
          m2Detector.reset();
        } else {
          addTraceEvent('error', `M2 Stagnation detected: ${stagnation.message}`, {
            turn,
            stagnationReason: stagnation.reason,
          });

          if (currentTier === 'SMALL_LLM' && this.routingPolicy !== 'direct_small') {
          // Build M3a Failure Autopsy and prepare escalation to STRONGER_LLM
          const strongerModelId = this.modelRegistry.getModelForTier('STRONGER_LLM').id;
          const autopsy = M3aFailureAutopsyBuilder.buildAutopsyPacket({
            taskId: task.id,
            taskTitle: task.title,
            taskPrompt: task.prompt,
            attempts: m2Detector.getAttempts(),
            stagnationReason: stagnation.message,
            escalationModel: strongerModelId,
            maxTokenBudget: 600,
          });

          pendingHandoff = UniversalHandoffProtocol.createHandoff({
            id: `handoff-${turn}`,
            direction: 'small_to_stronger',
            sourceTier: 'SMALL_LLM',
            targetTier: 'STRONGER_LLM',
            sourceModel: currentModel,
            targetModel: strongerModelId,
            rationale: stagnation.message || 'M2 loop breaker triggered stagnation',
            taskId: task.id,
            relevantFiles: Object.keys(sourceFiles),
            diagnostics: {
              exitCode: testResult.exitCode,
              passedCount: testResult.passedCount,
              failedCount: testResult.failedCount,
              failingTestNames: [],
              compilerErrorCodes: [],
              rawOutputSnippet: testResult.output.slice(0, 500),
            },
            priorAttemptsSummary: autopsy.formattedPacket,
            tokenBudget: 600,
          });

          addTraceEvent(
            'output',
            `Prepared M3a diagnostic escalation packet for Stronger LLM (${strongerModelId})`,
            { turn, targetModel: strongerModelId }
          );
          m2Detector.reset();
        } else {
          // Already in STRONGER_LLM and stagnated: halt execution
          currentPhase = 'HALTED';
          currentTier = 'HALT';
          controllerState.status = 'halted';
          controllerState.failureReason = `Stagnation in ${currentTier}: ${stagnation.message}`;
          break;
        }
      }
    }
    }

    // =========================================================================
    // PHASE 12: COMPLETE / HALT
    // =========================================================================
    const executionDurationMs = performance.now() - startTime;
    if (taskCompleted) {
      currentPhase = 'COMPLETE';
      currentTier = 'NON_LLM';
      controllerState.status = 'completed';
    } else if ((currentPhase as string) !== 'HALTED') {
      currentPhase = 'HALTED';
      controllerState.status = 'halted';
      controllerState.failureReason = controllerState.failureReason ?? `Exceeded maximum turn limit (${this.maxTurns})`;
    }

    controllerState.currentPhase = currentPhase;
    controllerState.currentTier = currentTier;
    controllerState.updatedAt = new Date().toISOString();
    await durableStore.saveState(controllerState);

    if (contextData) {
      contextData.activeTask.currentPhase = currentPhase;
      contextData.activeTask.responsibleTier = currentTier;
      contextData.checkpoint.timestamp = controllerState.updatedAt;
      if (taskCompleted && !contextData.verifiedProgress.some((p) => p.type === 'test')) {
        contextData.verifiedProgress.push({
          id: 'prog-final-verified',
          type: 'test',
          description: 'Acceptance tests verified and passed cleanly',
          timestamp: controllerState.updatedAt,
          revision: controllerState.sourceRevision,
        });
      }
      await ContextDocumentManager.writeContextDocument(workspacePath, contextData);
      await durableStore.createCheckpoint(controllerState, contextData);
    }

    const finalContextMd = await fs.readFile(contextFilePath, 'utf8').catch(() => '');

    const finalTrace: ExecutionTrace = ExecutionTrace.parse({
      version: '1',
      runId,
      events: traceEvents,
    });

    const acceptance: AcceptanceResult = AcceptanceResult.parse({
      version: '1',
      status: taskCompleted ? 'passed' : 'failed',
      method: 'cargo_test_direct',
      checks: task.acceptance.map((criterion, idx) => ({
        name: `acceptance_criterion_${idx + 1}`,
        passed: taskCompleted,
        evidence: taskCompleted
          ? 'Acceptance tests compiled and passed cleanly with exit code 0'
          : lastErrorOutput || 'Acceptance test failed',
      })),
    });

    const runCpuUsage = process.cpuUsage(runCpuStart);
    deterministicCpuDurationMs = Math.max(1, (runCpuUsage.user + runCpuUsage.system) / 1000);

    const usage: UsageRecord = UsageRecord.parse({
      version: '1',
      inputTokens:
        totalPromptTokens !== null
          ? {
              status: 'known',
              value: totalPromptTokens,
              unit: 'tokens',
              source: 'bifrost.gateway.prompt_tokens',
              scope: 'proofbench_engine_turns_cumulative',
            }
          : (avoidedModelRequests > 0 && totalModelCalls === 0)
            ? {
                status: 'known',
                value: 0,
                unit: 'tokens',
                source: 'deterministic.non_llm_execution',
                scope: 'non_llm_deterministic_pass (0 model requests dispatched)',
              }
            : {
                status: 'missing',
                reason: 'No prompt token observations reported by provider',
              },
      outputTokens:
        totalCompletionTokens !== null
          ? {
              status: 'known',
              value: totalCompletionTokens,
              unit: 'tokens',
              source: 'bifrost.gateway.completion_tokens',
              scope: 'proofbench_engine_turns_cumulative',
            }
          : (avoidedModelRequests > 0 && totalModelCalls === 0)
            ? {
                status: 'known',
                value: 0,
                unit: 'tokens',
                source: 'deterministic.non_llm_execution',
                scope: 'non_llm_deterministic_pass (0 model requests dispatched)',
              }
            : {
                status: 'missing',
                reason: 'No completion token observations reported by provider',
              },
      duration: {
        status: 'known',
        value: Math.max(1, Math.round(executionDurationMs)),
        unit: 'ms',
        source: 'performance.now',
        scope: `total engine session duration (CPU: ${Math.round(deterministicCpuDurationMs)}ms via process.cpuUsage, Inference: ${Math.round(inferenceDurationMs)}ms)`,
      },
      cost:
        this.bifrostClient.mode === 'live' && isLocalDestination(this.bifrostClient.gatewayUrl)
          ? {
              status: 'known',
              value: 0.0,
              unit: 'USD',
              source: 'bifrost.gateway',
              scope: 'local inference host execution ($0.00 direct provider cost)',
            }
          : {
              status: 'estimated',
              value: Number(totalCostUsd.toFixed(6)),
              unit: 'USD',
              source: 'bifrost.gateway',
              method: 'pricing_model_v1',
              scope: 'bifrost virtual key debits',
            },
    });

    const descriptor: AgentDescriptor = AgentDescriptor.parse({
      version: '1',
      id: 'bifrost-01',
      name: 'ProofBench Adaptive Execution Engine v1',
      implementation: '01',
      runtime: 'typescript',
      revision: '0.1.0',
      model: currentModel,
    });

    const runRecord: RunRecord = RunRecord.parse({
      version: '1',
      id: runId,
      task,
      agent: descriptor,
      status: taskCompleted ? 'completed' : 'failed',
      output: taskCompleted
        ? `Successfully solved task ${task.id} with verified acceptance tests.`
        : `Failed task ${task.id}. Final error: ${lastErrorOutput || controllerState.failureReason}`,
      usage,
      acceptance,
      createdAt,
      reportId,
      reproducibility: {
        seed: runOptions.seed ?? 0,
        adapterRevision: '0.1.0',
        fixtureRevision: task.fixtureId ?? 'unknown',
        environment: `proofbench-adaptive-engine-${process.platform}`,
        simulated: this.bifrostClient.mode === 'simulation',
      },
    });

    const evidenceReport: EvidenceReport = EvidenceReport.parse({
      version: '1',
      id: reportId,
      runId,
      createdAt,
      summary: `Adaptive Execution Engine on ${task.title}: ${taskCompleted ? 'PASSED' : 'FAILED'}`,
      acceptance,
      usage,
      verification: null,
      limitations: [
        'Deterministic state machine orchestrates dynamic transitions between NON_LLM, SMALL_LLM, and STRONGER_LLM.',
        'CONTEXT.MD acts as universal project memory snapshot at workspace root.',
        '.proofbench/ durable state with atomic checkpoints and interrupted-write recovery.',
        'Independent acceptance test execution verified through cargo test.',
      ],
    });

    if (workspace) {
      await workspace.destroy();
    }

    return {
      run: runRecord,
      trace: finalTrace,
      report: evidenceReport,
      contextDocument: finalContextMd,
      controllerState,
      avoidedModelRequests,
      deterministicOperationsCount: controllerState.deterministicOperationsCount,
      transitionsCount: controllerState.transitions.length,
      deterministicCpuDurationMs: Math.max(1, Math.round(deterministicCpuDurationMs)),
      controllerCpuMs: Math.max(1, Math.round(deterministicCpuDurationMs)),
      testSubprocessWallMs: Math.round(childProcessCpuMs),
      subprocessCpuMs: null,
      childProcessCpuMs: Math.round(childProcessCpuMs),
      wallDurationMs: Math.max(1, Math.round(performance.now() - startTime)),
      inferenceDurationMs: Math.round(inferenceDurationMs),
    };
  }

  private async executeAcceptanceTests(
    workspacePath: string
  ): Promise<{ passed: boolean; output: string; exitCode: number; passedCount: number; failedCount: number; durationMs: number }> {
    const ws = new TaskWorkspace('acceptance-verification', workspacePath, 'ws-verify');
    return ws.runAcceptanceTests(30_000);
  }

  private async loadRustSourceFiles(workspacePath: string): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const srcDir = path.join(workspacePath, 'src');
    try {
      const entries = await fs.readdir(srcDir, { recursive: true });
      for (const entry of entries) {
        const str = entry.toString();
        if (str.endsWith('.rs')) {
          const fullPath = path.join(srcDir, str);
          const stat = await fs.stat(fullPath);
          if (stat.isFile()) {
            const content = await fs.readFile(fullPath, 'utf8');
            map.set(path.join('src', str), content);
          }
        }
      }
    } catch {
      // Empty or non-standard workspace layout
    }
    return map;
  }

  private parseFallbackFileModifications(
    content: string,
    context?: FileResolutionContext
  ): Array<{ path: string; content: string }> {
    const mods = IncrementalEditManager.parseProposedModifications(content, context);
    return mods
      .filter((m) => m.type === 'full_file' && m.path && !m.unresolved && m.content)
      .map((m) => ({ path: m.path, content: m.content! }));
  }

  private buildFailureResult(
    runId: string,
    reportId: string,
    createdAt: string,
    task: TaskSpec,
    startTime: number,
    traceEvents: ExecutionTrace['events'],
    reason: string,
    runCpuStart?: NodeJS.CpuUsage
  ): EngineExecutionResult {
    const duration = performance.now() - startTime;
    const cpuDuration = runCpuStart
      ? Math.max(1, Math.round((process.cpuUsage(runCpuStart).user + process.cpuUsage(runCpuStart).system) / 1000))
      : Math.max(1, Math.round(duration));
    const finalTrace = ExecutionTrace.parse({
      version: '1',
      runId,
      events: traceEvents,
    });
    const descriptor = AgentDescriptor.parse({
      version: '1',
      id: 'bifrost-01',
      name: 'ProofBench Adaptive Execution Engine v1',
      implementation: '01',
      runtime: 'typescript',
      revision: '0.1.0',
      model: null,
    });
    const acceptance = AcceptanceResult.parse({
      version: '1',
      status: 'failed',
      method: 'cargo_test_direct',
      checks: [
        {
          name: 'workspace_admission',
          passed: false,
          evidence: reason,
        },
      ],
    });
    const usage = UsageRecord.parse({
      version: '1',
      inputTokens: { status: 'missing', reason },
      outputTokens: { status: 'missing', reason },
      duration: { status: 'known', value: Math.max(1, Math.round(duration)), unit: 'ms', source: 'performance.now', scope: 'session' },
      cost: { status: 'known', value: 0, unit: 'USD', source: 'bifrost.gateway', scope: 'failed' },
    });
    const runRecord = RunRecord.parse({
      version: '1',
      id: runId,
      task,
      agent: descriptor,
      status: 'failed',
      output: reason,
      usage,
      acceptance,
      createdAt,
      reportId,
      reproducibility: {
        seed: 0,
        adapterRevision: '0.1.0',
        fixtureRevision: task.fixtureId ?? 'unknown',
        environment: `proofbench-adaptive-engine-${process.platform}`,
        simulated: true,
      },
    });
    const evidenceReport = EvidenceReport.parse({
      version: '1',
      id: reportId,
      runId,
      createdAt,
      summary: `Failed task ${task.id}: ${reason}`,
      acceptance,
      usage,
      verification: null,
      limitations: ['Engine failure during admission phase.'],
    });

    return {
      run: runRecord,
      trace: finalTrace,
      report: evidenceReport,
      contextDocument: '',
      controllerState: {
        version: '1',
        runId,
        taskId: task.id,
        currentPhase: 'HALTED',
        currentTier: 'HALT',
        sourceRevision: '',
        stateRevision: '',
        turnCount: 0,
        totalTokens: { prompt: 0, completion: 0, total: 0 },
        deterministicOperationsCount: 0,
        transitions: [],
        status: 'failed',
        failureReason: reason,
        createdAt,
        updatedAt: new Date().toISOString(),
      },
      avoidedModelRequests: 0,
      deterministicOperationsCount: 0,
      transitionsCount: 0,
      deterministicCpuDurationMs: cpuDuration,
      controllerCpuMs: cpuDuration,
      childProcessCpuMs: 0,
      wallDurationMs: Math.max(1, Math.round(duration)),
      inferenceDurationMs: 0,
    };
  }
}
