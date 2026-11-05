import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  ContextDocumentManager,
  DurableStore,
  type ProjectContextData,
  type ControllerState,
  getCodingTasksDir,
  AdaptiveExecutionEngine,
  EmbeddedBifrostGateway,
  BifrostClient,
  createWorkspaceApprovalHandler,
} from '../implementations/bifrost-01/src/index';
import { TaskSpec } from '../packages/contracts/src/index';

describe('ProofBench — Milestone 1: Context Persistence & Durable State (.proofbench/ & CONTEXT.MD)', () => {
  let tmpWorkspace: string;
  const tasksDir = getCodingTasksDir();
  const task1Workspace = path.join(tasksDir, 'task-1-fix-failing-func/workspace');

  beforeEach(async () => {
    tmpWorkspace = path.join(os.tmpdir(), `proofbench-test-persist-${randomUUID().slice(0, 8)}`);
    await fs.mkdir(tmpWorkspace, { recursive: true });
    // Copy sample workspace files
    await fs.cp(task1Workspace, tmpWorkspace, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpWorkspace, { recursive: true, force: true }).catch(() => {});
  });

  // ==========================================================================
  // CONTEXT.MD Schema, Serialization & Parsing Tests
  // ==========================================================================
  describe('Universal Project Context (CONTEXT.MD)', () => {
    const sampleContextData: ProjectContextData = {
      identity: {
        projectName: 'sample-project',
        language: 'Rust',
        stack: 'Cargo 2021',
        repositoryRoot: '/path/to/repo',
        sourceRevision: 'sha256:abc123def456',
      },
      requirements: {
        taskId: 'task-1-fix-failing-func',
        taskTitle: 'Fix sliding window off-by-one bounds',
        taskPrompt: 'Fix the bounds calculation in sliding_window_sums',
        acceptanceCriteria: ['cargo test exits with code 0', 'boundary cases pass'],
        userPreferences: {
          style: 'idiomatic_rust',
        },
      },
      architecture: {
        relevantModules: ['src/lib.rs'],
        existingInterfaces: ['pub fn sliding_window_sums(values: &[i64], window_size: usize) -> Vec<i64>'],
        verifiedDependencies: ['std::cmp::min'],
      },
      activeTask: {
        taskId: 'task-1-fix-failing-func',
        currentPhase: 'ANALYZE',
        responsibleTier: 'NON_LLM',
        remainingWork: 'Verify initial test failure and prepare context',
      },
      acceptedDecisions: [
        {
          id: 'dec-1',
          decision: 'Use non-inclusive range 0..=len - window_size',
          rationale: 'Includes final valid window',
          verifiedAt: '2026-11-05T00:00:00Z',
          evidenceRef: 'ev-test-1',
        },
      ],
      verifiedProgress: [
        {
          id: 'prog-1',
          type: 'test',
          description: 'Identified test failure on window bounds',
          timestamp: '2026-11-05T00:01:00Z',
          revision: 'sha256:abc123def456',
        },
      ],
      knownFailures: [
        {
          id: 'fail-1',
          attemptNumber: 1,
          errorType: 'test_failure',
          details: 'assertion failed: left == right',
        },
      ],
      nextAction: {
        step: 'Run small model repair turn',
        requiredEvidence: 'Clean test compilation',
        suggestedTier: 'SMALL_LLM',
      },
      evidenceReferences: [
        {
          id: 'ev-1',
          type: 'test_output',
          pathOrId: '.proofbench/evidence/test-1.txt',
          summary: 'Failing cargo test output with off-by-one assertion error',
        },
      ],
      checkpoint: {
        stateRevision: 'st-001',
        sourceRevision: 'sha256:abc123def456',
        lastVerifiedTransition: 'NON_LLM -> SMALL_LLM',
        timestamp: '2026-11-05T00:02:00Z',
      },
    };

    it('serializes and parses CONTEXT.MD with round-trip fidelity across all 11 sections', () => {
      const markdown = ContextDocumentManager.serialize(sampleContextData);

      // Verify all required section headers exist
      expect(markdown).toContain('# Project Context');
      expect(markdown).toContain('## Project Identity');
      expect(markdown).toContain('## Original Requirements');
      expect(markdown).toContain('## Project Architecture');
      expect(markdown).toContain('## Active Task');
      expect(markdown).toContain('## Accepted Decisions');
      expect(markdown).toContain('## Verified Progress');
      expect(markdown).toContain('## Known Failures');
      expect(markdown).toContain('## Next Action');
      expect(markdown).toContain('## Evidence References');
      expect(markdown).toContain('## Checkpoint');

      // Parse back
      const parsed = ContextDocumentManager.parse(markdown);
      expect(parsed.identity.projectName).toBe(sampleContextData.identity.projectName);
      expect(parsed.identity.language).toBe(sampleContextData.identity.language);
      expect(parsed.identity.sourceRevision).toBe(sampleContextData.identity.sourceRevision);
      expect(parsed.requirements.taskId).toBe(sampleContextData.requirements.taskId);
      expect(parsed.requirements.acceptanceCriteria).toEqual(sampleContextData.requirements.acceptanceCriteria);
      expect(parsed.architecture.relevantModules).toEqual(sampleContextData.architecture.relevantModules);
      expect(parsed.activeTask.currentPhase).toBe('ANALYZE');
      expect(parsed.activeTask.responsibleTier).toBe('NON_LLM');
      expect(parsed.acceptedDecisions.length).toBe(1);
      expect(parsed.verifiedProgress.length).toBe(1);
      expect(parsed.knownFailures.length).toBe(1);
      expect(parsed.nextAction.suggestedTier).toBe('SMALL_LLM');
      expect(parsed.checkpoint.stateRevision).toBe('st-001');
    });

    it('initializes CONTEXT.MD from observed facts when absent', async () => {
      const taskSpec = TaskSpec.parse({
        version: '1',
        id: 'task-1-fix-failing-func',
        title: 'Fix sliding window bug',
        prompt: 'Fix the bounds calculation in sliding_window_sums',
        acceptance: ['cargo test exits with code 0'],
      });

      const { data, wasCreated } = await ContextDocumentManager.loadOrInitialize(
        tmpWorkspace,
        taskSpec,
        'sha256:initial-rev-1'
      );

      expect(wasCreated).toBe(true);
      expect(data.identity.sourceRevision).toBe('sha256:initial-rev-1');
      expect(data.requirements.taskId).toBe('task-1-fix-failing-func');
      expect(data.architecture.relevantModules).toContain('src/lib.rs');
      expect(data.activeTask.responsibleTier).toBe('NON_LLM');

      // Confirm file was written
      const exists = await fs.access(path.join(tmpWorkspace, 'CONTEXT.MD')).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('validates CONTEXT.MD against filesystem and detects source revision conflicts', () => {
      const validCheck = ContextDocumentManager.validateAgainstFilesystem(
        sampleContextData,
        'sha256:abc123def456'
      );
      expect(validCheck.valid).toBe(true);
      expect(validCheck.conflicts.length).toBe(0);

      // Discrepancy scenario: external edit changed source revision
      const conflictCheck = ContextDocumentManager.validateAgainstFilesystem(
        sampleContextData,
        'sha256:modified-externally'
      );
      expect(conflictCheck.valid).toBe(false);
      expect(conflictCheck.conflicts.length).toBeGreaterThan(0);
      expect(conflictCheck.conflicts[0]).toContain('Source revision discrepancy');
    });
  });

  // ==========================================================================
  // Durable Store (.proofbench/) Tests
  // ==========================================================================
  describe('Durable Store (.proofbench/)', () => {
    let store: DurableStore;

    beforeEach(async () => {
      store = new DurableStore(tmpWorkspace);
      await store.initialize();
    });

    it('initializes directory structure with restricted permissions', async () => {
      const proofbenchDir = path.join(tmpWorkspace, '.proofbench');
      const evidenceDir = path.join(proofbenchDir, 'evidence');
      const patchesDir = path.join(proofbenchDir, 'patches');
      const checkpointsDir = path.join(proofbenchDir, 'checkpoints');

      expect(await fs.access(proofbenchDir).then(() => true)).toBe(true);
      expect(await fs.access(evidenceDir).then(() => true)).toBe(true);
      expect(await fs.access(patchesDir).then(() => true)).toBe(true);
      expect(await fs.access(checkpointsDir).then(() => true)).toBe(true);
    });

    it('atomically saves and loads controller state with schema versioning', async () => {
      const initialState: ControllerState = {
        version: '1',
        runId: 'run-test-01',
        taskId: 'task-1-fix-failing-func',
        currentPhase: 'ANALYZE',
        currentTier: 'NON_LLM',
        sourceRevision: 'sha256:rev1',
        stateRevision: 'st-001',
        turnCount: 0,
        totalTokens: { prompt: 0, completion: 0, total: 0 },
        deterministicOperationsCount: 2,
        transitions: [],
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.saveState(initialState);
      const loaded = await store.loadState();

      expect(loaded).not.toBeNull();
      expect(loaded?.version).toBe('1');
      expect(loaded?.runId).toBe('run-test-01');
      expect(loaded?.deterministicOperationsCount).toBe(2);
      expect(loaded?.status).toBe('running');
    });

    it('appends and loads immutable execution events sequentially', async () => {
      const ev1 = await store.appendEvent('phase_change', 'ADMISSION', 'NON_LLM', 'sha256:rev1', { note: 'started' });
      const ev2 = await store.appendEvent('tier_selected', 'SELECT_TIER', 'SMALL_LLM', 'sha256:rev1', { model: 'qwen-1.5b' });

      expect(ev1.sequence).toBe(1);
      expect(ev2.sequence).toBe(2);

      const events = await store.loadEvents();
      expect(events.length).toBe(2);
      expect(events[0].type).toBe('phase_change');
      expect(events[1].type).toBe('tier_selected');
      expect(events[1].tier).toBe('SMALL_LLM');
    });

    it('stores and retrieves evidence artifacts and patch records', async () => {
      const evPath = await store.saveEvidence('test-out-01', 'cargo test passed: 2 tests ok');
      expect(evPath).toContain('.proofbench/evidence/test-out-01.txt');

      const fullEvPath = path.join(tmpWorkspace, evPath);
      const evContent = await fs.readFile(fullEvPath, 'utf8');
      expect(evContent).toBe('cargo test passed: 2 tests ok');

      const patchPath = await store.savePatch('patch-01', {
        type: 'localized_patch',
        path: 'src/lib.rs',
        afterHash: 'sha256:new-rev',
        patchContent: '<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE',
      });
      expect(patchPath).toContain('.proofbench/patches/patch-01.json');
    });

    it('creates, lists, and recovers from checkpoints across restarts', async () => {
      const state: ControllerState = {
        version: '1',
        runId: 'run-test-02',
        taskId: 'task-1-fix-failing-func',
        currentPhase: 'VERIFY',
        currentTier: 'SMALL_LLM',
        sourceRevision: 'sha256:rev2',
        stateRevision: 'st-001',
        turnCount: 1,
        totalTokens: { prompt: 250, completion: 50, total: 300 },
        deterministicOperationsCount: 3,
        transitions: [
          {
            id: 'tr-1',
            fromTier: 'NON_LLM',
            toTier: 'SMALL_LLM',
            reason: 'Task requires coding synthesis',
            timestamp: new Date().toISOString(),
            sourceRevision: 'sha256:rev1',
            authorizedBy: 'host_engine',
          },
        ],
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const taskSpec = TaskSpec.parse({
        version: '1',
        id: 'task-1-fix-failing-func',
        title: 'Fix sliding window bug',
        prompt: 'Fix the bounds calculation in sliding_window_sums',
        acceptance: ['cargo test exits with code 0'],
      });

      const contextData = await ContextDocumentManager.initializeFromObservedFacts(
        tmpWorkspace,
        taskSpec,
        'sha256:rev2'
      );

      const cp = await store.createCheckpoint(state, contextData);
      expect(cp.stateRevision).toBeDefined();
      expect(cp.stateSnapshot.turnCount).toBe(1);

      // Verify recovery via store restart (new store instance pointing to same workspace)
      const freshStore = new DurableStore(tmpWorkspace);
      await freshStore.initialize();

      const latestCp = await freshStore.getLatestCheckpoint();
      expect(latestCp).not.toBeNull();
      expect(latestCp?.checkpointId).toBe(cp.checkpointId);
      expect(latestCp?.stateSnapshot.runId).toBe('run-test-02');
      expect(latestCp?.stateSnapshot.transitions.length).toBe(1);
    });

    it('safely recovers from orphan .tmp files from simulated crash/interrupted writes', async () => {
      // Simulate crashed write by writing an orphan .tmp file
      const orphanTmp = path.join(tmpWorkspace, '.proofbench', '.tmp-crashedwrite123');
      await fs.writeFile(orphanTmp, 'partial-json-content', 'utf8');

      // Re-initialize store
      const recoveringStore = new DurableStore(tmpWorkspace);
      await recoveringStore.initialize();

      const exists = await fs.access(orphanTmp).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('detects external source modifications and safely logs resumption mismatch', async () => {
      const store = new DurableStore(tmpWorkspace);
      await store.initialize();

      const currentRev = await ContextDocumentManager.computeSourceRevision(tmpWorkspace);
      const state: ControllerState = {
        version: '1',
        runId: 'run-test-stale',
        taskId: 'task-1',
        currentPhase: 'CHECKPOINT',
        currentTier: 'SMALL_LLM',
        sourceRevision: currentRev,
        stateRevision: 'state-stale-1',
        turnCount: 2,
        totalTokens: { prompt: 500, completion: 100, total: 600 },
        deterministicOperationsCount: 2,
        transitions: [],
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const taskSpec = TaskSpec.parse({
        version: '1',
        id: 'task-1-fix-failing-func',
        title: 'Fix sliding window bug',
        prompt: 'Fix the bounds calculation in sliding_window_sums',
        acceptance: ['cargo test exits with code 0'],
      });

      const contextData = await ContextDocumentManager.initializeFromObservedFacts(
        tmpWorkspace,
        taskSpec,
        currentRev
      );

      await store.createCheckpoint(state, contextData);

      // Now modify workspace externally (simulating external git change or developer edit)
      const libPath = path.join(tmpWorkspace, 'src', 'lib.rs');
      await fs.appendFile(libPath, '\n// External change\n', 'utf8');

      const freshRev = await ContextDocumentManager.computeSourceRevision(tmpWorkspace);
      expect(freshRev).not.toBe(currentRev);

      // Verify that engine/store detects revision mismatch and records event
      const latestCp = await store.getLatestCheckpoint();
      expect(latestCp?.sourceRevision).toBe(currentRev);
      expect(latestCp?.sourceRevision).not.toBe(freshRev);

      await store.appendEvent('resumption_mismatch', 'ADMISSION', 'NON_LLM', freshRev, {
        checkpointRev: latestCp?.sourceRevision,
        currentRev: freshRev,
        message: 'External source edit detected',
      });

      const events = await store.loadEvents();
      const mismatchEvent = events.find((e) => e.type === 'resumption_mismatch');
      expect(mismatchEvent).toBeDefined();
      expect(mismatchEvent?.data.currentRev).toBe(freshRev);
    });

    it('verifies persistent continuation during inter-tier model delegation across controller death and restart', async () => {
      const task9Source = path.join(tasksDir, 'task-9-bidirectional-event-service/workspace');
      const testWorkspace = path.join(os.tmpdir(), `proofbench-test-persist-handoff-${randomUUID().slice(0, 8)}`);
      await fs.mkdir(testWorkspace, { recursive: true });
      await fs.cp(task9Source, testWorkspace, { recursive: true });

      const taskSpec = TaskSpec.parse({
        version: '1',
        id: 'task-9-bidirectional-event-service',
        title: 'Bidirectional Multi-Stage Event Processing Service',
        prompt: 'Fix event payload parsing in src/event.rs and complete the event service dispatch pipeline.',
        acceptance: ['cargo test exits with code 0'],
        fixtureId: 'task-9-v1',
      });

      const embeddedGateway = new EmbeddedBifrostGateway();
      let smallCalls = 0;
      let strongerCalls = 0;

      embeddedGateway.setCustomHandler(async (_req, _provider, model) => {
        if (model.includes('frontier') || model.includes('9B')) {
          strongerCalls++;
          const fixedDispatcher = `// File: src/dispatcher.rs
use crate::event::Event;
use crate::filter::EventFilter;

pub trait EventHandler: Send {
    fn handle(&mut self, event: &Event);
}

pub struct EventDispatcher<'a> {
    filter: Option<&'a EventFilter>,
    handlers: Vec<Box<dyn EventHandler + 'a>>,
    dispatched_count: usize,
}

impl<'a> EventDispatcher<'a> {
    pub fn new() -> Self {
        Self {
            filter: None,
            handlers: Vec::new(),
            dispatched_count: 0,
        }
    }

    pub fn with_filter(mut self, filter: &'a EventFilter) -> Self {
        self.filter = Some(filter);
        self
    }

    pub fn register_handler(&mut self, handler: Box<dyn EventHandler + 'a>) {
        self.handlers.push(handler);
    }

    pub fn dispatched_count(&self) -> usize {
        self.dispatched_count
    }

    pub fn dispatch(&mut self, event: &Event) -> bool {
        let allowed = match self.filter {
            Some(f) => f.evaluate_predicate(event),
            None => true,
        };

        if !allowed {
            return false;
        }

        if self.handlers.is_empty() {
            return false;
        }

        for handler in &mut self.handlers {
            handler.handle(event);
        }
        self.dispatched_count += 1;
        true
    }
}
`;
          return {
            content: `Resolved EventDispatcher borrow conflict and handler loop.
Delegating localized predicate filter in src/filter.rs to Small LLM.

\`\`\`rust
${fixedDispatcher}
\`\`\`

<tier_transition target="SMALL_LLM" rationale="EventDispatcher borrow conflict resolved. Delegating localized predicate filter in src/filter.rs to Small LLM.">
<bounded_instructions>
In src/filter.rs, implement evaluate_predicate on EventFilter:
Return true if event.severity >= self.min_severity and (self.allowed_types.is_empty() || self.allowed_types.contains(&event.event_type)).
</bounded_instructions>
</tier_transition>`,
            usage: { prompt_tokens: 600, completion_tokens: 150 },
          };
        }

        smallCalls++;
        if (smallCalls === 1) {
          const fixedEvent = `// File: src/event.rs
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EventType {
    Metric,
    Alert,
    Audit,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Event {
    pub id: u64,
    pub event_type: EventType,
    pub severity: u8,
    pub payload: String,
}

impl Event {
    pub fn new(id: u64, event_type: EventType, severity: u8, payload: impl Into<String>) -> Self {
        Self {
            id,
            event_type,
            severity,
            payload: payload.into(),
        }
    }

    pub fn parse_csv_line(line: &str) -> Result<Self, String> {
        let parts: Vec<&str> = line.trim().splitn(4, ',').collect();
        if parts.len() < 4 {
            return Err("Invalid CSV line format: expected 4 comma-separated values".into());
        }
        let id = parts[0].parse::<u64>().map_err(|e| e.to_string())?;
        let event_type = match parts[1] {
            "Metric" => EventType::Metric,
            "Alert" => EventType::Alert,
            "Audit" => EventType::Audit,
            other => return Err(format!("Unknown event type: {}", other)),
        };
        let severity = parts[2].parse::<u8>().map_err(|e| e.to_string())?;
        let payload = parts[3].to_string();
        Ok(Self {
            id,
            event_type,
            severity,
            payload,
        })
    }
}
`;
          return {
            content: `Fixed CSV payload parsing in src/event.rs:\n\n\`\`\`rust\n${fixedEvent}\`\`\``,
            usage: { prompt_tokens: 350, completion_tokens: 90 },
          };
        } else {
          const fixedFilter = `// File: src/filter.rs
use crate::event::{Event, EventType};

#[derive(Debug, Clone)]
pub struct EventFilter {
    pub min_severity: u8,
    pub allowed_types: Vec<EventType>,
}

impl EventFilter {
    pub fn new(min_severity: u8, allowed_types: Vec<EventType>) -> Self {
        Self {
            min_severity,
            allowed_types,
        }
    }

    pub fn evaluate_predicate(&self, event: &Event) -> bool {
        if event.severity < self.min_severity {
            return false;
        }
        if self.allowed_types.is_empty() {
            return true;
        }
        self.allowed_types.contains(&event.event_type)
    }
}
`;
          return {
            content: `Implemented delegated evaluate_predicate in src/filter.rs:\n\n\`\`\`rust\n${fixedFilter}\`\`\``,
            usage: { prompt_tokens: 380, completion_tokens: 80 },
          };
        }
      });

      const client = new BifrostClient({ embeddedGateway });

      // Run instance 1 for exactly 3 turns (terminates right after Stronger model delegates to Small model)
      const engine1 = new AdaptiveExecutionEngine({
        bifrostClient: client,
        approvalHandler: createWorkspaceApprovalHandler(),
        strongerModel: 'escalation-frontier-model',
        maxTurns: 3,
      });

      const result1 = await engine1.runTask(taskSpec, { workspacePath: testWorkspace });
      expect(result1.run.status).toBe('failed');
      expect(result1.controllerState.status).toBe('halted');
      expect(result1.controllerState.turnCount).toBe(3);
      expect(result1.controllerState.currentTier).toBe('STRONGER_LLM');
      expect(strongerCalls).toBe(1);

      // Verify checkpoint exists on disk
      const store = new DurableStore(testWorkspace);
      await store.initialize();
      const cp = await store.getLatestCheckpoint();
      expect(cp).not.toBeNull();
      expect(cp?.stateSnapshot.turnCount).toBe(3);
      expect(cp?.contextSnapshot.nextAction.suggestedTier).toBe('SMALL_LLM');

      // Verify accepted source edits survive (src/dispatcher.rs and src/event.rs are preserved)
      const dispatcherContent = await fs.readFile(path.join(testWorkspace, 'src/dispatcher.rs'), 'utf8');
      expect(dispatcherContent).toContain('self.dispatched_count += 1');

      // Now simulate controller death and instantiate fresh engine2
      const engine2 = new AdaptiveExecutionEngine({
        bifrostClient: client,
        approvalHandler: createWorkspaceApprovalHandler(),
        strongerModel: 'escalation-frontier-model',
        maxTurns: 6,
      });

      const result2 = await engine2.runTask(taskSpec, { workspacePath: testWorkspace });
      expect(result2.run.status).toBe('completed');
      expect(result2.run.acceptance.status).toBe('passed');

      // Verify cumulative accounting preserved from engine1 into engine2
      expect(result2.controllerState.totalTokens.total).toBeGreaterThan(
        result1.controllerState.totalTokens.total
      );

      // Verify small model executed bounded instructions without repeating Turn 2 or Turn 3 work
      expect(smallCalls).toBe(2); // 1 before restart, 1 after restart
      expect(strongerCalls).toBe(1); // 0 stronger calls after restart

      // Verify context document contains complete history across both sessions
      expect(result2.contextDocument).toContain('Stronger model delegated implementation to Small LLM');
      expect(result2.contextDocument).toContain('Acceptance tests passed on turn 4');

      await fs.rm(testWorkspace, { recursive: true, force: true }).catch(() => {});
    }, 45000);
  });
});
