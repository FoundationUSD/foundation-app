/**
 * Solomon Labs integration — direct on-chain staking via Anchor.
 *
 *   Stake Program: HSnn7bDvkZSEwujZDPtUcdo9KL7Conycgmy8m6mBFD5
 *   USDv Mint:     Ex5DaKYMCN6QWFA4n67TmMwsH8MJV68RX6YXTmVM532C  (SPL, 9 dec)
 *   sUSDV Mint:    pTA4St7D5WshfLUPBXoaxn5m8e3k2ort2DVt3gUTa17  (SPL, 9 dec)
 *
 * Staking is permissionless. Unstake cooldown is read live from `VaultState.cooldown`
 * (admin-mutable; currently 7 days).
 *
 * Exchange rate is computed from `effectiveAssets / sUSDV supply` where
 * `effectiveAssets = totalAssets - unvestedAmount`. This matches the formula
 * Solomon's own UI uses; the raw `vaultUsdv / supply` ratio overstates the
 * rate during a vesting window because it counts rewards that haven't yet
 * accrued to stakers.
 */

import { createSolanaRpc } from "@solana/kit";
import { fetchMaybeMint } from "@solana-program/token";
import { Connection, PublicKey } from "@solana/web3.js";
import { SOLOMON_SUSDV_MINT, SOLOMON_USDV_MINT, SOLANA_RPC_URL } from "@/lib/constants";

export const SOLOMON_STAKE_PROGRAM_ID = "HSnn7bDvkZSEwujZDPtUcdo9KL7Conycgmy8m6mBFD5";
export const SOLOMON_VAULT_SALT = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);

const STAKE_PROGRAM_PK = new PublicKey(SOLOMON_STAKE_PROGRAM_ID);

// VaultState account discriminator from solomon-stake IDL.
const VAULT_STATE_DISCRIMINATOR = Buffer.from([228, 196, 82, 165, 98, 210, 235, 152]);

export interface SolomonProtocolData {
  usdvMint: string;
  susdvMint: string;
  usdvSupply: number;
  susdvSupply: number;
  /** USDv per sUSDV (effectiveAssets / supply). 1.0 means parity. */
  exchangeRate: number;
  /** Live cooldown in seconds (admin-mutable). null when state cannot be read. */
  cooldownSeconds: number | null;
  /** Annualized APY % computed from the cron's exchange-rate snapshot history. */
  estimatedApy: number;
}

export interface SolomonVaultState {
  totalAssets: number;
  vestingAmount: number;
  lastDistributionTime: number;
  vestingPeriod: number;
  cooldown: number;
  minShares: number;
}

/**
 * Calculate unvested amount (still vesting, not yet distributed)
 */
export function getUnvestedAmount(
  vestingAmount: number,
  lastDistributionTime: number,
  vestingPeriod: number,
): number {
  if (vestingAmount === 0) return 0;
  const now = Date.now() / 1000;
  const timePassed = now - lastDistributionTime;
  if (timePassed >= vestingPeriod) return 0;
  const remainingTime = vestingPeriod - timePassed;
  return (remainingTime * vestingAmount) / vestingPeriod;
}

/**
 * Convert USDv amount to sUSDV shares
 */
export function convertToShares(
  assetAmount: number,
  totalAssets: number,
  unvestedAmount: number,
  totalSupply: number,
): number {
  if (totalAssets === 0) return assetAmount;
  const effectiveAssets = totalAssets - unvestedAmount;
  return (assetAmount * totalSupply) / effectiveAssets;
}

/**
 * Convert sUSDV shares to USDv amount
 */
export function convertToAssets(
  sharesAmount: number,
  totalAssets: number,
  unvestedAmount: number,
  totalSupply: number,
): number {
  if (totalSupply === 0) return sharesAmount;
  const effectiveAssets = totalAssets - unvestedAmount;
  return (sharesAmount * effectiveAssets) / totalSupply;
}

/**
 * Derive the canonical stake VaultState PDA at seeds ["vault-state", salt].
 */
export function getVaultStatePda(salt: Uint8Array = SOLOMON_VAULT_SALT): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault-state"), Buffer.from(salt)],
    STAKE_PROGRAM_PK,
  )[0];
}

export interface SolomonVaultStateRaw {
  totalAssets: bigint;
  vestingAmount: bigint;
  lastDistributionTime: number;
  vestingPeriod: number;
  cooldown: number;
  minShares: bigint;
}

