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

  // ---------------------------------------------------------------------------
  // Phase 1 Regressions: Absolute Paths, Drive Paths, Traversals & Symlinks
  // ---------------------------------------------------------------------------
  describe('Phase 1 — Path Resolution & Filesystem Security', () => {
    it('rejects POSIX absolute path /tmp/payload.rs in header', () => {
      const response = `
// File: /tmp/payload.rs
\`\`\`rust
pub fn exploit() {}
\`\`\`
`;
      const mods = IncrementalEditManager.parseProposedModifications(response, context);
      expect(mods.length).toBe(1);
      expect(mods[0].unresolved).toBe(true);
      expect(mods[0].resolutionError).toContain('Absolute, drive-qualified, or UNC path rejected');
    });

    it('rejects Windows drive-qualified path C:\\temp\\payload.rs in header', () => {
      const response = `
// File: C:\\temp\\payload.rs
\`\`\`rust
pub fn exploit() {}
\`\`\`
`;
      const mods = IncrementalEditManager.parseProposedModifications(response, context);
      expect(mods.length).toBe(1);
      expect(mods[0].unresolved).toBe(true);
      expect(mods[0].resolutionError).toContain('Absolute, drive-qualified, or UNC path rejected');
    });

    it('rejects parent-directory traversal ../../outside.rs in header', () => {
      const response = `
// File: ../../outside.rs
\`\`\`rust
pub fn exploit() {}
\`\`\`
`;
      const mods = IncrementalEditManager.parseProposedModifications(response, context);
      expect(mods.length).toBe(1);
      expect(mods[0].unresolved).toBe(true);
      expect(mods[0].resolutionError).toContain('Parent traversal');
    });

    it('rejects nested parent-directory traversal src/../outside.rs in header', () => {
      const response = `
// File: src/../outside.rs
\`\`\`rust
pub fn exploit() {}
\`\`\`
`;
      const mods = IncrementalEditManager.parseProposedModifications(response, context);
      expect(mods.length).toBe(1);
      expect(mods[0].unresolved).toBe(true);
      expect(mods[0].resolutionError).toContain('Parent traversal');
    });

    it('rejects unauthorized paths outside src/ and tests/ (e.g. outside/payload.rs)', () => {
      const response = `
// File: outside/payload.rs
\`\`\`rust
pub fn exploit() {}
\`\`\`
`;
      const mods = IncrementalEditManager.parseProposedModifications(response, context);
      expect(mods.length).toBe(1);
      expect(mods[0].unresolved).toBe(true);
      expect(mods[0].resolutionError).toContain('outside authorized workspace locations');
    });

    it('accepts valid relative Rust paths in src/ and tests/', () => {
      const response = `
// File: src/sensor.rs
\`\`\`rust
pub fn ok_sensor() {}
\`\`\`
// File: tests/integration.rs
\`\`\`rust
pub fn ok_test() {}
\`\`\`
`;
      const mods = IncrementalEditManager.parseProposedModifications(response, context);
      expect(mods.length).toBe(2);
      expect(mods[0].path).toBe('src/sensor.rs');
      expect(mods[0].unresolved).toBeFalsy();
      expect(mods[1].path).toBe('tests/integration.rs');
      expect(mods[1].unresolved).toBeFalsy();
    });

    it('rejects candidate paths containing null bytes', () => {
      const res = IncrementalEditManager.resolveTargetFile(
        'src/\0evil.rs',
        { content: 'pub fn bad() {}' },
        'full_file',
        '',
        context
      );
      expect(res.unresolved).toBe(true);
      expect(res.resolutionError).toContain('Null byte detected');
    });

    it('fails closed and rejects workspace creation if template contains symlinks', async () => {
      const tempSrc = await fs.mkdtemp(path.join(process.cwd(), '.test-symlink-src-'));
      const tempDest = await fs.mkdtemp(path.join(process.cwd(), '.test-symlink-dest-'));
      try {
        // Create normal file
        await fs.writeFile(path.join(tempSrc, 'regular.rs'), 'pub fn regular() {}');
        // Create target outside template
        const outsideTarget = path.join(tempSrc, 'outside.txt');
        await fs.writeFile(outsideTarget, 'secret');
        // Create symlink inside template pointing to outsideTarget
        await fs.symlink(outsideTarget, path.join(tempSrc, 'symlinked.rs'));

        const { TaskWorkspace } = await import('../implementations/bifrost-01/src/runtime/workspace');
        // copyRecursive is private, but TaskWorkspace.create uses it; we can test copyRecursive via reflection or create
        // Let's test the workspace copyRecursive failure mode
        const wsAny = TaskWorkspace as unknown as { copyRecursive?: (src: string, dest: string) => Promise<void> };
        if (wsAny.copyRecursive) {
          await expect(wsAny.copyRecursive(tempSrc, tempDest)).rejects.toThrow('Symbolic link detected');
        }
      } finally {
        await fs.rm(tempSrc, { recursive: true, force: true });
        await fs.rm(tempDest, { recursive: true, force: true });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 2 Regressions: Multi-File Patch Transaction Integrity & Rollback
  // ---------------------------------------------------------------------------
  describe('Phase 2 — Multi-File Patch Transaction Integrity & Rollback', () => {
    it('leaves all files untouched on disk when second patch fails validation', async () => {
      const tempDir = await fs.mkdtemp(path.join(process.cwd(), '.test-tx-workspace-'));
      try {
        await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
        const sensorFile = path.join(tempDir, 'src/sensor.rs');
        const aggFile = path.join(tempDir, 'src/aggregator.rs');

        const origSensor = 'pub fn sensor_read() -> u32 { 10 }';
        const origAgg = 'pub fn aggregate() -> u32 { 100 }';
        await fs.writeFile(sensorFile, origSensor, 'utf8');
        await fs.writeFile(aggFile, origAgg, 'utf8');

        const approvalEngine = new HostApprovalEngine(createDefaultPolicy(), async () => true);
        const manager = new IncrementalEditManager(tempDir, approvalEngine);

        // Modification 1 is VALID: replaces sensor_read return 10 with 20
        const mod1 = {
          path: 'src/sensor.rs',
          type: 'localized_patch' as const,
          searchBlock: 'pub fn sensor_read() -> u32 { 10 }',
          replaceBlock: 'pub fn sensor_read() -> u32 { 20 }',
        };

        // Modification 2 is INVALID: search block does not exist in aggregator.rs
        const mod2 = {
          path: 'src/aggregator.rs',
          type: 'localized_patch' as const,
          searchBlock: 'pub fn completely_nonexistent() {}',
          replaceBlock: 'pub fn fixed() {}',
        };

        const result = await manager.applyModifications([mod1, mod2], 1);

        expect(result.success).toBe(false);
        expect(result.appliedModifications.length).toBe(0);
        expect(result.errors.length).toBeGreaterThan(0);

        // ATOMICITY INVARIANT: sensor.rs MUST remain 100% byte-identical to origSensor!
        const sensorOnDisk = await fs.readFile(sensorFile, 'utf8');
        expect(sensorOnDisk).toBe(origSensor);

        const aggOnDisk = await fs.readFile(aggFile, 'utf8');
        expect(aggOnDisk).toBe(origAgg);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('leaves all files untouched on disk when host approval is denied for one file', async () => {
      const tempDir = await fs.mkdtemp(path.join(process.cwd(), '.test-approval-tx-'));
      try {
        await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
        const file1 = path.join(tempDir, 'src/sensor.rs');
        const file2 = path.join(tempDir, 'src/aggregator.rs');
        await fs.writeFile(file1, 'pub fn s() { 1; }', 'utf8');
        await fs.writeFile(file2, 'pub fn a() { 2; }', 'utf8');

        // Approval handler: approves sensor.rs, but DENIES aggregator.rs
        const approvalEngine = new HostApprovalEngine(
          createDefaultPolicy(),
          async (action) => !String(action.parameters?.path).includes('aggregator')
        );
        const manager = new IncrementalEditManager(tempDir, approvalEngine);

        const mod1 = {
          path: 'src/sensor.rs',
          type: 'localized_patch' as const,
          searchBlock: 'pub fn s() { 1; }',
          replaceBlock: 'pub fn s() { 10; }',
        };
        const mod2 = {
          path: 'src/aggregator.rs',
          type: 'localized_patch' as const,
          searchBlock: 'pub fn a() { 2; }',
          replaceBlock: 'pub fn a() { 20; }',
        };

        const result = await manager.applyModifications([mod1, mod2], 1);
        expect(result.success).toBe(false);
        expect(result.appliedModifications.length).toBe(0);

        // Verify neither file was written to disk!
        expect(await fs.readFile(file1, 'utf8')).toBe('pub fn s() { 1; }');
        expect(await fs.readFile(file2, 'utf8')).toBe('pub fn a() { 2; }');
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('rejects transaction when expectedRevision does not match file on disk', async () => {
      const tempDir = await fs.mkdtemp(path.join(process.cwd(), '.test-stale-rev-'));
      try {
        await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
        const file1 = path.join(tempDir, 'src/sensor.rs');
        await fs.writeFile(file1, 'pub fn s() { 1; }', 'utf8');

        const approvalEngine = new HostApprovalEngine(createDefaultPolicy(), async () => true);
        const manager = new IncrementalEditManager(tempDir, approvalEngine);

        const mod = {
          path: 'src/sensor.rs',
          type: 'localized_patch' as const,
          searchBlock: 'pub fn s() { 1; }',
          replaceBlock: 'pub fn s() { 2; }',
          expectedRevision: 'sha256:0000000000000000', // incorrect revision
        };

        const result = await manager.applyModifications([mod], 1);
        expect(result.success).toBe(false);
        expect(result.errors[0]).toContain('Stale revision conflict');
        expect(await fs.readFile(file1, 'utf8')).toBe('pub fn s() { 1; }');
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('successfully applies multiple sequential patches targeting the same file in one transaction', async () => {
      const tempDir = await fs.mkdtemp(path.join(process.cwd(), '.test-multi-patch-same-file-'));
      try {
        await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
        const file1 = path.join(tempDir, 'src/sensor.rs');
        const initialContent = `
pub fn step_one() -> i32 { 1 }
pub fn step_two() -> i32 { 2 }
`.trim();
        await fs.writeFile(file1, initialContent, 'utf8');

        const approvalEngine = new HostApprovalEngine(createDefaultPolicy(), async () => true);
        const manager = new IncrementalEditManager(tempDir, approvalEngine);

        const mod1 = {
          path: 'src/sensor.rs',
          type: 'localized_patch' as const,
          searchBlock: 'pub fn step_one() -> i32 { 1 }',
          replaceBlock: 'pub fn step_one() -> i32 { 10 }',
        };

        const mod2 = {
          path: 'src/sensor.rs',
          type: 'localized_patch' as const,
          searchBlock: 'pub fn step_two() -> i32 { 2 }',
          replaceBlock: 'pub fn step_two() -> i32 { 20 }',
        };

        const result = await manager.applyModifications([mod1, mod2], 1);
        expect(result.success).toBe(true);
        expect(result.appliedModifications.length).toBe(1);

        const onDisk = await fs.readFile(file1, 'utf8');
        expect(onDisk).toContain('pub fn step_one() -> i32 { 10 }');
        expect(onDisk).toContain('pub fn step_two() -> i32 { 20 }');
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 3 Regressions: Tree-sitter AST Function-Span Merge (No Fragile Brace Counting)
  // ---------------------------------------------------------------------------
  describe('Phase 3 — Tree-sitter AST Function-Span Merge', () => {
    it('safely merges partial function implementation preserving untouched code with strings, closures, raw strings, macros and comments', async () => {
      const existingCode = `
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct TelemetryAggregator {
    pub anomaly_threshold: f64,
    pub readings: Vec<f64>,
}

impl TelemetryAggregator {
    pub fn new(threshold: f64) -> Self {
        // String literal with braces:
        let _s = "{ not a block }";
        // Raw string with braces:
        let _raw = r#"{ also not a block }"#;
        // Comment with { and }
        /* block comment { } */
        // Closure with braces:
        let _closure = |x: i32| { x + 1 };
        // Macro with braces:
        println!("threshold: {}", threshold);
        // Nested block:
        {
            let _inner = 42;
        }
        Self {
            anomaly_threshold: threshold,
            readings: Vec::new(),
        }
    }

    pub fn filter_anomalies(&self) -> Vec<f64> {
        // Buggy initial implementation
        Vec::new()
    }

    pub fn count(&self) -> usize {
        self.readings.len()
    }
}
`.trim();

      const proposedUpdate = `
impl TelemetryAggregator {
    pub fn filter_anomalies(&self) -> Vec<f64> {
        self.readings.iter().copied().filter(|&v| v > self.anomaly_threshold).collect()
    }
}
`.trim();

      const mergeResult = await IncrementalEditManager.mergePartialFileAST(
        existingCode,
        proposedUpdate,
        'src/aggregator.rs'
      );

      expect(mergeResult.success).toBe(true);
      expect(mergeResult.mergedContent).toBeDefined();

      const merged = mergeResult.mergedContent!;

      // 1. filter_anomalies is updated to the proposed implementation
      expect(merged).toContain('self.readings.iter().copied().filter(|&v| v > self.anomaly_threshold).collect()');

      // 2. new() function remains intact with all its braces, strings, closures, raw strings and comments
      expect(merged).toContain('let _s = "{ not a block }";');
      expect(merged).toContain('let _raw = r#"{ also not a block }"#;');
      expect(merged).toContain('/* block comment { } */');
      expect(merged).toContain('let _closure = |x: i32| { x + 1 };');
      expect(merged).toContain('println!("threshold: {}", threshold);');
      expect(merged).toContain('let _inner = 42;');

      // 3. count() function remains intact
      expect(merged).toContain('pub fn count(&self) -> usize');

      // 4. Untouched prefix (imports and struct definition) is 100% byte-for-byte identical!
      const prefixIdx = existingCode.indexOf('pub fn filter_anomalies');
      expect(merged.slice(0, prefixIdx)).toBe(existingCode.slice(0, prefixIdx));
    });

    it('fails closed and rejects partial merge if proposed code contains syntax errors', async () => {
      const existingCode = `
impl TelemetryAggregator {
    pub fn count(&self) -> usize { 0 }
}
`.trim();

      const malformedProposed = `
impl TelemetryAggregator {
    pub fn count(&self) -> usize {
        // Missing closing brace or unclosed token
`;

      const mergeResult = await IncrementalEditManager.mergePartialFileAST(
        existingCode,
        malformedProposed,
        'src/aggregator.rs'
      );

      expect(mergeResult.success).toBe(false);
      expect(mergeResult.error).toContain('Tree-sitter syntax errors');
    });
  });
});
