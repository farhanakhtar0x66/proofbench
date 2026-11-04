import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  BifrostBudgetExceededError,
} from './types';
import { EmbeddedBifrostGateway } from './embedded';

export interface BifrostClientOptions {
  gatewayUrl?: string;
  virtualKey?: string;
  virtualKeyId?: string;
  embeddedGateway?: EmbeddedBifrostGateway;
  userBudgetLimitUsd?: number;
  fallbackProviders?: string[];
}

export interface SpendReservation {
  reservationId: string;
  reservedAmountUsd: number;
  timestamp: string;
}

export class BifrostClient {
  public gatewayUrl: string;
  public virtualKey: string;
  public fallbackProviders: string[];
  public userBudgetLimitUsd: number;
  public userBudgetSpentUsd = 0;
  private activeReservations = new Map<string, number>();
  private embeddedGateway?: EmbeddedBifrostGateway;

  constructor(options: BifrostClientOptions = {}) {
    this.gatewayUrl = options.gatewayUrl ?? process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8080';
    this.virtualKey = options.virtualKeyId ?? options.virtualKey ?? process.env.BIFROST_VIRTUAL_KEY ?? 'sk-bf-proofbench-default';
    this.fallbackProviders = options.fallbackProviders ?? ['opencode', 'openai-cloud'];
    this.userBudgetLimitUsd = options.userBudgetLimitUsd ?? 5.0;
    this.embeddedGateway = options.embeddedGateway;
  }

  setEmbeddedGateway(gateway: EmbeddedBifrostGateway): void {
    this.embeddedGateway = gateway;
  }

  getAvailableBudget(): number {
    const totalReserved = Array.from(this.activeReservations.values()).reduce((a, b) => a + b, 0);
    return Math.max(0, this.userBudgetLimitUsd - (this.userBudgetSpentUsd + totalReserved));
  }

  // Pre-request conservative budget reservation
  reserveBudget(estimatedMaxCostUsd = 0.05): string {
    const available = this.getAvailableBudget();
    if (available < estimatedMaxCostUsd) {
      throw new BifrostBudgetExceededError(
        `Pre-request budget reservation failed: required $${estimatedMaxCostUsd.toFixed(4)}, but only $${available.toFixed(4)} remains of $${this.userBudgetLimitUsd.toFixed(4)} budget. Request denied.`
      );
    }
    const reservationId = `res-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.activeReservations.set(reservationId, estimatedMaxCostUsd);
    return reservationId;
  }

  releaseReservation(reservationId: string, actualCostUsd = 0): void {
    this.activeReservations.delete(reservationId);
    this.userBudgetSpentUsd += actualCostUsd;
  }

  async createChatCompletion(
    req: ChatCompletionRequest & { fallbackProviders?: string[] },
    estimatedMaxCostUsd = 0.05
  ): Promise<ChatCompletionResponse> {
    const fallbackProviders = req.fallbackProviders ?? this.fallbackProviders;
    // 1. Conservative pre-request spending reservation check
    const reservationId = this.reserveBudget(estimatedMaxCostUsd);

    try {
      // If embedded gateway is configured or external gateway is unreachable/offline, use embedded gateway
      if (this.embeddedGateway) {
        const response = await this.embeddedGateway.handleChatCompletion(
          this.virtualKey,
          req,
          fallbackProviders
        );
        const actualCost = response.bifrost_metadata?.cost_usd ?? 0;
        this.releaseReservation(reservationId, actualCost);
        return response;
      }

      // 2. Attempt HTTP request to external Bifrost Gateway
      try {
        const url = `${this.gatewayUrl.replace(/\/$/, '')}/v1/chat/completions`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-bf-vk': this.virtualKey,
            Authorization: `Bearer ${this.virtualKey}`,
            'x-bf-fallback-providers': this.fallbackProviders.join(','),
          },
          body: JSON.stringify(req),
          signal: AbortSignal.timeout(60_000),
        });

        if (res.status === 402) {
          throw new BifrostBudgetExceededError(
            `Bifrost gateway returned 402 Payment Required: budget exhausted for virtual key ${this.virtualKey}.`
          );
        }

        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Bifrost gateway error (${res.status}): ${errBody}`);
        }

        const data = (await res.json()) as ChatCompletionResponse;
        const actualCost = data.bifrost_metadata?.cost_usd ?? 0;
        this.releaseReservation(reservationId, actualCost);
        return data;
      } catch (networkErr) {
        // Fall back to auto-instantiated embedded gateway if external server is not listening
        if (!this.embeddedGateway) {
          this.embeddedGateway = new EmbeddedBifrostGateway();
          const response = await this.embeddedGateway.handleChatCompletion(
            this.virtualKey,
            req,
            this.fallbackProviders
          );
          const actualCost = response.bifrost_metadata?.cost_usd ?? 0;
          this.releaseReservation(reservationId, actualCost);
          return response;
        }
        throw networkErr;
      }
    } catch (err) {
      this.releaseReservation(reservationId, 0); // Release reservation without charging on error
      throw err;
    }
  }
}
