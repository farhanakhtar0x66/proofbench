import { describe, it, expect } from 'vitest';
import {
  ModelRegistry,
  UniversalHandoffProtocol,
  OscillationDetector,
} from '../implementations/bifrost-01/src/routing/index';
import { TierTransitionRecord } from '../implementations/bifrost-01/src/persistence/types';

describe('Adaptive Execution Engine — Routing & Registry Suite', () => {
  it('manages model registration, tier defaults, and capability descriptors', () => {
    const registry = new ModelRegistry({ isLive: false });

    const nonLlm = registry.getModelForTier('NON_LLM');
    expect(nonLlm.id).toBe('deterministic-non-llm');
    expect(nonLlm.costPerInputToken).toBe(0);
    expect(nonLlm.capabilities).toContain('ast_symbol_extraction');

    const smallLlm = registry.getModelForTier('SMALL_LLM');
    expect(smallLlm.tier).toBe('SMALL_LLM');
    expect(smallLlm.id).toBe('local-deepseek-coder');

    const strongerLlm = registry.getModelForTier('STRONGER_LLM');
    expect(strongerLlm.tier).toBe('STRONGER_LLM');
    expect(strongerLlm.id).toBe('escalation-frontier-model');

    // Register a custom model
    registry.registerModel({
      id: 'custom-qwen-coder',
      tier: 'SMALL_LLM',
      provider: 'ollama',
      isLocal: true,
      contextWindow: 16384,
      costPerInputToken: 0,
      costPerOutputToken: 0,
      capabilities: ['code_completion'],
      description: 'Custom test model',
    });

    registry.setTierDefault('SMALL_LLM', 'custom-qwen-coder');
    expect(registry.getModelForTier('SMALL_LLM').id).toBe('custom-qwen-coder');
    expect(registry.listModels('SMALL_LLM').length).toBe(2);
  });

  it('builds universal handoff packets across directions with verified diagnostics', () => {
    const packet = UniversalHandoffProtocol.createHandoff({
      id: 'handoff-1',
      direction: 'small_to_stronger',
      sourceTier: 'SMALL_LLM',
      targetTier: 'STRONGER_LLM',
      sourceModel: 'local-deepseek-coder',
      targetModel: 'escalation-frontier-model',
      rationale: 'Small model stagnated on off-by-one pointer logic',
      taskId: 'task-3',
      relevantFiles: ['src/lib.rs', 'src/sink.rs'],
      diagnostics: {
        exitCode: 101,
        passedCount: 2,
        failedCount: 1,
        failingTestNames: ['test_sliding_window_multi_sink'],
        compilerErrorCodes: ['E0502'],
        rawOutputSnippet: 'error[E0502]: cannot borrow `sink` as mutable because it is also borrowed as immutable',
      },
      boundedInstructions: 'Resolve the borrow conflict by scoping the read borrow before calling write_record.',
      tokenBudget: 2500,
    });

    expect(packet.direction).toBe('small_to_stronger');
    expect(packet.formattedText).toContain('### Hand-off Protocol: SMALL_LLM ➔ STRONGER_LLM');
    expect(packet.formattedText).toContain('error[E0502]');
    expect(packet.formattedText).toContain('Resolve the borrow conflict');
    expect(packet.relevantFiles).toContain('src/sink.rs');
  });

  it('parses model transition proposals from XML tags, bracket notation, and JSON blocks', () => {
    // 1. XML tag format
    const xmlOutput = `I have diagnosed the architectural issue in \`src/sink.rs\`.
<tier_transition target="SMALL_LLM" rationale="Localized fix in write_record is ready for implementation">
<bounded_instructions>
Update write_record in src/sink.rs to flush buffer before returning.
</bounded_instructions>
</tier_transition>`;
    const prop1 = UniversalHandoffProtocol.parseTransitionProposal(xmlOutput, 'frontier-model');
    expect(prop1).not.toBeNull();
    expect(prop1?.targetTier).toBe('SMALL_LLM');
    expect(prop1?.boundedInstructions).toContain('Update write_record');

    // 2. Bracket notation
    const bracketOutput = `Code is formatted. [PROPOSE_TIER_TRANSITION: NON_LLM, RATIONALE: Run cargo test to verify fix]`;
    const prop2 = UniversalHandoffProtocol.parseTransitionProposal(bracketOutput, 'small-model');
    expect(prop2).not.toBeNull();
    expect(prop2?.targetTier).toBe('NON_LLM');
    expect(prop2?.rationale).toContain('Run cargo test');

    // 3. JSON block format
    const jsonOutput = `Here is my plan:
\`\`\`json
{
  "type": "tier_transition",
  "targetTier": "SMALL_LLM",
  "rationale": "Follow up with targeted unit test",
  "boundedInstructions": "Add test_boundary_zero in tests.rs"
}
\`\`\``;
    const prop3 = UniversalHandoffProtocol.parseTransitionProposal(jsonOutput, 'frontier-model');
    expect(prop3).not.toBeNull();
    expect(prop3?.targetTier).toBe('SMALL_LLM');
    expect(prop3?.boundedInstructions).toContain('Add test_boundary_zero');

    // Validation
    const val = UniversalHandoffProtocol.validateProposal(prop1!, 'STRONGER_LLM');
    expect(val.valid).toBe(true);

    const invalidSameTier = UniversalHandoffProtocol.validateProposal(prop1!, 'SMALL_LLM');
    expect(invalidSameTier.valid).toBe(false);
  });

  it('detects oscillation hazards when ping-ponging between tiers on stagnant failure signatures', () => {
    const detector = new OscillationDetector({ maxOscillations: 2 });

    const createRecord = (from: 'SMALL_LLM' | 'STRONGER_LLM', to: 'SMALL_LLM' | 'STRONGER_LLM', i: number): TierTransitionRecord => ({
      id: `trans-${i}`,
      fromTier: from,
      toTier: to,
      reason: 'test',
      timestamp: new Date().toISOString(),
      sourceRevision: 'rev1',
      authorizedBy: 'host_engine',
    });

    const sig = 'error[E0502]: borrow conflict at src/sink.rs:42';

    // Transition 1: SMALL -> STRONGER
    let res = detector.recordTransition(createRecord('SMALL_LLM', 'STRONGER_LLM', 1), sig);
    expect(res.oscillating).toBe(false);

    // Transition 2: STRONGER -> SMALL
    res = detector.recordTransition(createRecord('STRONGER_LLM', 'SMALL_LLM', 2), sig);
    expect(res.oscillating).toBe(false);

    // Transition 3: SMALL -> STRONGER
    res = detector.recordTransition(createRecord('SMALL_LLM', 'STRONGER_LLM', 3), sig);
    expect(res.oscillating).toBe(false);

    // Transition 4: STRONGER -> SMALL (Cycle 2 completes with stagnant signature)
    res = detector.recordTransition(createRecord('STRONGER_LLM', 'SMALL_LLM', 4), sig);
    expect(res.oscillating).toBe(true);
    expect(res.reason).toContain('Repeated unproductive ping-pong between tiers');
  });
});
