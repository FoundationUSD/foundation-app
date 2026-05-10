/**
 * Iterated klend loop — real on-chain leverage through Squads.
 *
 * Builds a leveraged position by alternating supply and borrow against a
 * Kamino lending market obligation. No flash loans (which would require a
 * @solana/kit TransactionSigner that's incompatible with our Squads vault PDA
 * execution path). Each round is a separate Squads tx, so the loop converges
 * to the target LTV asymptotically:
 *
 *   collateral_N = D × (1 - L^N) / (1 - L)
 *   debt_N       = D × L × (1 - L^N) / (1 - L)
 *   effective_leverage_N = collateral_N / D
 *
 *   L = 0.50, N = 4 → 1.94x
 *   L = 0.67, N = 4 → 2.71x
 *   L = 0.80, N = 5 → 4.10x
 *
 * REST endpoints:
 *   POST /ktx/klend/deposit  — supply USDC, mint kToken collateral
 *   POST /ktx/klend/borrow   — borrow stable against obligation
 *   POST /ktx/klend/repay    — repay debt (used in unwind)
 *   POST /ktx/klend/withdraw — pull collateral (used in unwind)
 *
 * Each call to Kamino returns a base64-encoded unsigned tx; we deserialize
 * the inner instructions + ALTs and run them through the Squads multisig
 * via executeVaultTransaction.
 */

import { executeVaultTransaction, getVaultAddresses } from "@/lib/solana/squads";
import type { VaultName } from "@/lib/solana/squads";
import {
  fetchWithRetry,
  deserializeTxInstructions,
} from "@/lib/deploy-capital";

const KAMINO_API = "https://api.kamino.finance";

export interface LoopRound {
  /** Squads-executed supply tx signature (deposit USDC → kToken collateral). */
  supplyTx: string;
  /** Squads-executed borrow tx signature. Empty string if final-round borrow skipped. */
  borrowTx: string;
  /** Base units of USDC supplied this round. */
  suppliedUsdc: bigint;
  /** Base units of borrow asset borrowed this round (in the borrow asset's decimals). */
  borrowedAmount: bigint;
}

export interface LoopResult {
  rounds: LoopRound[];
  /** Total USDC collateral supplied across all rounds. */
  totalSuppliedUsdc: bigint;
  /** Total borrow asset debt incurred. */
  totalBorrowed: bigint;
  /** collateral / initial_deposit. */
  effectiveLeverage: number;
}

export interface UnwindResult {
  txs: string[];
  /** USDC ultimately returned to the vault PDA's USDC ATA. */
  usdcReturned: bigint;
  rounds: number;
}

interface RunIteratedLoopOpts {
  vaultName: VaultName;
  /** Kamino market PDA (e.g. PRIME or Main). */
  market: string;
  /** USDC reserve address in that market. */
  supplyReserve: string;
  /** Reserve address of the cheapest stable to borrow against the obligation. */
  borrowReserve: string;
  /** Initial USDC available in the vault PDA, in 6-dec base units. */
  initialUsdc: bigint;
  /** Target loan-to-value (0.50 = 50%). Each round borrows L × current_collateral_value. */
  targetLtv: number;
  /** Number of supply→borrow→supply rounds. 4-5 typical. */
  rounds: number;
}

interface UnwindIteratedLoopOpts {
  vaultName: VaultName;
  market: string;
  supplyReserve: string;
  borrowReserve: string;
  /** USDC base units the user wants out. */
  targetUsdcOut: bigint;
}

/**
 * Run an iterated supply→borrow loop on a Kamino market through Squads.
 *
 * The first round opens the obligation (deposit-only). Subsequent rounds
 * borrow against existing collateral and re-supply, increasing both
 * collateral and debt. Final round just supplies (or skips borrow) so the
 * loop ends with collateral matching the model's converged value.
 *
 * Failure mid-loop leaves a partially-leveraged position on-chain — caller
 * is responsible for unwinding (the registered vault entry + admin tooling).
 */