/**
 * Decode a VaultState account from raw bytes.
 *
 * Layout (from solomon-stake IDL, after the 8-byte Anchor discriminator):
 *   admin               pubkey  (32)
 *   deposit_token       pubkey  (32)
 *   vesting_amount      u64     (8)
 *   total_assets        u64     (8)
 *   min_shares          u64     (8)
 *   last_distribution   u32     (4)
 *   cooldown            u32     (4)
 *   vesting_period      u32     (4)
 *   bump                u8      (1)
 *   rewarders           Vec     (skipped)
 */
function decodeVaultState(data: Buffer): SolomonVaultStateRaw | null {
  if (data.length < 8 + 32 + 32 + 8 + 8 + 8 + 4 + 4 + 4 + 1) return null;
  if (!data.subarray(0, 8).equals(VAULT_STATE_DISCRIMINATOR)) return null;
  let off = 8 + 32 + 32; // skip disc + admin + deposit_token
  const vestingAmount = data.readBigUInt64LE(off); off += 8;
  const totalAssets = data.readBigUInt64LE(off); off += 8;
  const minShares = data.readBigUInt64LE(off); off += 8;
  const lastDistributionTime = data.readUInt32LE(off); off += 4;
  const cooldown = data.readUInt32LE(off); off += 4;
  const vestingPeriod = data.readUInt32LE(off); off += 4;
  return {
    totalAssets,
    vestingAmount,
    lastDistributionTime,
    vestingPeriod,
    cooldown,
    minShares,
  };
}

export async function fetchVaultState(
  connection: Connection,
  salt: Uint8Array = SOLOMON_VAULT_SALT,
): Promise<SolomonVaultStateRaw | null> {
  const pda = getVaultStatePda(salt);
  const acc = await connection.getAccountInfo(pda, "confirmed");
  if (!acc) return null;
  return decodeVaultState(acc.data);
}

/**
 * Read live Solomon protocol data on-chain.
 *
 * Exchange rate is computed using effectiveAssets (= totalAssets − unvestedAmount)
 * over the sUSDV supply. APY is left at 0 here — the cron computes it from
 * historical exchange-rate snapshots and is the canonical source of record.
 */
export async function getSolomonData(): Promise<SolomonProtocolData> {
  try {
    const rpc = createSolanaRpc(SOLANA_RPC_URL);
    const conn = new Connection(SOLANA_RPC_URL, "confirmed");

    const [usdvMintResult, susdvMintResult, vaultState] = await Promise.all([
      fetchMaybeMint(rpc, SOLOMON_USDV_MINT, { commitment: "confirmed" }).catch(() => null),
      fetchMaybeMint(rpc, SOLOMON_SUSDV_MINT, { commitment: "confirmed" }).catch(() => null),
      fetchVaultState(conn).catch(() => null),
    ]);

    const usdvSupply = usdvMintResult?.exists ? Number(usdvMintResult.data.supply) / 1e9 : 0;
    const susdvSupply = susdvMintResult?.exists ? Number(susdvMintResult.data.supply) / 1e9 : 0;

    let exchangeRate = 1;
    let cooldownSeconds: number | null = null;
    if (vaultState) {
      cooldownSeconds = vaultState.cooldown;
      const totalAssets = Number(vaultState.totalAssets) / 1e9;
      const unvested = getUnvestedAmount(
        Number(vaultState.vestingAmount) / 1e9,
        vaultState.lastDistributionTime,
        vaultState.vestingPeriod,
      );
      const effective = Math.max(0, totalAssets - unvested);
      if (susdvSupply > 0 && effective > 0) {
        exchangeRate = effective / susdvSupply;
      }
    }

    return {
      usdvMint: SOLOMON_USDV_MINT,
      susdvMint: SOLOMON_SUSDV_MINT,
      usdvSupply,
      susdvSupply,
      exchangeRate,
      cooldownSeconds,
      // The cron is the source of truth for APY (annualized from rate-history
      // snapshots in Supabase). 0 here means the awy-leg integration falls
      // back to the spec value, which is the right behavior for first reads
      // before the cron has built up history.
      estimatedApy: 0,
    };
  } catch (error) {
    console.error("Failed to fetch Solomon data:", error);
    return {
      usdvMint: SOLOMON_USDV_MINT,
      susdvMint: SOLOMON_SUSDV_MINT,
      usdvSupply: 0,
      susdvSupply: 0,
      exchangeRate: 1,
      cooldownSeconds: null,
      estimatedApy: 0,
    };
  }
}

/**
 * Derive PDA for the Solomon stake vault state
 */
export function getStakeVaultStatePDA(): { pda: string; seeds: Buffer[] } {
  // PDA seeds: ["vault-state", salt]
  // This is computed client-side using Anchor's findProgramAddressSync
  const seeds = [
    Buffer.from("vault-state"),
    Buffer.from(SOLOMON_VAULT_SALT),
  ];
  return { pda: "", seeds };
}
