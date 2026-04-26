/**
 * GRAIL API request/response types.
 * Source: https://docs.grail.oro.finance — verified Apr 2026.
 */

// ============================================================
// Auth
// ============================================================

export interface ChallengeRequest {
  wallet_address: string;
  partner_id: string;
}

export interface ChallengeResponse {
  challenge_id: string;
  message: string;
  expires_at: string;
}

export interface CreateApiKeyRequest {
  challenge_id: string;
  signature: string;
  key_name: string;
}

export interface CreateApiKeyResponse {
  api_key: string;
  key_id: string;
  scope: "PARTNER";
  key_name: string;
  wallet_address: string;
  created_at: string;
}

export interface ApiKeyMetadata {
  key_id: string;
  key_name: string;
  scope: "PARTNER";
  status: "active" | "revoked";
  wallet_address: string;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

// ============================================================
// Users
// ============================================================

export interface KycRecord {
  country: string;
  full_name: string;
  kyc_provider: string;
  kyc_level: "full";
  kyc_verified_at: string;
  kyc_data?: Record<string, unknown>;
}

export interface CreateUserRequest {
  user_id: string;
  wallet_address: string;
  kyc: KycRecord;
}

export interface User {
  grail_user_id: string;
  user_id: string;
  wallet_address: string;
  status: "active" | "suspended";
  created_at: string;
  kyc?: KycRecord;
}

// ============================================================
// Trades
// ============================================================

export interface QuoteBuyRequest {
  grail_user_id: string;
  usdc_amount: number;
  slippage_bps?: number;
  min_gold_out?: number;
}

export interface QuoteSellRequest {
  grail_user_id: string;
  gold_amount: number;
  slippage_bps?: number;
  min_usdc_out?: number;
}

export interface TradeQuote {
  usdc_amount: number;
  gold_amount: number;
  price_per_troy_oz: number;
  fee_bps: number;
  fee_usd: number;
  min_gold_out?: number;
  min_usdc_out?: number;
}

export interface QuoteResponse {
  trade_id: string;
  side: "buy" | "sell";
  quote: TradeQuote;
  partially_signed_transaction: string;
}

export interface SubmitTxRequest {
  signed_tx: string;
}

export interface SubmitTxResponse {
  trade_id: string;
  tx_hash: string;
}

export interface Trade {
  trade_id: string;
  side: "buy" | "sell";
  status: "confirmed" | "failed";
  usdc_amount: number;
  gold_amount: number;
  price_per_troy_oz: number;
  fee_bps: number;
  fee_usd: number;
  submitted_tx_hash: string;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Redemptions
// ============================================================

export interface Denomination {
  id: string;
  label: string;
  weight_g: number;
  weight_troy_oz: number;
  city: string;
}

export interface QuoteRedemptionRequest {
  grail_user_id: string;
  denomination_id: string;
  city: string;
}

export interface RedemptionQuote {
  denomination_id: string;
  label: string;
  weight_g: number;
  weight_troy_oz: number;
  city: string;
  gold_value_usd: number;
  fee_usd: number;
  total_usd: number;
  price_per_troy_oz: number;
}

export interface QuoteRedemptionResponse {
  redemption_id: string;
  quote: RedemptionQuote;
  partially_signed_transaction: string;
}

export type RedemptionStatus =
  | "submitted"
  | "preparing"
  | "ready"
  | "collected"
  | "cancellation_requested"
  | "cancelled";

export interface Redemption {
  redemption_id: string;
  grail_user_id: string;
  status: RedemptionStatus;
  denomination_id: string;
  label: string;
  city: string;
  weight_g: number;
  weight_troy_oz: number;
  gold_value_usd: number;
  fee_usd: number;
  total_usd: number;
  submitted_tx_hash: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Errors
// ============================================================

export interface GrailError {
  error: string;
  message: string;
  field?: string;
}
