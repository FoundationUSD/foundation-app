/**
 * ORO integration — tokenized physical gold on Solana.
 *
 * $GOLD mint: GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A
 * Program:    TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA (SPL Token legacy)
 * Decimals:   6
 * Custody:    Physical gold vaulted with regulated custodians (LBMA certified, insured)
 * Docs:       https://orogold-1.gitbook.io/oro
 *
 * ## Strategy (v0 — Jupiter swap, "just hold")
 *
 * We swap USDC → $GOLD on Jupiter and hold in the Foundation multisig. User
 * exposure tracks the live gold price. Withdrawal swaps back to USDC at the
 * prevailing rate. No lockup, no staking program (ORO's sORO/stGOLD is not yet
 * issued — staking yield requires their off-chain API + 12-month lockup which
 * breaks the "withdraw anytime" UX).
 *
 * ## Yield sources (v0)
 * 1. Gold spot price appreciation (primary — users bear gold-denominated risk)
 * 2. Any airdrops ORO distributes to holders from leasing programs
 *
 * ## Phase 2 (not implemented — requires ORO team API spec)
 * Actual staking into ORO's leasing pool for the documented 3-5% APY. This needs:
 *   - GRAIL API endpoint + auth
 *   - Off-chain commitment flow with 12-month lockup tracking
 *   - Receipt accounting so user shares reflect their locked position
 * Track this as a separate vault tier (`fdn-oro-staked`) once ORO ships the API.
 */

import { createSolanaRpc } from "@solana/kit";
import { fetchMaybeMint } from "@solana-program/token";
import { ORO_GOLD_DECIMALS, ORO_GOLD_MINT, SOLANA_RPC_URL, USDC_MINT } from "@/lib/constants";

const JUPITER_QUOTE_API = "https://lite-api.jup.ag/swap/v1/quote";

export interface OroProtocolData {
  goldMint: string;
  goldSupply: number;          // whole GOLD tokens (≈ 608.4 as of Apr 2026)
  pricePerGoldUsd: number;     // USDC per GOLD (≈ 4800 April 2026)
  estimatedApy: number;        // documented 3-5% leasing APY (aspirational until staking wired)
  marketCapUsd: number;
  // Jupiter price impact for the canonical 1000 USDC test swap — proxies liquidity depth
  priceImpactBps1K: number;
}

/**
 * Fetch a Jupiter quote. Returns the out-amount for the given in-amount.
 * `inputMint` and `outputMint` must be base58 strings. `amount` in smallest units.
 */
export async function jupiterQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
}): Promise<{ outAmount: number; priceImpactBps: number; route: string } | null> {
  try {
    const url =
      `${JUPITER_QUOTE_API}?inputMint=${params.inputMint}` +
      `&outputMint=${params.outputMint}` +
      `&amount=${params.amount}` +
      `&slippageBps=${params.slippageBps ?? 50}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const q = await res.json();
    if (!q?.outAmount) return null;

    // Jupiter returns priceImpactPct as a decimal string (e.g. "0.00029")
    const priceImpactBps = Math.round(parseFloat(q.priceImpactPct ?? "0") * 10_000);
    const route = (q.routePlan ?? [])
      .map((r: { swapInfo?: { label?: string } }) => r.swapInfo?.label ?? "?")
      .join(" → ");

    return {
      outAmount: Number(q.outAmount),
      priceImpactBps,
      route,
    };
  } catch {
    return null;
  }
}

/**
 * Live ORO protocol snapshot. Reads mint supply on-chain + pulls a Jupiter quote
 * for price discovery. Falls back gracefully on RPC or Jupiter failure.
 */
export async function getOroData(): Promise<OroProtocolData> {
  const fallback: OroProtocolData = {
    goldMint: ORO_GOLD_MINT.toString(),
    goldSupply: 0,
    pricePerGoldUsd: 0,
    estimatedApy: 3.5,
    marketCapUsd: 0,
    priceImpactBps1K: 0,
  };

  try {
    const rpc = createSolanaRpc(SOLANA_RPC_URL);

    const [mintResult, quote] = await Promise.all([
      fetchMaybeMint(rpc, ORO_GOLD_MINT, { commitment: "confirmed" }).catch(() => null),
      // 1000 USDC → GOLD quote serves both price + liquidity depth signal
      jupiterQuote({
        inputMint: USDC_MINT.toString(),
        outputMint: ORO_GOLD_MINT.toString(),
        amount: 1_000_000_000, // 1000 USDC
      }),
    ]);

    const goldSupply = mintResult?.exists
      ? Number(mintResult.data.supply) / 10 ** ORO_GOLD_DECIMALS
      : 0;

    let pricePerGoldUsd = 0;
    if (quote && quote.outAmount > 0) {
      // 1000 USDC bought `outAmount / 1e6` GOLD → price = 1000 / gold
      const goldOut = quote.outAmount / 10 ** ORO_GOLD_DECIMALS;
      pricePerGoldUsd = 1000 / goldOut;
    }

    return {
      goldMint: ORO_GOLD_MINT.toString(),
      goldSupply,
      pricePerGoldUsd,
      estimatedApy: 3.5,
      marketCapUsd: goldSupply * pricePerGoldUsd,
      priceImpactBps1K: quote?.priceImpactBps ?? 0,
    };
  } catch (error) {
    console.error("Failed to fetch ORO data:", error);
    return fallback;
  }
}

/**
 * Convert a USDC amount (6 decimals) to the GOLD amount (6 decimals) we'd receive
 * at the current Jupiter quote. Returns `null` if no quote is available.
 * Slippage guard enforced client-side (default 50 bps).
 */
export async function quoteUsdcToGold(
  usdcAmount: number,
  slippageBps = 50,
): Promise<{ expectedGoldUnits: number; priceImpactBps: number; route: string } | null> {
  const quote = await jupiterQuote({
    inputMint: USDC_MINT.toString(),
    outputMint: ORO_GOLD_MINT.toString(),
    amount: usdcAmount,
    slippageBps,
  });
  if (!quote) return null;
  return {
    expectedGoldUnits: quote.outAmount,
    priceImpactBps: quote.priceImpactBps,
    route: quote.route,
  };
}

/**
 * Inverse: estimate USDC received for selling `goldUnits` (6 decimals) of $GOLD.
 */
export async function quoteGoldToUsdc(
  goldUnits: number,
  slippageBps = 50,
): Promise<{ expectedUsdcUnits: number; priceImpactBps: number; route: string } | null> {
  const quote = await jupiterQuote({
    inputMint: ORO_GOLD_MINT.toString(),
    outputMint: USDC_MINT.toString(),
    amount: goldUnits,
    slippageBps,
  });
  if (!quote) return null;
  return {
    expectedUsdcUnits: quote.outAmount,
    priceImpactBps: quote.priceImpactBps,
    route: quote.route,
  };
}
