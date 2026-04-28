/**
 * GRAIL HTTP client. Thin typed wrapper around the REST API.
 *
 * All endpoints under /v1; auth is x-api-key header (PARTNER scope).
 * Auth/* endpoints accept no api key — see auth.ts.
 */

import type {
  ApiKeyMetadata,
  ChallengeRequest,
  ChallengeResponse,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
  CreateUserRequest,
  Denomination,
  GrailError,
  QuoteBuyRequest,
  QuoteRedemptionRequest,
  QuoteRedemptionResponse,
  QuoteResponse,
  QuoteSellRequest,
  Redemption,
  SubmitTxRequest,
  SubmitTxResponse,
  Trade,
  User,
} from "./types";

export interface GrailClientConfig {
  baseUrl: string;
  apiKey?: string;
}

export class GrailApiError extends Error {
  status: number;
  code: string;
  field?: string;
  constructor(status: number, body: GrailError | { error?: string; message?: string }) {
    super(body.message || body.error || `HTTP ${status}`);
    this.status = status;
    this.code = (body as GrailError).error || "unknown";
    this.field = (body as GrailError).field;
  }
}

export class GrailClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(config: GrailClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async req<T>(
    method: string,
    path: string,
    opts: { body?: unknown; auth?: boolean; query?: Record<string, string | undefined> } = {},
  ): Promise<T> {
    const auth = opts.auth ?? true;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth) {
      if (!this.apiKey) throw new Error("GRAIL: api key required but not set");
      headers["x-api-key"] = this.apiKey;
    }

    let url = `${this.baseUrl}${path}`;
    if (opts.query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== "") qs.set(k, v);
      }
      const s = qs.toString();
      if (s) url += `?${s}`;
    }

    // Retry on 5xx / network errors with exponential backoff. 4xx surfaces immediately.
    const maxAttempts = 3;
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });
      } catch (e) {
        lastErr = e;
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        throw e;
      }

      const text = await res.text();
      let parsed: unknown;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { error: "parse_error", message: text }; }

      if (!res.ok) {
        // 5xx is transient — backoff and retry. 4xx is a real error.
        if (res.status >= 500 && attempt < maxAttempts - 1) {
          lastErr = new GrailApiError(res.status, parsed as GrailError);
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        throw new GrailApiError(res.status, parsed as GrailError);
      }
      return parsed as T;
    }
    throw lastErr instanceof Error ? lastErr : new Error("GRAIL request exhausted retries");
  }

  // ============================================================
  // Health
  // ============================================================

  health() {
    return this.req<{ status: string }>("GET", "/health", { auth: false });
  }

  // ============================================================
  // Auth (no api key)
  // ============================================================

  requestChallenge(body: ChallengeRequest) {
    return this.req<ChallengeResponse>("POST", "/v1/auth/challenge", { body, auth: false });
  }

  createApiKey(body: CreateApiKeyRequest) {
    return this.req<CreateApiKeyResponse>("POST", "/v1/auth/api-key", { body, auth: false });
  }

  // ============================================================
  // Partner
  // ============================================================

  listApiKeys() {
    return this.req<{ api_keys: ApiKeyMetadata[] }>("GET", "/v1/partner/api-keys");
  }

  revokeApiKey(keyId: string) {
    return this.req<{ key_id: string; status: "revoked" }>("DELETE", `/v1/partner/api-keys/${keyId}`);
  }

  // ============================================================
  // Users
  // ============================================================

  createUser(body: CreateUserRequest) {
    return this.req<User>("POST", "/v1/users", { body });
  }

  getUser(grailUserId: string) {
    return this.req<User>("GET", `/v1/users/${grailUserId}`);
  }

  listUsers(query?: { status?: "active" | "suspended"; user_id?: string }) {
    return this.req<{ users: User[] }>("GET", "/v1/users", { query });
  }

  // ============================================================
  // Trades
  // ============================================================

  quoteBuy(body: QuoteBuyRequest) {
    return this.req<QuoteResponse>("POST", "/v1/buy", { body });
  }

  submitBuy(tradeId: string, body: SubmitTxRequest) {
    return this.req<SubmitTxResponse>("POST", `/v1/buy/${tradeId}/submit`, { body });
  }

  quoteSell(body: QuoteSellRequest) {
    return this.req<QuoteResponse>("POST", "/v1/sell", { body });
  }

  submitSell(tradeId: string, body: SubmitTxRequest) {
    return this.req<SubmitTxResponse>("POST", `/v1/sell/${tradeId}/submit`, { body });
  }

  getTrade(tradeId: string) {
    return this.req<Trade>("GET", `/v1/trades/${tradeId}`);
  }

  listTrades(query?: { side?: "buy" | "sell"; grail_user_id?: string; limit?: string }) {
    return this.req<{ trades: Trade[] }>("GET", "/v1/trades", { query });
  }

  // ============================================================
  // Redemptions
  // ============================================================

  listDenominations(country: string) {
    return this.req<{ denominations: Denomination[] }>("GET", "/v1/denominations", {
      query: { country },
    });
  }

  quoteRedemption(body: QuoteRedemptionRequest) {
    return this.req<QuoteRedemptionResponse>("POST", "/v1/redemptions", { body });
  }

  submitRedemption(redemptionId: string, body: SubmitTxRequest) {
    return this.req<SubmitTxResponse>("POST", `/v1/redemptions/${redemptionId}/submit`, { body });
  }

  getRedemption(redemptionId: string) {
    return this.req<Redemption>("GET", `/v1/redemptions/${redemptionId}`);
  }

  listRedemptions(query?: { status?: string; grail_user_id?: string }) {
    return this.req<{ redemptions: Redemption[] }>("GET", "/v1/redemptions", { query });
  }

  cancelRedemption(redemptionId: string) {
    return this.req<{ redemption_id: string; status: "cancellation_requested" }>(
      "POST",
      `/v1/redemptions/${redemptionId}/cancel`,
    );
  }
}
