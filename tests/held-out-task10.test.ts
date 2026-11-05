import { describe, it, expect } from 'vitest';
import {
  AdaptiveExecutionEngine,
  EmbeddedBifrostGateway,
  createWorkspaceApprovalHandler,
} from '../implementations/bifrost-01/src/index';
import { TaskSpec } from '../packages/contracts/src/index';

/**
 * Test Evidence Classification: SIMULATED INTEGRATION VALIDATION
 *
 * Note: This integration test exercises autonomous multi-turn coordination,
 * Tree-sitter AST symbol resolution, and localized search-block matching
 * on a multi-module fixture ('task-10-sensor-fusion-aggregator') using scripted
 * responses in EmbeddedBifrostGateway.
 *
 * For live model inference results against real local Qwen models on this fixture,
 * see scripts/verify-live-task10.ts (npm run demonstrate:task10:live).
 *
 * Generalization Note: Task 10 was co-developed alongside the 5-level deterministic
 * resolution engine to eliminate hardcoded fixture mappings; it serves as a multi-module
 * structural test rather than an independently blinded third-party benchmark.
 */
describe('ProofBench — Multi-Module Sensor Fusion Task 10 (Simulation Validation)', () => {
  it('autonomously resolves Task 10 via generic file resolution with scripted gateway responses (simulation validation)', async () => {
    const taskSpec = TaskSpec.parse({
      version: '1',
      id: 'task-10-sensor-fusion-aggregator',
      title: 'Multi-Module Sensor Fusion & Telemetry Aggregation Service',
      prompt: 'Fix telemetry frame parsing in src/sensor.rs and implement anomaly threshold filtering in src/aggregator.rs.',
      acceptance: ['cargo test exits with code 0'],
      fixtureId: 'task-10-v1',
    });

    const embeddedGateway = new EmbeddedBifrostGateway();
    let turnCount = 0;

    embeddedGateway.setCustomHandler(async (_req, _provider, _model) => {
      turnCount++;

      if (turnCount === 1) {
        // Turn 2 (first LLM call): Model fixes sensor.rs WITHOUT providing a file header!
        // Generic parser MUST resolve this to src/sensor.rs via unique search block match!
        return {
          content: `I identified the bug in telemetry frame decoding where parts[1] was incorrectly parsed as the numeric value.
Here is the localized fix:

<<<<<<< SEARCH
        // Buggy line: parses parts[1] instead of parts[2] as value
        let value = parts[1]
            .parse::<f64>()
            .map_err(|e| format!("Invalid telemetry value: {}", e))?;
=======
        let value = parts[2]
            .parse::<f64>()
            .map_err(|e| format!("Invalid telemetry value: {}", e))?;
>>>>>>> REPLACE
`,
          usage: { prompt_tokens: 450, completion_tokens: 110 },
        };
      } else {
        // Turn 3: Model implements filter_anomalies in aggregator.rs WITHOUT providing a file header!
        // Generic parser MUST resolve this to src/aggregator.rs via Tree-sitter symbol resolution!
        return {
          content: `Now implementing filter_anomalies on TelemetryAggregator:

\`\`\`rust
impl TelemetryAggregator {
    pub fn filter_anomalies(&self) -> Vec<&SensorReading> {
        self.readings
            .iter()
            .filter(|r| {
                let kind_matches = match &self.target_kind {
                    Some(k) => &r.kind == k,
                    None => true,
                };
                kind_matches && r.value >= self.anomaly_threshold
            })
            .collect()
    }
}
\`\`\`
`,
          usage: { prompt_tokens: 520, completion_tokens: 130 },
        };
      }
    });

    const engine = new AdaptiveExecutionEngine({
      embeddedGateway,
      approvalHandler: createWorkspaceApprovalHandler(),
      maxTurns: 4,
    });

    const runResult = await engine.runTask(taskSpec);

    expect(runResult.run.status).toBe('completed');
    expect(runResult.run.acceptance.status).toBe('passed');

    // Verify trace events show resolution without task-specific mappings
    const events = runResult.trace.events;
    const mechanicalFixEvent = events.find((e) =>
      e.message.includes('Mechanical fix applied')
    );
    expect(mechanicalFixEvent).toBeDefined();

    const outputEvents = events.filter((e) => e.type === 'output');
    const sensorEdit = outputEvents.find((e) => (e.data as Record<string, unknown> | undefined)?.path === 'src/sensor.rs');
    expect(sensorEdit).toBeDefined();

    const aggregatorEdit = outputEvents.find((e) => (e.data as Record<string, unknown> | undefined)?.path === 'src/aggregator.rs');
    expect(aggregatorEdit).toBeDefined();
  });
});
