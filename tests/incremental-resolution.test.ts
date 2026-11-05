import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { IncrementalEditManager, FileResolutionContext } from '../implementations/bifrost-01/src/compiler/incremental-edits';
import { ContextCompiler } from '../implementations/bifrost-01/src/compiler/context-compiler';
import { HostApprovalEngine } from '../implementations/bifrost-01/src/governance/approval';
import { createDefaultPolicy } from '../implementations/bifrost-01/src/governance/policy';

describe('IncrementalEditManager — Generic Deterministic File Resolution', () => {
  const mockSensorCode = `
pub enum ReadingKind {
    Temperature,
    Vibration,
}

pub struct SensorReading {
    pub sensor_id: u32,
    pub kind: ReadingKind,
    pub value: f64,
}

impl SensorReading {
    pub fn decode_telemetry_frame(frame: &str) -> Result<Self, String> {
        let parts: Vec<&str> = frame.split(':').collect();
        if parts.len() < 3 {
            return Err("malformed frame".to_string());
        }
        Ok(Self {
            sensor_id: 1,
            kind: ReadingKind::Temperature,
            value: 0.0,
        })
    }
}
`.trim();

  const mockAggregatorCode = `
use crate::sensor::SensorReading;

pub struct TelemetryAggregator {
    pub anomaly_threshold: f64,
    pub readings: Vec<SensorReading>,
}

impl TelemetryAggregator {
    pub fn new(threshold: f64) -> Self {
        Self {
            anomaly_threshold: threshold,
            readings: Vec::new(),
        }
    }

    pub fn filter_anomalies(&self) -> Vec<&SensorReading> {
        self.readings.iter().filter(|r| r.value > self.anomaly_threshold).collect()
    }
}
`.trim();

  const mockFusionCode = `
pub struct KalmanFusionEngine {
    pub state_estimate: f64,
}

impl KalmanFusionEngine {
    pub fn update(&mut self, measurement: f64) -> f64 {
        self.state_estimate = (self.state_estimate + measurement) / 2.0;
        self.state_estimate
    }
}
`.trim();

  let context: FileResolutionContext;

  beforeEach(async () => {
    const compiler = new ContextCompiler();
    const sensorSymbols = await compiler.parseRustSymbols(mockSensorCode, 'src/sensor.rs', 'rev1');
    const aggregatorSymbols = await compiler.parseRustSymbols(mockAggregatorCode, 'src/aggregator.rs', 'rev2');
    const fusionSymbols = await compiler.parseRustSymbols(mockFusionCode, 'src/fusion.rs', 'rev3');

    context = {
      fileContents: {
        'src/sensor.rs': mockSensorCode,
        'src/aggregator.rs': mockAggregatorCode,
        'src/fusion.rs': mockFusionCode,
        'src/lib.rs': 'pub mod sensor;\npub mod aggregator;\npub mod fusion;\n',
      },
      symbols: [...sensorSymbols, ...aggregatorSymbols, ...fusionSymbols],
    };
  });

  it('resolves explicit file headers without task-specific mappings', () => {
    const response = `
Here is the patch:
// File: src/sensor.rs
<<<<<<< SEARCH
        if parts.len() < 3 {
=======
        if parts.len() < 4 {
>>>>>>> REPLACE
`;
    const mods = IncrementalEditManager.parseProposedModifications(response, context);
    expect(mods.length).toBe(1);
    expect(mods[0].path).toBe('src/sensor.rs');
    expect(mods[0].unresolved).toBeFalsy();
  });

  it('resolves target file via unique source match when model omits file header', () => {
    const response = `
I found the bug in frame decoding:
<<<<<<< SEARCH
        let parts: Vec<&str> = frame.split(':').collect();
        if parts.len() < 3 {
            return Err("malformed frame".to_string());
        }
=======
        let parts: Vec<&str> = frame.split(':').collect();
        if parts.len() < 4 {
            return Err("insufficient fields".to_string());
        }
>>>>>>> REPLACE
`;
    const mods = IncrementalEditManager.parseProposedModifications(response, context);
    expect(mods.length).toBe(1);
    // MUST resolve to src/sensor.rs because search block exists uniquely in src/sensor.rs
    expect(mods[0].path).toBe('src/sensor.rs');
    expect(mods[0].unresolved).toBeFalsy();
  });

  it('resolves target file via Tree-sitter symbol declarations when model provides full-file/impl without header', () => {
    const response = `
Here is the complete implementation of TelemetryAggregator:
\`\`\`rust
impl TelemetryAggregator {
    pub fn new(threshold: f64) -> Self {
        Self {
            anomaly_threshold: threshold,
            readings: Vec::new(),
        }
    }

    pub fn filter_anomalies(&self) -> Vec<&SensorReading> {
        self.readings.iter().filter(|r| r.value >= self.anomaly_threshold).collect()
    }
}
\`\`\`
`;
    const mods = IncrementalEditManager.parseProposedModifications(response, context);
    expect(mods.length).toBe(1);
    // MUST resolve to src/aggregator.rs via TelemetryAggregator Tree-sitter symbol match
    expect(mods[0].path).toBe('src/aggregator.rs');
    expect(mods[0].unresolved).toBeFalsy();
  });

  it('rejects ambiguous search block matching multiple workspace files rather than guessing src/lib.rs', () => {
    // Add identical helper to both sensor.rs and fusion.rs
    const ambiguousContext: FileResolutionContext = {
      fileContents: {
        'src/sensor.rs': mockSensorCode + '\npub fn reset_state() { println!("reset"); }\n',
        'src/fusion.rs': mockFusionCode + '\npub fn reset_state() { println!("reset"); }\n',
        'src/lib.rs': 'pub mod sensor;\npub mod fusion;\n',
      },
      symbols: context.symbols,
    };

    const response = `
<<<<<<< SEARCH
pub fn reset_state() { println!("reset"); }
=======
pub fn reset_state() { println!("clean reset"); }
>>>>>>> REPLACE
`;
    const mods = IncrementalEditManager.parseProposedModifications(response, ambiguousContext);
    expect(mods.length).toBe(1);
    // MUST NOT guess src/lib.rs!
    expect(mods[0].path).not.toBe('src/lib.rs');
    expect(mods[0].unresolved).toBe(true);
    expect(mods[0].resolutionError).toContain('Ambiguous target file');
  });

  it('rejects unknown modification with no header and no matching symbols rather than guessing src/lib.rs', () => {
    const response = `
<<<<<<< SEARCH
fn completely_alien_function() -> u64 {
    42
}
=======
fn completely_alien_function() -> u64 {
    99
}
>>>>>>> REPLACE
`;
    const mods = IncrementalEditManager.parseProposedModifications(response, context);
    expect(mods.length).toBe(1);
    // MUST NOT guess src/lib.rs!
    expect(mods[0].path).not.toBe('src/lib.rs');
    expect(mods[0].unresolved).toBe(true);
    expect(mods[0].resolutionError).toBeDefined();
  });

  it('correctly dispatches multi-patch response to different files even when second patch lacks file header', () => {
    const multiPatchResponse = `
// File: src/sensor.rs
<<<<<<< SEARCH
        if parts.len() < 3 {
=======
        if parts.len() < 4 {
>>>>>>> REPLACE

<<<<<<< SEARCH
        self.state_estimate = (self.state_estimate + measurement) / 2.0;
=======
        self.state_estimate = (self.state_estimate + measurement * 0.8) / 1.8;
>>>>>>> REPLACE
`;
    const mods = IncrementalEditManager.parseProposedModifications(multiPatchResponse, context);
    expect(mods.length).toBe(2);
    // Patch 1 has explicit header src/sensor.rs
    expect(mods[0].path).toBe('src/sensor.rs');
    // Patch 2 lacks header, but its search block is uniquely in src/fusion.rs
    // It MUST NOT blindly inherit src/sensor.rs!
    expect(mods[1].path).toBe('src/fusion.rs');
  });

  it('rejects unresolved modifications in applyModifications without mutating disk', async () => {
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), '.test-workspace-'));
    try {
      const approvalEngine = new HostApprovalEngine(createDefaultPolicy(), async () => true);
      const manager = new IncrementalEditManager(tempDir, approvalEngine);

      const unresolvedMod = {
        path: '',
        type: 'localized_patch' as const,
        searchBlock: 'foo()',
        replaceBlock: 'bar()',
        unresolved: true,
        resolutionError: 'Destination could not be established',
      };

      const result = await manager.applyModifications([unresolvedMod], 1);
      expect(result.success).toBe(false);
      expect(result.appliedModifications.length).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Edit rejected');
      expect(result.errors[0]).toContain('Destination could not be established');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