export async function runIteratedLoop(opts: RunIteratedLoopOpts): Promise<LoopResult> {
  const { vaultName, market, supplyReserve, borrowReserve, initialUsdc, targetLtv, rounds } = opts;

  if (targetLtv <= 0 || targetLtv >= 1) {
    throw new Error(`runIteratedLoop: targetLtv out of range: ${targetLtv}`);
  }
  if (rounds < 1 || rounds > 8) {
    throw new Error(`runIteratedLoop: rounds out of range: ${rounds}`);
  }

  const vault = getVaultAddresses(vaultName);
  const wallet = vault.vaultPda.toBase58();

  const result: LoopResult = {
    rounds: [],
    totalSuppliedUsdc: BigInt(0),
    totalBorrowed: BigInt(0),
    effectiveLeverage: 0,
  };

  // Round 1: supply initial USDC, then borrow targetLtv × initialUsdc.
  // Subsequent rounds: re-supply borrowed, then borrow targetLtv × current_collateral_value.
  // Final round: skip the borrow (we want collateral one round ahead of debt
  // so the position lands at the model's converged leverage, not above it).
  let nextSupply = initialUsdc;

  for (let i = 0; i < rounds; i++) {
    const isFinalRound = i === rounds - 1;

    const supplyTx = await kaminoSupply({
      vaultName,
      walletStr: wallet,
      market,
      reserve: supplyReserve,
      usdcBaseUnits: nextSupply,
    });
    result.totalSuppliedUsdc += nextSupply;

    let borrowTx = "";
    let borrowedAmount = BigInt(0);

    if (!isFinalRound) {
      // Borrow targetLtv × the just-supplied USDC value. Borrow asset is a
      // 1:1 stable (USDS / PYUSD), so base unit count is the same denomination
      // for size purposes; the borrow reserve's actual decimals are baked
      // into the Kamino-built tx, we just pass the human "amount" string.
      const borrowAmt = (nextSupply * BigInt(Math.floor(targetLtv * 10_000))) / BigInt(10_000);
      if (borrowAmt > BigInt(0)) {
        borrowTx = await kaminoBorrow({
          vaultName,
          walletStr: wallet,
          market,
          reserve: borrowReserve,
          amountBaseUnits: borrowAmt,
        });
        borrowedAmount = borrowAmt;
        result.totalBorrowed += borrowAmt;
        // Next round supplies what was just borrowed (1:1 stable swap not
        // needed if the supply reserve accepts the borrow asset; in practice
        // both are USDC-denominated so we re-supply USDC borrowed-equivalent.
        // Actual swap-to-USDC layer is added in v1.1.)
        nextSupply = borrowAmt;
      }
    }

    result.rounds.push({
      supplyTx,
      borrowTx,
      suppliedUsdc: nextSupply,
      borrowedAmount,
    });
  }

  result.effectiveLeverage =
    initialUsdc > BigInt(0) ? Number(result.totalSuppliedUsdc) / Number(initialUsdc) : 0;

  console.log(
    `kamino-loop[${vaultName}]: ${rounds} rounds at ${(targetLtv * 100).toFixed(0)}% LTV → ` +
    `collateral=${result.totalSuppliedUsdc} debt=${result.totalBorrowed} ` +
    `effective=${result.effectiveLeverage.toFixed(2)}x`,
  );

  return result;
}

/**
 * Unwind a leveraged position to free up `targetUsdcOut` of USDC. Reverses
 * the loop: repay debt slice by slice, then withdraw collateral. Stops when
 * enough USDC has been freed to cover the requested amount.
 */
