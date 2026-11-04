import { createHash } from 'node:crypto';

export interface AttemptRecord {
  attemptIndex: number;
  patchDigest: string; // SHA-256 of the patch content
  rawPatch: string;
  errorSignature: string; // Normalized compiler or test error
  rawError?: string;
  testExitCode: number;
  testPassedCount: number;
  testFailedCount: number;
}

export interface StagnationDecision {
  shouldHalt: boolean;
  reason?: 'stagnated' | 'no_progress' | 'repeated_compiler_error' | 'oscillating_patch';
  message?: string;
  consecutiveFailures: number;
}

export class M2StagnationDetector {
  private attempts: AttemptRecord[] = [];
  private baselineDigest?: string;

  constructor(baselineDigest?: string) {
    this.baselineDigest = baselineDigest;
  }

  setBaseline(baselineDigest: string): void {
    this.baselineDigest = baselineDigest;
  }

  computeDigest(content: string): string {
    return createHash('sha256').update(content.trim()).digest('hex');
  }

  normalizeError(errorText: string): string {
    // Strip temporary directories, line numbers, memory addresses to get semantic error signature
    return errorText
      .replace(/\/tmp\/[a-zA-Z0-9_-]+/g, '<TMPDIR>')
      .replace(/:\d+:\d+/g, ':<LINE>')
      .replace(/0x[0-9a-fA-F]+/g, '<ADDR>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  recordAttempt(attempt: {
    patch: string;
    rawError: string;
    exitCode: number;
    passedCount?: number;
    failedCount?: number;
  }): StagnationDecision {
    const patchDigest = this.computeDigest(attempt.patch);
    const errorSignature = this.normalizeError(attempt.rawError);
    const attemptIndex = this.attempts.length + 1;

    const record: AttemptRecord = {
      attemptIndex,
      patchDigest,
      rawPatch: attempt.patch,
      errorSignature,
      rawError: attempt.rawError,
      testExitCode: attempt.exitCode,
      testPassedCount: attempt.passedCount ?? 0,
      testFailedCount: attempt.failedCount ?? 1,
    };

    this.attempts.push(record);

    // If attempt passed (exit code 0), reset stagnation
    if (attempt.exitCode === 0) {
      return { shouldHalt: false, consecutiveFailures: 0 };
    }

    // Need at least 2 attempts to detect stagnation/oscillation
    if (this.attempts.length < 2) {
      return { shouldHalt: false, consecutiveFailures: 1 };
    }

    const prev = this.attempts[this.attempts.length - 2];
    const curr = record;

    // 1. Repeated identical patch (no progress / no-op)
    if (curr.patchDigest === prev.patchDigest) {
      return {
        shouldHalt: true,
        reason: 'stagnated',
        message: `Attempt ${curr.attemptIndex} produced identical patch to attempt ${prev.attemptIndex}. Controller halted to prevent looping.`,
        consecutiveFailures: this.attempts.length,
      };
    }

    // 2. Oscillating patch (A -> B -> A)
    if (this.attempts.length >= 3) {
      const prevPrev = this.attempts[this.attempts.length - 3];
      if (curr.patchDigest === prevPrev.patchDigest) {
        return {
          shouldHalt: true,
          reason: 'oscillating_patch',
          message: `Attempt ${curr.attemptIndex} oscillated back to patch from attempt ${prevPrev.attemptIndex}. Controller halted to prevent oscillation loop.`,
          consecutiveFailures: this.attempts.length,
        };
      }
    }

    // 3. Repeated compiler error signature with no improvement in failing tests
    if (
      curr.errorSignature === prev.errorSignature &&
      curr.testFailedCount >= prev.testFailedCount
    ) {
      return {
        shouldHalt: true,
        reason: 'repeated_compiler_error',
        message: `Attempts ${prev.attemptIndex} and ${curr.attemptIndex} failed with the exact same compiler diagnostic signature without test improvement. Controller halted for escalation.`,
        consecutiveFailures: this.attempts.length,
      };
    }

    // 4. Three consecutive failures with zero evidenced test progress
    if (this.attempts.length >= 3) {
      const first = this.attempts[this.attempts.length - 3];
      if (curr.testPassedCount <= first.testPassedCount && curr.testFailedCount >= first.testFailedCount) {
        return {
          shouldHalt: true,
          reason: 'no_progress',
          message: `Three consecutive repair attempts failed with no evidenced test progress. Controller halted under M2 governance policy.`,
          consecutiveFailures: this.attempts.length,
        };
      }
    }

    return { shouldHalt: false, consecutiveFailures: this.attempts.length };
  }

  getAttempts(): AttemptRecord[] {
    return [...this.attempts];
  }

  reset(): void {
    this.attempts = [];
  }
}
