/**
 * Server-side input validation helpers shared by /api/deposit and /api/withdraw.
 *
 * Keep this file conservative — every validator should fail fast with a clear
 * error code so the client can surface the right message.
 */

import { PublicKey } from "@solana/web3.js";

export interface ValidationError {
  field: string;
  code: string;
  message: string;
}

export function validatePublicKey(field: string, value: unknown): ValidationError | null {
  if (typeof value !== "string" || value.length === 0) {
    return { field, code: "missing", message: `${field} is required` };
  }
  try {
    new PublicKey(value);
    return null;
  } catch {
    return { field, code: "invalid_pubkey", message: `${field} is not a valid Solana public key` };
  }
}

/** Solana signatures are base58, 64-byte = 87-88 char strings. Cheap shape check. */
export function validateTxSignature(field: string, value: unknown): ValidationError | null {
  if (typeof value !== "string" || value.length === 0) {
    return { field, code: "missing", message: `${field} is required` };
  }
  if (value.length < 80 || value.length > 100) {
    return { field, code: "invalid_signature", message: `${field} is not a valid Solana signature` };
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(value)) {
    return { field, code: "invalid_signature", message: `${field} contains non-base58 characters` };
  }
  return null;
}

/**
 * Bounded amount check (lamports). Defaults: ≥ 100_000 (0.1 USDC at 6 dec) and
 * ≤ env MAX_DEPOSIT_USDC_LAMPORTS (default 100M USDC). Tighten via env in prod.
 */
export function validateAmount(
  field: string,
  amountLamports: number,
  opts?: { minLamports?: number; maxLamports?: number },
): ValidationError | null {
  const minLamports = opts?.minLamports ?? 100_000;
  const envMax = Number(process.env.MAX_DEPOSIT_USDC_LAMPORTS) || 100_000_000_000_000;
  const maxLamports = opts?.maxLamports ?? envMax;

  if (!Number.isFinite(amountLamports) || amountLamports <= 0) {
    return { field, code: "invalid_amount", message: `${field} must be a positive number` };
  }
  if (amountLamports < minLamports) {
    return {
      field,
      code: "below_min",
      message: `${field} below minimum (${minLamports / 1e6} USDC)`,
    };
  }
  if (amountLamports > maxLamports) {
    return {
      field,
      code: "above_max",
      message: `${field} above per-tx maximum (${maxLamports / 1e6} USDC)`,
    };
  }
  return null;
}

/**
 * Structured 4xx response body. The route wraps this with NextResponse.json(..., {status}).
 */
export function badRequest(error: ValidationError) {
  return {
    success: false as const,
    error: error.message,
    code: error.code,
    field: error.field,
  };
}
