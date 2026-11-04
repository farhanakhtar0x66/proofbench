import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  BifrostBudgetExceededError,
} from './types';
import { EmbeddedBifrostGateway } from './embedded';
import { isLocalDestination, TRUSTED_LOCAL_PROVIDERS } from '../governance/policy';

export interface BifrostClientOptions {
  gatewayUrl?: string;
  virtualKey?: string;
  virtualKeyId?: string;
  embeddedGateway?: EmbeddedBifrostGateway;
  userBudgetLimitUsd?: number;
  fallbackProviders?: string[];
  mode?: 'live' | 'simulation';
  confidential?: boolean;
  timeoutMs?: number;
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
  public confidential: boolean;
  public timeoutMs: number;
  private activeReservations = new Map<string, number>();
  private embeddedGateway?: EmbeddedBifrostGateway;

  constructor(options: BifrostClientOptions = {}) {
    this.gatewayUrl = options.gatewayUrl ?? process.env.BIFROST_GATEWAY_URL ?? 'http://127.0.0.1:8089';
    this.confidential = options.confidential ?? false;
    this.fallbackProviders = options.fallbackProviders ?? (this.confidential ? ['ollama', 'local'] : ['ollama', 'opencode']);
    this.userBudgetLimitUsd = options.userBudgetLimitUsd ?? 5.0;
    this.timeoutMs = options.timeoutMs ?? 180_000;

    if (this.confidential) {
      const unauthorized = this.fallbackProviders.filter(
        (p) => !TRUSTED_LOCAL_PROVIDERS.includes(p.toLowerCase())
      );
      if (unauthorized.length > 0) {
        throw new Error(
          `Confidential repository policy violation: unauthorized external fallback provider(s) [${unauthorized.join(', ')}] detected. Confidential inference must be local-only end-to-end.`
        );
      }
    }
    this.mode = options.mode ?? (process.env.BIFROST_MODE === 'live' ? 'live' : (options.embeddedGateway ? 'simulation' : 'simulation'));
    
    // In live mode, read virtual key from env or options. Never use hardcoded keys.
    this.virtualKey = options.virtualKeyId ?? options.virtualKey ?? process.env.BIFROST_VIRTUAL_KEY ?? (this.mode === 'simulation' ? 'sk-bf-simulation-default' : '');
    if (this.mode === 'live' && !this.virtualKey) {
      throw new Error(
        'Missing Bifrost virtual key in live mode. Please set BIFROST_VIRTUAL_KEY environment variable or pass virtualKey in options.'
      );
    }

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

    // Confidentiality check: Never dispatch to remote endpoints or external fallback paths
    if (this.confidential) {
      if (!isLocalDestination(this.gatewayUrl)) {
        throw new Error(
          `Confidential repository policy violation: gateway URL '${this.gatewayUrl}' is a remote or external endpoint. Only verified local loopback destinations (127.0.0.1 / localhost) are eligible.`
        );
      }
      const unauthorized = fallbackProviders.filter(
        (p) => !TRUSTED_LOCAL_PROVIDERS.includes(p.toLowerCase())
      );
      if (unauthorized.length > 0) {
        throw new Error(
          `Confidential repository policy violation: unauthorized external fallback provider(s) [${unauthorized.join(', ')}] detected. Confidential inference must be local-only end-to-end.`
        );
      }
    }

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
        signal: AbortSignal.timeout(this.timeoutMs),
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

      // Real token counts reported by provider through Bifrost (preserve missing as undefined)
      const promptTokens = data.usage?.prompt_tokens;
      const completionTokens = data.usage?.completion_tokens;
      const hasTokens = typeof promptTokens === 'number' && typeof completionTokens === 'number';
      const estimatedCostUsd = hasTokens
        ? (promptTokens * 0.00000015) + (completionTokens * 0.0000006)
        : 0;

      const metadata = {
        virtual_key_id: this.virtualKey,
        provider,
        model: resolvedModel,
        fallback_invoked: isFallback,
        latency_ms: upstreamLatency,
        cost_usd: Number(estimatedCostUsd.toFixed(6)),
        cost_estimated: hasTokens,
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
