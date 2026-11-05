import { TierTransitionRecord, ExecutionTier } from '../persistence/types';

export interface OscillationCheckResult {
  oscillating: boolean;
  reason?: string;
  patternDetected?: string[];
}

export interface OscillationDetectorOptions {
  maxOscillations?: number;
  historyWindowSize?: number;
}

export class OscillationDetector {
  private transitions: Array<{
    from: ExecutionTier;
    to: ExecutionTier;
    signature: string;
    timestamp: string;
  }> = [];
  private maxOscillations: number;
  private historyWindowSize: number;

  constructor(options: OscillationDetectorOptions = {}) {
    this.maxOscillations = options.maxOscillations ?? 2;
    this.historyWindowSize = options.historyWindowSize ?? 8;
  }

  /**
   * Records a tier transition along with the prevailing error signature and evaluates oscillation risk.
   */
  public recordTransition(
    transition: TierTransitionRecord,
    failureSignature = ''
  ): OscillationCheckResult {
    const normalizedSig = failureSignature.trim().slice(0, 150);
    this.transitions.push({
      from: transition.fromTier,
      to: transition.toTier,
      signature: normalizedSig,
      timestamp: transition.timestamp,
    });

    if (this.transitions.length > this.historyWindowSize) {
      this.transitions.shift();
    }

    return this.checkOscillation();
  }

  /**
   * Deterministically evaluates transition history for back-and-forth round-trips.
   * E.g.: [A->B, B->A] is 1 round-trip. [A->B, B->A, A->B, B->A] is 2 round-trips.
   */
  public checkOscillation(): OscillationCheckResult {
    if (this.transitions.length < 2) {
      return { oscillating: false };
    }

    // Count how many consecutive alternating round-trips exist at the tail of transitions
    let roundTrips = 0;
    const len = this.transitions.length;
    let baseSignature: string | null = null;

    for (let i = len - 1; i >= 1; i -= 2) {
      const returnLeg = this.transitions[i];
      const forwardLeg = this.transitions[i - 1];

      // Must be a round-trip: forward is X -> Y, return is Y -> X
      if (forwardLeg.from === returnLeg.to && forwardLeg.to === returnLeg.from) {
        if (baseSignature === null) {
          baseSignature = returnLeg.signature;
          roundTrips++;
        } else if (!returnLeg.signature || returnLeg.signature === baseSignature) {
          roundTrips++;
        } else {
          // Failure signature changed, progress was made, break chain
          break;
        }
      } else {
        break;
      }
    }

    if (roundTrips >= this.maxOscillations) {
      const pattern = this.transitions.slice(-(roundTrips * 2)).map((t) => `${t.from}➔${t.to}`);
      return {
        oscillating: true,
        reason: `Repeated unproductive ping-pong between tiers without test progress (${roundTrips} round-trips: ${pattern.join(', ')}). Halting execution to avoid token waste.`,
        patternDetected: pattern,
      };
    }

    return { oscillating: false };
  }

  public reset(): void {
    this.transitions = [];
  }
}