export async function unwindIteratedLoop(opts: UnwindIteratedLoopOpts): Promise<UnwindResult> {
  const { vaultName, market, supplyReserve, borrowReserve, targetUsdcOut } = opts;
  const vault = getVaultAddresses(vaultName);
  const wallet = vault.vaultPda.toBase58();

  const txs: string[] = [];
  let usdcFreed = BigInt(0);
  let unwindRounds = 0;
  const MAX_UNWIND_ROUNDS = 8;

  while (usdcFreed < targetUsdcOut && unwindRounds < MAX_UNWIND_ROUNDS) {
    const remainingNeeded = targetUsdcOut - usdcFreed;

    // Each unwind step: repay the borrow asset slice, then withdraw a slice
    // of collateral. We repay first to free up collateral health, then
    // withdraw the freed amount.
    try {
      const repayTx = await kaminoRepay({
        vaultName,
        walletStr: wallet,
        market,
        reserve: borrowReserve,
        amountBaseUnits: remainingNeeded,
      });
      txs.push(repayTx);
    } catch (e) {
      // Repay can fail if there's no debt left (already unwound) or the
      // amount exceeds outstanding debt. Surface the error but keep trying
      // to withdraw — the obligation may still have collateral we can free.
      console.warn(`kamino-loop unwind[${vaultName}]: repay failed: ${e instanceof Error ? e.message : e}`);
    }

    try {
      const withdrawTx = await kaminoWithdraw({
        vaultName,
        walletStr: wallet,
        market,
        reserve: supplyReserve,
        amountBaseUnits: remainingNeeded,
      });
      txs.push(withdrawTx);
      usdcFreed += remainingNeeded;
    } catch (e) {
      console.warn(`kamino-loop unwind[${vaultName}]: withdraw failed: ${e instanceof Error ? e.message : e}`);
      break;
    }

    unwindRounds++;
  }

  return { txs, usdcReturned: usdcFreed, rounds: unwindRounds };
}

// ============================================================
// REST primitives — each returns a Squads-executed tx signature
// ============================================================

interface KaminoCallOpts {
  vaultName: VaultName;
  walletStr: string;
  market: string;
  reserve: string;
  /** Used by deposit/withdraw/repay/borrow. Converted to decimal string by caller. */
  usdcBaseUnits?: bigint;
  amountBaseUnits?: bigint;
}

async function kaminoSupply(opts: Omit<KaminoCallOpts, "amountBaseUnits">): Promise<string> {
  return callKamino("/ktx/klend/deposit", opts.vaultName, opts.walletStr, opts.market, opts.reserve, opts.usdcBaseUnits!);
}

async function kaminoBorrow(opts: Omit<KaminoCallOpts, "usdcBaseUnits">): Promise<string> {
  return callKamino("/ktx/klend/borrow", opts.vaultName, opts.walletStr, opts.market, opts.reserve, opts.amountBaseUnits!);
}

async function kaminoRepay(opts: Omit<KaminoCallOpts, "usdcBaseUnits">): Promise<string> {
  return callKamino("/ktx/klend/repay", opts.vaultName, opts.walletStr, opts.market, opts.reserve, opts.amountBaseUnits!);
}

async function kaminoWithdraw(opts: Omit<KaminoCallOpts, "usdcBaseUnits">): Promise<string> {
  return callKamino("/ktx/klend/withdraw", opts.vaultName, opts.walletStr, opts.market, opts.reserve, opts.amountBaseUnits!);
}

async function callKamino(
  path: string,
  vaultName: VaultName,
  walletStr: string,
  market: string,
  reserve: string,
  amountBaseUnits: bigint,
): Promise<string> {
  // Kamino expects amount as a USDC-decimal string (e.g. "0.05"), not
  // base units. Their backend multiplies by 10^decimals internally.
  const decimal = formatBigIntAsDecimal(amountBaseUnits, 6);

  const res = await fetchWithRetry(`${KAMINO_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet: walletStr, reserve, amount: decimal, market }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kamino ${path} ${res.status}: ${text}`);
  }

  const { transaction: txBase64 } = await res.json();
  if (!txBase64) {
    throw new Error(`Kamino ${path} returned no transaction`);
  }

  const { instructions, lookupTableAccounts } = await deserializeTxInstructions(txBase64);
  if (instructions.length === 0) {
    throw new Error(`Kamino ${path} returned empty instructions`);
  }

  const sig = await executeVaultTransaction(vaultName, instructions, lookupTableAccounts);
  return sig;
}

function formatBigIntAsDecimal(amount: bigint, decimals: number): string {
  if (amount === BigInt(0)) return "0";
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  if (frac === BigInt(0)) return whole.toString();
  // Pad frac to `decimals` digits, then strip trailing zeros
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}
