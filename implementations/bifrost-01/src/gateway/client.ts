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
  mode?: 'live' | 'simulation';
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
  public mode: 'live' | 'simulation';
  private activeReservations = new Map<string, number>();
  private embeddedGateway?: EmbeddedBifrostGateway;

  constructor(options: BifrostClientOptions = {}) {
    this.gatewayUrl = options.gatewayUrl ?? process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089';
    this.virtualKey = options.virtualKeyId ?? options.virtualKey ?? process.env.BIFROST_VIRTUAL_KEY ?? 'sk-bf-91b1d004-b51e-4a78-b326-e09b840e4b6e';
    this.fallbackProviders = options.fallbackProviders ?? ['ollama', 'opencode'];
    this.userBudgetLimitUsd = options.userBudgetLimitUsd ?? 5.0;
    this.mode = options.mode ?? (process.env.BIFROST_MODE === 'live' ? 'live' : (options.embeddedGateway ? 'simulation' : 'simulation'));
    this.embeddedGateway = options.embeddedGateway ?? (this.mode === 'simulation' ? new EmbeddedBifrostGateway() : undefined);
  }

  setEmbeddedGateway(gateway: EmbeddedBifrostGateway): void {
    this.embeddedGateway = gateway;
    this.mode = 'simulation';
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
      // Offline simulation mode (only when explicitly requested or configured with embedded gateway)
      if (this.mode === 'simulation' && this.embeddedGateway) {
        const response = await this.embeddedGateway.handleChatCompletion(
          this.virtualKey,
          req,
          fallbackProviders
        );
        const actualCost = response.bifrost_metadata?.cost_usd ?? 0;
        this.releaseReservation(reservationId, actualCost);
        return response;
      }

      // Live Bifrost Gateway Mode: Never silently fall back to simulation on error
      const url = `${this.gatewayUrl.replace(/\/$/, '')}/v1/chat/completions`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bf-vk': this.virtualKey,
          Authorization: `Bearer ${this.virtualKey}`,
          'x-bf-fallback-providers': fallbackProviders.join(','),
        },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(60_000),
      });

      if (res.status === 402 || res.status === 403) {
        const errText = await res.text();
        if (res.status === 402 || errText.includes('budget')) {
          throw new BifrostBudgetExceededError(
            `Bifrost gateway returned 402 Payment Required: budget exhausted for virtual key ${this.virtualKey}.`
          );
        }
        throw new Error(`Bifrost gateway access error (${res.status}): ${errText}`);
      }

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Bifrost gateway error (${res.status}): ${errBody}`);
      }

      const data = (await res.json()) as ChatCompletionResponse;

      // Extract observed metadata from genuine Bifrost response headers
      const providerHeader = res.headers.get('x-bifrost-provider');
      const extraProvider = typeof data.extra_fields?.provider === 'string' ? data.extra_fields.provider : undefined;
      const provider = providerHeader || extraProvider || 'bifrost';
      const resolvedModel = res.headers.get('x-bifrost-resolved-model') || data.model;
      const isFallback = res.headers.get('x-bifrost-routing-info-is-fallback') === 'true';
      const upstreamLatency = Number(res.headers.get('x-bifrost-upstream-latency-ms')) || 0;

      // Real token counts reported by provider through Bifrost
      const promptTokens = data.usage?.prompt_tokens ?? 0;
      const completionTokens = data.usage?.completion_tokens ?? 0;
      const estimatedCostUsd = (promptTokens * 0.00000015) + (completionTokens * 0.0000006);

      const metadata = {
        virtual_key_id: this.virtualKey,
        provider,
        model: resolvedModel,
        fallback_invoked: isFallback,
        latency_ms: upstreamLatency,
        cost_usd: Number(estimatedCostUsd.toFixed(6)),
        cost_estimated: true,
      };
      data.bifrost_metadata = metadata;

      this.releaseReservation(reservationId, metadata.cost_usd);
      return data;
    } catch (err) {
      this.releaseReservation(reservationId, 0); // Release reservation without charging on error
      throw err;
    }
  }
}
