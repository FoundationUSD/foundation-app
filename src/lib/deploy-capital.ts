/**
 * Capital deployment — auto-deploys USDC into underlying protocols after deposit,
 * and withdraws from protocols before returning USDC on withdrawal.
 *
 * Flow:
 *   Deposit:  User sends USDC → mint receipt tokens → deployCapital()
 *   Withdraw: User burns tokens → withdrawCapital() → send USDC back
 */

import {
  AddressLookupTableAccount,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAccount,
} from "@solana/spl-token";
import { executeVaultTransaction, getVaultAddresses } from "@/lib/solana/squads";
import type { VaultName } from "@/lib/solana/squads";
import bs58 from "bs58";

function getConnection(): Connection {
  const url = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  return new Connection(url, "confirmed");
}

function getAuthority(): Keypair {
  const secret = process.env.VAULT_AUTHORITY_SECRET;
  if (!secret) throw new Error("VAULT_AUTHORITY_SECRET not set");
  return Keypair.fromSecretKey(bs58.decode(secret));
}

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDV_MINT = new PublicKey("Ex5DaKYMCN6QWFA4n67TmMwsH8MJV68RX6YXTmVM532C");

const KAMINO_API = "https://api.kamino.finance";
const KAMINO_PRIME_MARKET = "CqAoLuqWtavaVE8deBjMKe8ZfSt9ghR6Vb8nfsyabyHA";
const KAMINO_PRIME_USDC_RESERVE = "9GJ9GBRwCp4pHmWrQ43L5xpc9Vykg7jnfwcFGN8FoHYu";
// PRIME stable borrow reserves — used by levered AWY tiers' iterated loop.
// USDS is the canonical levered-loop borrow asset per AWY-model (lowest mean
// borrow APY in the 30-day backtest). Fall back to PYUSD if USDS borrow
// liquidity is exhausted.
const KAMINO_PRIME_USDS_RESERVE = "7SzMWArC8WAenndXFmRyfvcvrNPodqUFkmPrmmoRZvn4";
// Kamino Syrup market (Kamino's internal id: "main") — the syrupUSDC leg's
// routing rail until Maple ships a Solana-native lending program. We supply
// USDC and earn the Syrup market's USDC supply rate; documented as a proxy
// in AWY composition copy. We keep the `MAIN` constant names because they
// match Kamino's API taxonomy; the user-facing name is "Syrup".
const KAMINO_MAIN_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";
const KAMINO_MAIN_USDC_RESERVE = "D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59";
// PYUSD borrow reserve on Kamino Syrup — cheapest stable borrow there per the
// AWY-model 30-day backtest. Used by the syrupUSDC slice's levered loop.
const KAMINO_MAIN_PYUSD_RESERVE = "2gc9Dm1eB6UgVYFBUN9bWks6Kes9PbWSaPaa9DqyvEiN";

const JUPITER_API = "https://lite-api.jup.ag/swap/v1";

/**
 * Default slippage for Jupiter swaps (bps). Override per-vault via env or per-call.
 * 50bps = 0.5% — reasonable for liquid stable pairs (USDC↔USDv, USDC↔$GOLD).
 * Reverse-swaps from less-liquid receipt tokens (USDv→USDC) widen to 100bps.
 */
const DEFAULT_SLIPPAGE_BPS = Number(process.env.SWAP_SLIPPAGE_BPS) || 50;
const REVERSE_SLIPPAGE_BPS = Number(process.env.SWAP_REVERSE_SLIPPAGE_BPS) || 100;
const ORO_GRAIL_SLIPPAGE_BPS = Number(process.env.ORO_GRAIL_SLIPPAGE_BPS) || 50;

/**
 * Retry wrapper for external HTTP APIs. Backs off on 503/504/network errors;
 * surfaces 4xx immediately (those are real client errors, not transient).
 */
export async function fetchWithRetry(url: string, init?: RequestInit, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      // 4xx = real error, don't retry. 5xx = transient, retry.
      if (res.status >= 400 && res.status < 500) return res;
      lastErr = new Error(`${res.status} ${res.statusText}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("fetchWithRetry exhausted attempts");
}

// AWY basket — spec weights match src/lib/integrations/awy AWY_COMPOSITION.
//
// v1 routing (active): until OnRe and Maple publish their Solana mints,
//   all three credit-flavored slices (ONyc 35 + PRIME 30 + Maple 25 = 90%) are
//   deployed into Kamino's PRIME lending market (which is the closest mainnet RWA
//   credit exposure available). The Solomon 10% slice routes through Solomon's
//   stake program: Jupiter swap USDC → USDv, then stake into sUSDV.
// Spec weights matching AWY_COMPOSITION in src/lib/integrations/awy/index.ts.
//   ONyc 35 / PRIME 25 / syrupUSDC 20 / Solomon 20
//
// ONyc routes through OnRe's permissionless mint program (`take_offer_permissionless`)
// — direct USDC → ONyc at NAV, no Jupiter, no KYC, US-geofenced via the UI.
// syrupUSDC routes via Jupiter swap (no Solana-native mint exists; the token is
// CCIP-bridged from Ethereum and only reachable through secondary markets).
// PRIME stays on Kamino's USDC supplier rail until Hastra publishes an SDK.
const AWY_WEIGHTS_BPS = { onyc: 3500, prime: 2500, syrup: 2000, solomon: 2000 };
const SYRUP_USDC_MINT_STR =
  process.env.NEXT_PUBLIC_SYRUP_USDC_MINT ||
  "AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj";

// Solomon stake program
const SOLOMON_PROGRAM = new PublicKey("HSnn7bDvkZSEwujZDPtUcdo9KL7Conycgmy8m6mBFD5");
const SOLOMON_VAULT_STATE = new PublicKey("BsPrkRjar8ktWagbcxsEzSBSpVnaj47nasjpFHWp1VMF");
const SOLOMON_VAULT_SALT_BYTES = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
const SOLOMON_VAULT_USDV_ACCOUNT = new PublicKey("4AZVLwe6KinAmV3p7Hpj4PYQHrAGXhbpcCCiqLYRxwHf");
const SOLOMON_MINT_AUTHORITY = new PublicKey("AFidqoSLvwSkv7HtCHiGBmdK6Sp32Me8jwSGvWKNkJVy");
const SOLOMON_EVENT_AUTHORITY = new PublicKey("FEunrQB7m6s2ZicCTvYJCfiPQAFfb4baCM7TaP8f37CU");
const SUSDV_MINT = new PublicKey("pTA4St7D5WshfLUPBXoaxn5m8e3k2ort2DVt3gUTa17");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// Instruction discriminators (from on-chain tx analysis)
const SOLOMON_STAKE_DISCRIMINATOR = Buffer.from("ceb0ca12c8d1b36c", "hex");
const SOLOMON_START_UNSTAKE_DISCRIMINATOR = Buffer.from("c8f36a6faa481f75", "hex");
const SOLOMON_UNSTAKE_DISCRIMINATOR = Buffer.from("5a5f6b2acd7c32e1", "hex");

// ============================================================
// Main dispatcher
// ============================================================

/**
 * Deploy USDC into the protocol after minting receipt tokens.
 * Called from /api/deposit after successful mint.
 */
export async function deployCapital(
  vaultName: VaultName,
  usdcAmount: number,
): Promise<{ success: boolean; tx?: string; error?: string }> {
  try {
    switch (vaultName) {
      case "kamino":
        return await deployToKamino("kamino", usdcAmount);
      case "solomon":
        return await deployToSolomon(usdcAmount);
      case "oro":
        return await deployToOro(usdcAmount);
      case "awy":
        return await deployToAwy(usdcAmount);
      case "awy2x":
      case "awy3x":
        return await deployToAwyLevered(vaultName, usdcAmount);
      default:
        return { success: false, error: `Unknown vault: ${vaultName}` };
    }
  } catch (error) {
    console.error(`deployCapital(${vaultName}) failed:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Deployment failed" };
  }
}

/**
 * Withdraw capital from the protocol before sending USDC back to user.
 * Called from /api/withdraw before USDC transfer.
 */
export async function withdrawCapital(
  vaultName: VaultName,
  usdcAmount: number,
): Promise<{ success: boolean; tx?: string; error?: string }> {
  try {
    switch (vaultName) {
      case "kamino":
        return await withdrawFromKamino("kamino", usdcAmount);
      case "solomon":
        return await withdrawFromSolomon(usdcAmount);
      case "oro":
        return await withdrawFromOro(usdcAmount);
      case "awy":
        return await withdrawFromAwy(usdcAmount);
      case "awy2x":
      case "awy3x":
        return await withdrawFromAwyLevered(vaultName, usdcAmount);
      default:
        return { success: false, error: `Unknown vault: ${vaultName}` };
    }
  } catch (error) {
    console.error(`withdrawCapital(${vaultName}) failed:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Withdrawal failed" };
  }
}

// ============================================================
// AWY Levered (2x / 3x) — real on-chain leverage via iterated klend loop
// ============================================================
//
// Per AWY-model spec:
//   - PRIME slice: USDC supply / USDS borrow on PRIME market
//   - syrupUSDC slice: USDC supply / PYUSD borrow on Kamino Syrup market (proxy)
//   - ONyc slice: stays unlevered (Kamino reserve not published yet)
//   - Solomon slice: stays unlevered (perp leverage internal to the basis trade)
//
// Tier configs:
//   AWY 2x: 50% target LTV, 4 rounds → ~1.94x effective on levered legs
//   AWY 3x: 80% target LTV, 5 rounds → ~4.10x effective on levered legs
//
// Round semantics: round N supplies USDC, then borrows L × supplied. Final
// round skips borrow so the position lands at the converged collateral
// without an extra debt slice. Effective leverage = total_collateral /
// initial_deposit. Real obligation, real liquidation risk; cron pushes the
// resulting net APY to the receipt mint.

interface AwyLeveredTier {
  /** Target LTV for both PRIME and syrupUSDC iterated loops (decimal). */
  ltv: number;
  /** Number of supply→borrow rounds. */
  rounds: number;
}

const AWY_TIER_2X: AwyLeveredTier = { ltv: 0.50, rounds: 4 };
const AWY_TIER_3X: AwyLeveredTier = { ltv: 0.80, rounds: 5 };

async function deployToAwyLevered(
  vaultName: "awy2x" | "awy3x",
  usdcAmount: number,
): Promise<{ success: boolean; tx?: string; error?: string; meta?: AwyLegResult[] }> {
  const tier = vaultName === "awy2x" ? AWY_TIER_2X : AWY_TIER_3X;
  const vault = getVaultAddresses(vaultName);
  const { runIteratedLoop } = await import("@/lib/integrations/kamino-loop");

  const onycAmt    = Math.floor((usdcAmount * AWY_WEIGHTS_BPS.onyc)  / 10_000);
  const primeAmt   = Math.floor((usdcAmount * AWY_WEIGHTS_BPS.prime) / 10_000);
  const syrupAmt   = Math.floor((usdcAmount * AWY_WEIGHTS_BPS.syrup) / 10_000);
  const solomonAmt = usdcAmount - onycAmt - primeAmt - syrupAmt;

  const results: AwyLegResult[] = [];

  // PRIME slice — levered via iterated loop on PRIME market USDC/USDS.
  if (primeAmt > 0) {
    try {
      const loop = await runIteratedLoop({
        vaultName,
        market: KAMINO_PRIME_MARKET,
        supplyReserve: KAMINO_PRIME_USDC_RESERVE,
        borrowReserve: KAMINO_PRIME_USDS_RESERVE,
        initialUsdc: BigInt(primeAmt),
        targetLtv: tier.ltv,
        rounds: tier.rounds,
      });
      console.log(
        `${vaultName}[prime]: levered ${primeAmt / 1e6} USDC at ${(tier.ltv * 100).toFixed(0)}% LTV ` +
        `→ ${loop.effectiveLeverage.toFixed(2)}x effective`,
      );
      results.push({
        leg: "prime",
        status: "deployed",
        tx: loop.rounds[0]?.supplyTx,
        amountUsdc: primeAmt,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${vaultName}[prime] LEVERED LOOP FAILED:`, msg);
      results.push({ leg: "prime", status: "failed", amountUsdc: primeAmt, error: msg });
    }
  }

  // syrupUSDC slice — levered via iterated loop on Kamino Syrup USDC/PYUSD.
  if (syrupAmt > 0) {
    try {
      const loop = await runIteratedLoop({
        vaultName,
        market: KAMINO_MAIN_MARKET,
        supplyReserve: KAMINO_MAIN_USDC_RESERVE,
        borrowReserve: KAMINO_MAIN_PYUSD_RESERVE,
        initialUsdc: BigInt(syrupAmt),
        targetLtv: tier.ltv,
        rounds: tier.rounds,
      });
      console.log(
        `${vaultName}[syrup]: levered ${syrupAmt / 1e6} USDC at ${(tier.ltv * 100).toFixed(0)}% LTV ` +
        `→ ${loop.effectiveLeverage.toFixed(2)}x effective`,
      );
      results.push({
        leg: "syrup-usdc",
        status: "deployed",
        tx: loop.rounds[0]?.supplyTx,
        amountUsdc: syrupAmt,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${vaultName}[syrup] LEVERED LOOP FAILED:`, msg);
      results.push({ leg: "syrup-usdc", status: "failed", amountUsdc: syrupAmt, error: msg });
    }
  }

  // ONyc slice — unlevered take_offer at NAV (Kamino reserve not published).
  if (onycAmt > 0) {
    try {
      const { buildOnycTakeOfferIxs } = await import("@/lib/integrations/awy/onyc");
      const plan = await buildOnycTakeOfferIxs({
        user: vault.vaultPda,
        feePayer: vault.vaultPda,
        usdcAmount: BigInt(onycAmt),
      });
      const sig = await executeVaultTransaction(vaultName, plan.instructions);
      results.push({ leg: "onyc", status: "deployed", tx: sig, amountUsdc: onycAmt });
    } catch (e) {
      results.push({ leg: "onyc", status: "failed", amountUsdc: onycAmt, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Solomon slice — unlevered USDC → USDv swap (basis trade has internal leverage).
  if (solomonAmt > 0) {
    try {
      const swapSig = await jupiterSwap({
        vaultName,
        vaultPda: vault.vaultPda,
        inputMint: USDC_MINT,
        outputMint: USDV_MINT,
        amount: solomonAmt,
        slippageBps: DEFAULT_SLIPPAGE_BPS,
      });
      results.push({ leg: "solomon", status: "deployed", tx: swapSig, amountUsdc: solomonAmt });
    } catch (e) {
      results.push({ leg: "solomon", status: "failed", amountUsdc: solomonAmt, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const firstDeployedTx = results.find((r) => r.status === "deployed")?.tx;
  const allFailed = results.length > 0 && results.every((r) => r.status === "failed");

  console.log(
    `${vaultName} levered deploy(${usdcAmount / 1e6} USDC):`,
    results.map((r) => `${r.leg}=${r.status}`).join(" "),
  );

  return {
    success: !allFailed,
    tx: firstDeployedTx,
    meta: results,
    error: allFailed ? `All ${vaultName} legs failed` : undefined,
  };
}

async function withdrawFromAwyLevered(
  vaultName: "awy2x" | "awy3x",
  usdcAmount: number,
): Promise<{ success: boolean; tx?: string; error?: string }> {
  const vault = getVaultAddresses(vaultName);
  const connection = getConnection();
  const { unwindIteratedLoop } = await import("@/lib/integrations/kamino-loop");
  let remaining = usdcAmount;
  let lastTx: string | undefined;

  // 1. Idle USDC in vault PDA's USDC ATA (cheapest, instant).
  const usdcBalRes = await connection.getTokenAccountBalance(vault.usdcAta!).catch(() => null);
  const idleUsdc = usdcBalRes ? Number(usdcBalRes.value.amount) : 0;
  if (idleUsdc >= remaining) {
    return { success: true };
  }
  remaining -= idleUsdc;

  // 2. Unwind PRIME levered loop. Repays USDS debt, withdraws USDC collateral.
  if (remaining > 0) {
    try {
      const u = await unwindIteratedLoop({
        vaultName,
        market: KAMINO_PRIME_MARKET,
        supplyReserve: KAMINO_PRIME_USDC_RESERVE,
        borrowReserve: KAMINO_PRIME_USDS_RESERVE,
        targetUsdcOut: BigInt(remaining),
      });
      if (u.txs.length > 0) lastTx = u.txs[u.txs.length - 1];
      remaining -= Number(u.usdcReturned);
      console.log(`${vaultName} withdraw: PRIME unwind freed ${Number(u.usdcReturned) / 1e6} USDC`);
      if (remaining <= 0) return { success: true, tx: lastTx };
    } catch (e) {
      console.error(`${vaultName} withdraw: PRIME unwind failed:`, e);
    }
  }

  // 3. Unwind syrupUSDC levered loop on Kamino Syrup market.
  if (remaining > 0) {
    try {
      const u = await unwindIteratedLoop({
        vaultName,
        market: KAMINO_MAIN_MARKET,
        supplyReserve: KAMINO_MAIN_USDC_RESERVE,
        borrowReserve: KAMINO_MAIN_PYUSD_RESERVE,
        targetUsdcOut: BigInt(remaining),
      });
      if (u.txs.length > 0) lastTx = u.txs[u.txs.length - 1];
      remaining -= Number(u.usdcReturned);
      console.log(`${vaultName} withdraw: Main unwind freed ${Number(u.usdcReturned) / 1e6} USDC`);
      if (remaining <= 0) return { success: true, tx: lastTx };
    } catch (e) {
      console.error(`${vaultName} withdraw: Main unwind failed:`, e);
    }
  }

  // 4. Reverse-swap idle USDv (Solomon leg) → USDC if there's still a gap.
  if (remaining > 0) {
    const usdvAta = getAssociatedTokenAddressSync(USDV_MINT, vault.vaultPda, true, TOKEN_PROGRAM_ID);
    const usdvBalRes = await connection.getTokenAccountBalance(usdvAta).catch(() => null);
    const usdvBalance = usdvBalRes ? Number(usdvBalRes.value.amount) : 0;
    if (usdvBalance > 0) {
      const swapAmt = Math.min(usdvBalance, remaining * 1000);
      try {
        const sig = await jupiterSwap({
          vaultName,
          vaultPda: vault.vaultPda,
          inputMint: USDV_MINT,
          outputMint: USDC_MINT,
          amount: swapAmt,
          slippageBps: REVERSE_SLIPPAGE_BPS,
        });
        lastTx = sig;
        console.log(`${vaultName} withdraw: reverse-swapped ${swapAmt / 1e9} USDv → USDC`);
      } catch (e) {
        console.error(`${vaultName} withdraw: USDv reverse-swap failed:`, e);
      }
    }
  }

  if (!lastTx) {
    return {
      success: false,
      error: `${vaultName}: insufficient liquidity across levered legs to service withdrawal`,
    };
  }
  return { success: true, tx: lastTx };
}

// ============================================================
// Kamino — deposit/withdraw via REST API
// ============================================================

type KaminoMarketKind = "prime" | "main";

function kaminoMarketAddrs(kind: KaminoMarketKind): { market: string; reserve: string } {
  return kind === "main"
    ? { market: KAMINO_MAIN_MARKET, reserve: KAMINO_MAIN_USDC_RESERVE }
    : { market: KAMINO_PRIME_MARKET, reserve: KAMINO_PRIME_USDC_RESERVE };
}

/**
 * Vault-scoped Kamino USDC supply. Routes to either the PRIME RWA market
 * (kind="prime", default) or the Syrup market (kind="main" — Kamino's API
 * id; the user-facing name is "Kamino Syrup", used by the AWY
 * syrupUSDC leg). The vault PDA owns the kToken receipt; supply yield accrues
 * directly to whichever multisig deposited.
 */
async function deployToKamino(
  vaultName: VaultName,
  usdcAmount: number,
  kind: KaminoMarketKind = "prime",
): Promise<{ success: boolean; tx?: string; error?: string }> {
  const vault = getVaultAddresses(vaultName);
  const { market, reserve } = kaminoMarketAddrs(kind);

  // Kamino's REST API expects `amount` as a USDC decimal string (e.g. "0.05"),
  // not 6-decimal base units. Their backend multiplies by 10^6 internally to
  // get reserve liquidity. Sending base units → 1e6× over-deposit → "insufficient
  // funds" on the inner TransferChecked.
  const usdcDecimal = (usdcAmount / 1e6).toString();

  const res = await fetchWithRetry(`${KAMINO_API}/ktx/klend/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: vault.vaultPda.toBase58(),
      reserve,
      amount: usdcDecimal,
      market,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kamino deposit API ${res.status}: ${text}`);
  }

  const { transaction: txBase64 } = await res.json();
  const { instructions, lookupTableAccounts } = await deserializeTxInstructions(txBase64);

  if (instructions.length === 0) {
    throw new Error("Kamino API returned empty transaction");
  }

  const sig = await executeVaultTransaction(vaultName, instructions, lookupTableAccounts);
  console.log(`Kamino[${vaultName}/${kind}] deposit: ${usdcAmount / 1e6} USDC, tx: ${sig}`);
  return { success: true, tx: sig };
}

async function withdrawFromKamino(
  vaultName: VaultName,
  usdcAmount: number,
  kind: KaminoMarketKind = "prime",
): Promise<{ success: boolean; tx?: string; error?: string }> {
  const vault = getVaultAddresses(vaultName);
  const { market, reserve } = kaminoMarketAddrs(kind);

  const usdcDecimal = (usdcAmount / 1e6).toString();
  const res = await fetchWithRetry(`${KAMINO_API}/ktx/klend/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: vault.vaultPda.toBase58(),
      reserve,
      amount: usdcDecimal,
      market,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kamino withdraw API ${res.status}: ${text}`);
  }

  const { transaction: txBase64 } = await res.json();
  const { instructions, lookupTableAccounts } = await deserializeTxInstructions(txBase64);

  if (instructions.length === 0) {
    throw new Error("Kamino API returned empty transaction");
  }

  const sig = await executeVaultTransaction(vaultName, instructions, lookupTableAccounts);
  console.log(`Kamino[${vaultName}/${kind}] withdraw: ${usdcAmount / 1e6} USDC, tx: ${sig}`);
  return { success: true, tx: sig };
}

// ============================================================
// Solomon — Jupiter swap USDC→USDv, then stake via Solomon
// ============================================================

/**
 * Admin helper: stake any idle USDv sitting in a Solomon-style vault PDA.
 * Used to clean up USDv leftover from older deploys where the swap succeeded
 * but the stake step failed. Caller decides which vault (`solomon` standalone,
 * or in future `awy` if we re-enable AWY staking).
 */
export async function stakeIdleUsdv(
  vaultName: VaultName,
  usdvAmountBaseUnits: bigint,
): Promise<{ success: boolean; tx?: string; error?: string }> {
  try {
    const vault = getVaultAddresses(vaultName);
    const susdvAta = getAssociatedTokenAddressSync(SUSDV_MINT, vault.vaultPda, true, TOKEN_PROGRAM_ID);
    const ataIx = createAssociatedTokenAccountIdempotentInstruction(
      vault.vaultPda,
      susdvAta,
      vault.vaultPda,
      SUSDV_MINT,
      TOKEN_PROGRAM_ID,
    );
    const stakeIx = buildSolomonStakeInstruction(vault.vaultPda, usdvAmountBaseUnits);
    const sig = await executeVaultTransaction(vaultName, [ataIx, stakeIx]);
    console.log(`stakeIdleUsdv[${vaultName}]: staked ${Number(usdvAmountBaseUnits) / 1e9} USDv → sUSDV, tx: ${sig}`);
    return { success: true, tx: sig };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function deployToSolomon(usdcAmount: number): Promise<{ success: boolean; tx?: string; error?: string }> {
  const vault = getVaultAddresses("solomon");

  // Step 1: Jupiter swap USDC → USDv
  const swapSig = await jupiterSwap({
    vaultName: "solomon",
    vaultPda: vault.vaultPda,
    inputMint: USDC_MINT,
    outputMint: USDV_MINT,
    amount: usdcAmount,
    slippageBps: DEFAULT_SLIPPAGE_BPS,
  });

  console.log(`Solomon: swapped ${usdcAmount / 1e6} USDC → USDv, tx: ${swapSig}`);

  // Step 2: Stake USDv → sUSDV via Solomon program.
  // Solomon's Stake instruction requires `user_staking_token_account` (the
  // vault's sUSDV ATA) to exist *before* the call — otherwise Anchor 3012
  // (AccountNotInitialized) at runtime. We prepend a create-idempotent ATA
  // ix so first-ever stakes work without an out-of-band setup tx.
  const usdvAmount = BigInt(usdcAmount) * BigInt(1000); // 6 dec → 9 dec
  const susdvAta = getAssociatedTokenAddressSync(SUSDV_MINT, vault.vaultPda, true, TOKEN_PROGRAM_ID);
  const ataIx = createAssociatedTokenAccountIdempotentInstruction(
    vault.vaultPda,                     // payer (the vault PDA itself)
    susdvAta,                            // ATA address
    vault.vaultPda,                      // owner
    SUSDV_MINT,
    TOKEN_PROGRAM_ID,
  );
  const stakeIx = buildSolomonStakeInstruction(vault.vaultPda, usdvAmount);
  const stakeSig = await executeVaultTransaction("solomon", [ataIx, stakeIx]);
  console.log(`Solomon: staked ${Number(usdvAmount) / 1e9} USDv → sUSDV, tx: ${stakeSig}`);

  return { success: true, tx: stakeSig };
}

async function withdrawFromSolomon(usdcAmount: number): Promise<{ success: boolean; tx?: string; error?: string }> {
  const vault = getVaultAddresses("solomon");

  // Step 1: Start unstake sUSDV → USDv
  // Note: Solomon has a 7-day cooldown. StartUnstake burns sUSDV and creates
  // an unstake ticket. After cooldown, Unstake releases USDv.
  // For immediate withdrawals, we check if vault has idle USDv first.
  const connection = getConnection();
  const vaultUsdvAta = findAtaAddress(USDV_MINT.toBase58(), vault.vaultPda);
  const usdvBalance = await connection.getTokenAccountBalance(vaultUsdvAta).catch(() => null);
  const idleUsdv = usdvBalance ? Number(usdvBalance.value.amount) : 0;
  const neededUsdv = usdcAmount * 1000; // 6 dec → 9 dec

  if (idleUsdv < neededUsdv) {
    // Need to unstake — start the cooldown
    const sUsdvAmount = BigInt(neededUsdv - idleUsdv);
    try {
      const startUnstakeIx = buildSolomonStartUnstakeInstruction(vault.vaultPda, sUsdvAmount);
      const unstakeSig = await executeVaultTransaction("solomon", [startUnstakeIx]);
      console.log(`Solomon: started unstake of ${Number(sUsdvAmount) / 1e9} sUSDV, tx: ${unstakeSig}`);
      // Cooldown is 7 days — user will need to wait
      return { success: false, error: "Unstake initiated — 7-day cooldown. USDC will be available after cooldown completes." };
    } catch (err) {
      console.error("Solomon unstake failed:", err);
      // Fall through — try to swap whatever USDv is available
    }
  }

  // Step 2: Jupiter swap USDv → USDC
  const swapAmount = Math.min(idleUsdv, neededUsdv);
  if (swapAmount <= 0) {
    return { success: false, error: "No USDv available to swap. Unstake cooldown in progress." };
  }

  // Convert USDv (9 dec) back to USDC-equivalent amount (6 dec) for Jupiter
  const swapSig = await jupiterSwap({
    vaultName: "solomon",
    vaultPda: vault.vaultPda,
    inputMint: USDV_MINT,
    outputMint: USDC_MINT,
    amount: swapAmount,
    slippageBps: DEFAULT_SLIPPAGE_BPS,
  });

  console.log(`Solomon: swapped USDv → USDC, tx: ${swapSig}`);
  return { success: true, tx: swapSig };
}

// ============================================================
// ORO — GRAIL devnet (demo mode)
// ============================================================
//
// Phase-2 wiring: mainnet USDC stays idle in the Squads vault while the
// "deploy" step issues a real GRAIL trade on devnet using Foundation's hot
// partner + test-user keys. The on-chain GOLD lives on devnet under the test
// user wallet — purely demonstrative until ORO whitelists us for mainnet.
//
// On mainnet: same shape, different keys + base URL. The vault USDC will move
// through GRAIL via the partner+user co-sign flow defined in src/lib/integrations/grail.

async function deployToOro(usdcAmount: number): Promise<{ success: boolean; tx?: string; error?: string }> {
  const { makeGrailServerClient, loadGrailPartnerKeypair, loadGrailTestUserKeypair, loadGrailUserId } =
    await import("./integrations/grail/server");
  const { cosignBuyOrSell, withStaleBlockhashRetry } = await import("./integrations/grail/cosign");

  const client = makeGrailServerClient();
  const partner = loadGrailPartnerKeypair();
  const user = loadGrailTestUserKeypair();
  const grailUserId = loadGrailUserId();

  // GRAIL takes USDC in human units, not lamports.
  const usdcHuman = usdcAmount / 1e6;

  return await withStaleBlockhashRetry(async () => {
    const quote = await client.quoteBuy({
      grail_user_id: grailUserId,
      usdc_amount: usdcHuman,
      slippage_bps: ORO_GRAIL_SLIPPAGE_BPS,
    });
    const signedB64 = cosignBuyOrSell({
      partiallySignedTransactionB64: quote.partially_signed_transaction,
      partnerKeypair: partner,
      userKeypair: user,
    });
    const submit = await client.submitBuy(quote.trade_id, { signed_tx: signedB64 });
    console.log(`Oro[devnet]: bought ${usdcHuman} USDC of $GOLD (slippage ${ORO_GRAIL_SLIPPAGE_BPS}bps), trade=${quote.trade_id}, tx=${submit.tx_hash}`);
    return { success: true, tx: submit.tx_hash };
  });
}

async function withdrawFromOro(usdcAmount: number): Promise<{ success: boolean; tx?: string; error?: string }> {
  const { makeGrailServerClient, loadGrailPartnerKeypair, loadGrailTestUserKeypair, loadGrailUserId } =
    await import("./integrations/grail/server");
  const { cosignBuyOrSell, withStaleBlockhashRetry } = await import("./integrations/grail/cosign");

  const client = makeGrailServerClient();
  const partner = loadGrailPartnerKeypair();
  const user = loadGrailTestUserKeypair();
  const grailUserId = loadGrailUserId();

  // Estimate GOLD-to-sell from a fresh buy quote: usdc/oz at the current spot,
  // then invert to oz that approximates the requested USDC payout. GRAIL will
  // re-price on submit, so this is just a sizing heuristic.
  const usdcHuman = usdcAmount / 1e6;
  const probe = await client.quoteBuy({ grail_user_id: grailUserId, usdc_amount: usdcHuman });
  const pricePerOz = probe.quote.price_per_troy_oz;
  if (!pricePerOz || pricePerOz <= 0) {
    return { success: false, error: "GRAIL returned no spot price" };
  }
  const goldToSell = Number((usdcHuman / pricePerOz).toFixed(6));
  if (goldToSell <= 0) {
    return { success: false, error: "Computed sell amount rounds to zero" };
  }

  return await withStaleBlockhashRetry(async () => {
    const quote = await client.quoteSell({
      grail_user_id: grailUserId,
      gold_amount: goldToSell,
      slippage_bps: ORO_GRAIL_SLIPPAGE_BPS,
    });
    const signedB64 = cosignBuyOrSell({
      partiallySignedTransactionB64: quote.partially_signed_transaction,
      partnerKeypair: partner,
      userKeypair: user,
    });
    const submit = await client.submitSell(quote.trade_id, { signed_tx: signedB64 });
    console.log(`Oro[devnet]: sold ${goldToSell} GOLD for ~${usdcHuman} USDC (slippage ${ORO_GRAIL_SLIPPAGE_BPS}bps), trade=${quote.trade_id}, tx=${submit.tx_hash}`);
    return { success: true, tx: submit.tx_hash };
  });
}

// ============================================================
// AWY — basket: ONyc 35 / PRIME 30 / syrupUSDC 25 / Solomon (USDv) 10
// ============================================================
//
// Each leg is independent. A failure on one leg leaves the others intact and
// the unspent slice as idle USDC in the multisig. ONyc and syrupUSDC mints are
// env-gated — until those mints are wired, those slices stay idle (the receipt
// rate the cron sets accounts for this).

interface AwyLegResult {
  leg: "onyc" | "prime" | "syrup-usdc" | "solomon";
  status: "deployed" | "skipped" | "failed";
  tx?: string;
  amountUsdc: number;
  error?: string;
}

async function deployToAwy(usdcAmount: number): Promise<{ success: boolean; tx?: string; error?: string; meta?: AwyLegResult[] }> {
  const vault = getVaultAddresses("awy");

  // Per-leg amounts at spec weights (last leg takes the remainder so we don't
  // strand 1 lamport of USDC to integer rounding).
  const onycAmt    = Math.floor((usdcAmount * AWY_WEIGHTS_BPS.onyc)  / 10_000);
  const primeAmt   = Math.floor((usdcAmount * AWY_WEIGHTS_BPS.prime) / 10_000);
  const syrupAmt   = Math.floor((usdcAmount * AWY_WEIGHTS_BPS.syrup) / 10_000);
  const solomonAmt = usdcAmount - onycAmt - primeAmt - syrupAmt;

  const results: AwyLegResult[] = [];

  // ── PRIME leg: USDC supplied to Kamino's Figure PRIME lending market.
  if (primeAmt > 0) {
    try {
      const r = await deployToKamino("awy", primeAmt, "prime");
      if (r.success) {
        console.log(`AWY[prime]: deposited ${primeAmt / 1e6} USDC to Kamino PRIME (${r.tx})`);
      } else {
        console.error(`AWY[prime] FAILED:`, r.error);
      }
      results.push({
        leg: "prime",
        status: r.success ? "deployed" : "failed",
        tx: r.tx,
        amountUsdc: primeAmt,
        error: r.error,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`AWY[prime] THREW:`, msg);
      results.push({ leg: "prime", status: "failed", amountUsdc: primeAmt, error: msg });
    }
  }

  // ── ONyc leg: direct mint via OnRe's permissionless `take_offer` channel.
  //    Build the ATA-create + take_offer ixs and execute through the AWY
  //    Squads multisig (the vault PDA signs). Single tx, no Jupiter slippage.
  if (onycAmt > 0) {
    try {
      const { buildOnycTakeOfferIxs } = await import("@/lib/integrations/awy/onyc");
      const plan = await buildOnycTakeOfferIxs({
        user: vault.vaultPda,
        feePayer: vault.vaultPda,
        usdcAmount: BigInt(onycAmt),
      });
      const sig = await executeVaultTransaction("awy", plan.instructions);
      console.log(`AWY[onyc]: minted ~${plan.expectedOnycOut.toFixed(4)} ONyc from ${onycAmt / 1e6} USDC (${sig})`);
      results.push({ leg: "onyc", status: "deployed", tx: sig, amountUsdc: onycAmt });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`AWY[onyc] FAILED:`, msg);
      results.push({ leg: "onyc", status: "failed", amountUsdc: onycAmt, error: msg });
    }
  }

  // ── syrupUSDC leg: route USDC into the Kamino Syrup market (Kamino's
  //    `main` market id internally — the user-facing name is "Syrup"
  //    because that's where Maple's syrupUSDC liquidity lives).
  //    Maple's syrupUSDC on Solana is a CCIP burn-mint token with a Chainlink
  //    mintAuthority — there's no Solana-native lending program that accepts
  //    USDC and pays Maple yield. The closest mainnet-addressable proxy is
  //    Kamino's Syrup market USDC supply (~4.2% APY).
  if (syrupAmt > 0) {
    try {
      const r = await deployToKamino("awy", syrupAmt, "main");
      if (r.success) {
        console.log(`AWY[syrup]: deposited ${syrupAmt / 1e6} USDC to Kamino Syrup (${r.tx})`);
      } else {
        console.error(`AWY[syrup→main] FAILED:`, r.error);
      }
      results.push({
        leg: "syrup-usdc",
        status: r.success ? "deployed" : "failed",
        tx: r.tx,
        amountUsdc: syrupAmt,
        error: r.error,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`AWY[syrup→main] THREW:`, msg);
      results.push({ leg: "syrup-usdc", status: "failed", amountUsdc: syrupAmt, error: msg });
    }
  }

  // ── Solomon leg: Jupiter swap USDC → USDv only. Vault holds base USDv;
  //    no sUSDV staking. Staking added a second tx + a 7-day cooldown that
  //    blocked withdraw liquidity; holding USDv directly keeps the leg liquid
  //    and accruing yield via Solomon's vault rate updates.
  if (solomonAmt > 0) {
    try {
      const swapSig = await jupiterSwap({
        vaultName: "awy",
        vaultPda: vault.vaultPda,
        inputMint: USDC_MINT,
        outputMint: USDV_MINT,
        amount: solomonAmt,
        slippageBps: DEFAULT_SLIPPAGE_BPS,
      });
      console.log(`AWY[solomon]: swapped ${solomonAmt / 1e6} USDC → USDv (${swapSig})`);
      results.push({ leg: "solomon", status: "deployed", tx: swapSig, amountUsdc: solomonAmt });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`AWY[solomon] FAILED:`, msg);
      results.push({ leg: "solomon", status: "failed", amountUsdc: solomonAmt, error: msg });
    }
  }

  const firstDeployedTx = results.find((r) => r.status === "deployed")?.tx;
  const allFailed = results.length > 0 && results.every((r) => r.status === "failed");
  console.log(`AWY deploy(${usdcAmount / 1e6} USDC):`, results.map((r) => `${r.leg}=${r.status}`).join(" "));

  return {
    success: !allFailed,
    tx: firstDeployedTx,
    meta: results,
    error: allFailed ? "All AWY legs failed" : undefined,
  };
}

/**
 * Withdraw USDC proportionally from each deployed leg. Service order:
 *   1. Idle USDC (cheapest, instant)
 *   2. Kamino PRIME market (instant via klend redeem)
 *   3. Kamino Syrup market — where the syrupUSDC slice lives (instant)
 *   4. USDv reverse-swap via Jupiter (instant; AWY holds base USDv unstaked
 *      so no cooldown applies)
 *   5. ONyc redemption queue (async — OnRe admin fulfills within 24–72h)
 */
async function withdrawFromAwy(usdcAmount: number): Promise<{ success: boolean; tx?: string; error?: string }> {
  const vault = getVaultAddresses("awy");
  const connection = getConnection();
  let remaining = usdcAmount;
  let lastTx: string | undefined;

  const usdcBalRes = await connection.getTokenAccountBalance(vault.usdcAta!).catch(() => null);
  const idleUsdc = usdcBalRes ? Number(usdcBalRes.value.amount) : 0;
  if (idleUsdc >= remaining) {
    console.log(`AWY withdraw: ${remaining / 1e6} USDC served from idle balance`);
    return { success: true };
  }
  remaining -= idleUsdc;

  // Pull from PRIME (Kamino prime market) next
  if (remaining > 0) {
    try {
      const r = await withdrawFromKamino("awy", remaining, "prime");
      if (r.success && r.tx) {
        lastTx = r.tx;
        console.log(`AWY withdraw: pulled ${remaining / 1e6} USDC from Kamino PRIME, tx: ${r.tx}`);
        return { success: true, tx: lastTx };
      }
    } catch (e) {
      console.error("AWY withdraw: Kamino PRIME pull failed:", e);
    }
  }

  // Then Kamino Syrup market (where the syrupUSDC slice supplies USDC).
  // Kamino's internal market id for this venue is "main".
  if (remaining > 0) {
    try {
      const r = await withdrawFromKamino("awy", remaining, "main");
      if (r.success && r.tx) {
        lastTx = r.tx;
        console.log(`AWY withdraw: pulled ${remaining / 1e6} USDC from Kamino Syrup, tx: ${r.tx}`);
        return { success: true, tx: lastTx };
      }
    } catch (e) {
      console.error("AWY withdraw: Kamino Syrup pull failed:", e);
    }
  }

  // Reverse-swap idle USDv (Solomon leg) → USDC. AWY holds base USDv (no sUSDV
  // staking, so no cooldown).
  if (remaining > 0) {
    const usdvAta = getAssociatedTokenAddressSync(USDV_MINT, vault.vaultPda, true, TOKEN_PROGRAM_ID);
    const usdvBalRes = await connection.getTokenAccountBalance(usdvAta).catch(() => null);
    const usdvBalance = usdvBalRes ? Number(usdvBalRes.value.amount) : 0;
    if (usdvBalance > 0) {
      // 9 dec USDv → 6 dec USDC (1:1 in human units). Cap by what the leg holds.
      const swapAmt = Math.min(usdvBalance, remaining * 1000);
      try {
        const sig = await jupiterSwap({
          vaultName: "awy",
          vaultPda: vault.vaultPda,
          inputMint: USDV_MINT,
          outputMint: USDC_MINT,
          amount: swapAmt,
          slippageBps: REVERSE_SLIPPAGE_BPS,
        });
        lastTx = sig;
        console.log(`AWY withdraw: reverse-swapped ${swapAmt / 1e9} USDv → USDC, tx: ${sig}`);
      } catch (e) {
        console.error("AWY withdraw: USDv reverse-swap failed:", e);
      }
    }
  }

  // Final fallback: queue an ONyc redemption request. ONyc redemption is
  // async — OnRe's admin runs `fulfill_redemption_request` off-chain on their
  // own schedule. We submit the request and surface a "pending" state to the
  // caller; user-facing copy explains the wait. The cron picks up fulfilled
  // redemptions and unblocks the queued withdrawal.
  if (remaining > 0) {
    try {
      const { buildOnycRedemptionRequestIxs, ONYC_DECIMALS, getOnycData } =
        await import("@/lib/integrations/awy/onyc");
      // Convert remaining USDC (6-dec) into ONyc base units at live NAV.
      const live = await getOnycData();
      const nav = live.nav && live.nav > 0 ? live.nav : 1;
      const usdcHuman = remaining / 1e6;
      const onycHuman = usdcHuman / nav;
      const onycBaseUnits = BigInt(Math.ceil(onycHuman * 10 ** ONYC_DECIMALS));

      const onycAta = getAssociatedTokenAddressSync(
        new PublicKey("5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5"),
        vault.vaultPda,
        true,
        TOKEN_PROGRAM_ID,
      );
      const onycBalRes = await connection.getTokenAccountBalance(onycAta).catch(() => null);
      const ZERO = BigInt(0);
      const onycBalance = onycBalRes ? BigInt(onycBalRes.value.amount) : ZERO;
      const redeemAmt = onycBalance < onycBaseUnits ? onycBalance : onycBaseUnits;

      if (redeemAmt > ZERO) {
        const plan = await buildOnycRedemptionRequestIxs({
          redeemer: vault.vaultPda,
          onycAmount: redeemAmt,
        });
        const sig = await executeVaultTransaction("awy", plan.instructions);
        console.log(
          `AWY withdraw: queued ONyc redemption request id=${plan.requestId} ` +
          `amount=${Number(redeemAmt) / 10 ** 9} ONyc, pda=${plan.redemptionRequestPda.toBase58()}, tx=${sig}`,
        );
        // Pending — admin must fulfill before USDC lands.
        return {
          success: false,
          tx: sig,
          error:
            "AWY: ONyc redemption queued — OnRe admin will fulfill within 24–72h. " +
            "Pending state visible in portfolio.",
        };
      }
    } catch (e) {
      console.error("AWY withdraw: ONyc redemption queue failed:", e);
    }
  }

  if (!lastTx) {
    return { success: false, error: "AWY: insufficient liquidity across legs to service withdrawal" };
  }
  return { success: true, tx: lastTx };
}

// ============================================================
// Jupiter swap helper
// ============================================================

/**
 * Jupiter swap using authority wallet as intermediary.
 *
 * Jupiter swaps have too many accounts (~28+) to fit inside a Squads vault
 * transaction (which wraps the inner tx, nearly doubling size past the 1,232 byte limit).
 *
 * Flow:
 * 1. Squads: transfer input token from vault PDA → authority wallet
 * 2. Authority signs Jupiter swap directly (no Squads wrapping)
 * 3. Authority transfers output token back to vault PDA
 */
async function jupiterSwap(params: {
  vaultName: VaultName;
  vaultPda: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: number;
  slippageBps: number;
}): Promise<string> {
  const connection = getConnection();
  const authority = getAuthority();

  // Step 1: Transfer input token from vault PDA to authority (via Squads)
  const authInputAta = getAssociatedTokenAddressSync(params.inputMint, authority.publicKey, false, TOKEN_PROGRAM_ID);
  const vaultInputAta = getAssociatedTokenAddressSync(params.inputMint, params.vaultPda, true, TOKEN_PROGRAM_ID);

  const step1Ixs: TransactionInstruction[] = [];
  try { await getAccount(connection, authInputAta, "confirmed", TOKEN_PROGRAM_ID); } catch {
    step1Ixs.push(createAssociatedTokenAccountInstruction(params.vaultPda, authInputAta, authority.publicKey, params.inputMint, TOKEN_PROGRAM_ID));
  }
  step1Ixs.push(createTransferInstruction(vaultInputAta, authInputAta, params.vaultPda, params.amount, [], TOKEN_PROGRAM_ID));
  await executeVaultTransaction(params.vaultName, step1Ixs);
  console.log(`Jupiter: transferred ${params.amount} input tokens from vault to authority`);

  // Step 2: Authority executes Jupiter swap directly
  const quoteRes = await fetchWithRetry(
    `${JUPITER_API}/quote?` +
    `inputMint=${params.inputMint.toBase58()}` +
    `&outputMint=${params.outputMint.toBase58()}` +
    `&amount=${params.amount}` +
    `&slippageBps=${params.slippageBps}` +
    `&onlyDirectRoutes=true`,
  );
  if (!quoteRes.ok) throw new Error(`Jupiter quote failed ${quoteRes.status}`);
  const quote = await quoteRes.json();

  // Slippage-protected minimum the swap must produce. Jupiter populates this
  // from `slippageBps`; we re-check post-confirm as defense in depth.
  const expectedOutput = Number(quote.outAmount);
  const minOutput = Number(quote.otherAmountThreshold);
  if (!Number.isFinite(minOutput) || minOutput <= 0) {
    throw new Error("Jupiter quote missing slippage threshold");
  }

  const swapRes = await fetchWithRetry(`${JUPITER_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: authority.publicKey.toBase58(),
      wrapAndUnwrapSol: false,
    }),
  });
  if (!swapRes.ok) throw new Error(`Jupiter swap failed ${swapRes.status}`);

  const { swapTransaction } = await swapRes.json();
  const swapBuffer = Buffer.from(swapTransaction, "base64");
  const vtx = VersionedTransaction.deserialize(swapBuffer);

  const { blockhash } = await connection.getLatestBlockhash();
  vtx.message.recentBlockhash = blockhash;
  vtx.sign([authority]);
  const swapSig = await connection.sendRawTransaction(vtx.serialize());
  await connection.confirmTransaction(swapSig, "confirmed");
  console.log(`Jupiter: swap executed by authority, tx: ${swapSig}`);

  // Step 3: Transfer output token from authority back to vault PDA
  const authOutputAta = getAssociatedTokenAddressSync(params.outputMint, authority.publicKey, false, TOKEN_PROGRAM_ID);
  const vaultOutputAta = getAssociatedTokenAddressSync(params.outputMint, params.vaultPda, true, TOKEN_PROGRAM_ID);

  // Get actual output amount received and enforce slippage threshold.
  const outputBalance = await connection.getTokenAccountBalance(authOutputAta);
  const outputAmount = Number(outputBalance.value.amount);
  if (outputAmount <= 0) throw new Error("Jupiter swap returned 0 output tokens");
  if (outputAmount < minOutput) {
    throw new Error(
      `Slippage exceeded: got ${outputAmount}, min ${minOutput} (expected ${expectedOutput}, ${params.slippageBps}bps tolerance)`,
    );
  }
  const slippageTaken = ((expectedOutput - outputAmount) / expectedOutput) * 10_000;
  console.log(`Jupiter: ${outputAmount}/${expectedOutput} output (${Math.max(0, slippageTaken).toFixed(1)}bps slippage taken)`);

  const step3Ixs: TransactionInstruction[] = [];
  try { await getAccount(connection, vaultOutputAta, "confirmed", TOKEN_PROGRAM_ID); } catch {
    step3Ixs.push(createAssociatedTokenAccountInstruction(authority.publicKey, vaultOutputAta, params.vaultPda, params.outputMint, TOKEN_PROGRAM_ID));
  }
  step3Ixs.push(createTransferInstruction(authOutputAta, vaultOutputAta, authority.publicKey, outputAmount, [], TOKEN_PROGRAM_ID));

  const step3Tx = new Transaction().add(...step3Ixs);
  step3Tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  step3Tx.feePayer = authority.publicKey;
  const step3Sig = await sendAndConfirmTransaction(connection, step3Tx, [authority]);
  console.log(`Jupiter: transferred ${outputAmount} output tokens back to vault, tx: ${step3Sig}`);

  return swapSig;
}

// ============================================================
// Tx deserialization helper
// ============================================================

/**
 * Deserialize a base64-encoded transaction and extract its instructions and
 * ALT accounts. Returning the ALTs (instead of fully resolving them inline)
 * lets us pass them through to the Squads vault tx wrapper, which keeps the
 * compiled v0 message under the 1232-byte limit.
 */
export async function deserializeTxInstructions(
  txBase64: string,
): Promise<{ instructions: TransactionInstruction[]; lookupTableAccounts: AddressLookupTableAccount[] }> {
  const buffer = Buffer.from(txBase64, "base64");

  // Try VersionedTransaction first (more common from APIs)
  try {
    const vtx = VersionedTransaction.deserialize(buffer);
    const msg = vtx.message;

    const lookupTableAccounts: AddressLookupTableAccount[] = [];
    const allKeys = [...msg.staticAccountKeys];

    if (msg.addressTableLookups && msg.addressTableLookups.length > 0) {
      const connection = getConnection();
      const altAccounts = await Promise.all(
        msg.addressTableLookups.map(async (lookup) => {
          const res = await connection.getAddressLookupTable(lookup.accountKey);
          return res.value;
        }),
      );

      for (let i = 0; i < msg.addressTableLookups.length; i++) {
        const lookup = msg.addressTableLookups[i];
        const alt = altAccounts[i];
        if (!alt) throw new Error(`Failed to fetch ALT: ${lookup.accountKey.toBase58()}`);
        lookupTableAccounts.push(alt);

        for (const idx of lookup.writableIndexes) allKeys.push(alt.state.addresses[idx]);
        for (const idx of lookup.readonlyIndexes) allKeys.push(alt.state.addresses[idx]);
      }
    }

    const numStaticWritableSigned = msg.header.numRequiredSignatures - msg.header.numReadonlySignedAccounts;
    const numStaticWritableUnsigned = msg.staticAccountKeys.length - msg.header.numRequiredSignatures - msg.header.numReadonlyUnsignedAccounts;
    const altWritableCount = msg.addressTableLookups
      ? msg.addressTableLookups.reduce((s, l) => s + l.writableIndexes.length, 0)
      : 0;

    const instructions = msg.compiledInstructions.map((ci) => {
      const programId = allKeys[ci.programIdIndex];
      const keys = ci.accountKeyIndexes.map((idx) => {
        const pubkey = allKeys[idx];
        const isStatic = idx < msg.staticAccountKeys.length;
        let isSigner = false;
        let isWritable = false;
        if (isStatic) {
          isSigner = idx < msg.header.numRequiredSignatures;
          isWritable = idx < numStaticWritableSigned ||
            (idx >= msg.header.numRequiredSignatures && idx < msg.header.numRequiredSignatures + numStaticWritableUnsigned);
        } else {
          const altIdx = idx - msg.staticAccountKeys.length;
          isWritable = altIdx < altWritableCount;
        }
        return { pubkey, isSigner, isWritable };
      });
      return new TransactionInstruction({ programId, keys, data: Buffer.from(ci.data) });
    });

    return { instructions, lookupTableAccounts };
  } catch (e) {
    if (e instanceof Error && e.message.includes("ALT")) throw e;
    // Fall back to legacy Transaction
  }

  try {
    const tx = Transaction.from(buffer);
    return { instructions: tx.instructions, lookupTableAccounts: [] };
  } catch {
    throw new Error("Failed to deserialize transaction");
  }
}

// ============================================================
// Solomon instruction builders
// ============================================================

/**
 * Build a Solomon Stake instruction: USDv → sUSDV
 * Account layout derived from on-chain transaction analysis.
 */
function buildSolomonStakeInstruction(
  userPda: PublicKey,
  usdvAmount: bigint,
): TransactionInstruction {
  // Account layout from Solomon stake program IDL (solomon-program-examples).
  //   [0] vault_state                  PDA["vault-state", salt]
  //   [1] staking_token (sUSDV mint)   PDA["staking-token", vault_state]
  //   [2] user_deposit_token_account   USDv ATA owned by user
  //   [3] user_staking_token_account   sUSDV ATA owned by user
  //   [4] vault_token_account          PDA["vault-token-account", vault_state]
  //   [5] blacklisted                  PDA["vault-state", user] (anti-blacklist marker)
  //   [6] user                         signer
  //   [7] token_program
  //   [8] system_program
  const userUsdvAta = findAtaAddress(USDV_MINT.toBase58(), userPda);
  const userSusdvAta = findAtaAddress(SUSDV_MINT.toBase58(), userPda);

  const [stakingToken] = PublicKey.findProgramAddressSync(
    [Buffer.from("staking-token"), SOLOMON_VAULT_STATE.toBuffer()],
    SOLOMON_PROGRAM,
  );
  const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault-token-account"), SOLOMON_VAULT_STATE.toBuffer()],
    SOLOMON_PROGRAM,
  );
  // `blacklisted` PDA seeds = ["vault-state", salt, user]
  const [blacklisted] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault-state"), Buffer.from(SOLOMON_VAULT_SALT_BYTES), userPda.toBuffer()],
    SOLOMON_PROGRAM,
  );

  // Args layout (after disc): salt[8] u8 + amt u64 LE.
  const data = Buffer.alloc(24);
  SOLOMON_STAKE_DISCRIMINATOR.copy(data, 0);
  // bytes 8-15 = salt (all zeros for canonical vault)
  data.writeBigUInt64LE(usdvAmount, 16);

  return new TransactionInstruction({
    programId: SOLOMON_PROGRAM,
    keys: [
      { pubkey: SOLOMON_VAULT_STATE,  isSigner: false, isWritable: true },
      { pubkey: stakingToken,         isSigner: false, isWritable: true },
      { pubkey: userUsdvAta,          isSigner: false, isWritable: true },
      { pubkey: userSusdvAta,         isSigner: false, isWritable: true },
      { pubkey: vaultTokenAccount,    isSigner: false, isWritable: true },
      { pubkey: blacklisted,          isSigner: false, isWritable: true },
      { pubkey: userPda,              isSigner: true,  isWritable: true },
      { pubkey: TOKEN_PROGRAM,        isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM,       isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build a Solomon StartUnstake instruction: burns sUSDV, creates unstake ticket.
 * 7-day cooldown before USDv is released via Unstake.
 */
function buildSolomonStartUnstakeInstruction(
  userPda: PublicKey,
  susdvAmount: bigint,
): TransactionInstruction {
  const userSusdvAta = findAtaAddress(SUSDV_MINT.toBase58(), userPda);

  // Per-user escrow PDA
  const [userEscrow] = PublicKey.findProgramAddressSync(
    [SOLOMON_VAULT_STATE.toBuffer(), userPda.toBuffer()],
    SOLOMON_PROGRAM,
  );
  // Unstake queue PDA (1216 bytes, ring buffer for pending unstakes)
  const [unstakeQueue] = PublicKey.findProgramAddressSync(
    [Buffer.from("unstake_queue"), SOLOMON_VAULT_STATE.toBuffer(), userPda.toBuffer()],
    SOLOMON_PROGRAM,
  );
  // Escrow authority PDA
  const [escrowAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), SOLOMON_VAULT_STATE.toBuffer(), userPda.toBuffer()],
    SOLOMON_PROGRAM,
  );

  const data = Buffer.alloc(24);
  SOLOMON_START_UNSTAKE_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(susdvAmount, 16);

  return new TransactionInstruction({
    programId: SOLOMON_PROGRAM,
    keys: [
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },           // [0]
      { pubkey: SOLOMON_VAULT_STATE, isSigner: false, isWritable: true },      // [1] vault state
      { pubkey: SUSDV_MINT, isSigner: false, isWritable: true },               // [2] sUSDV mint
      { pubkey: userPda, isSigner: true, isWritable: true },                   // [3] user wallet (signer)
      { pubkey: userSusdvAta, isSigner: false, isWritable: true },             // [4] user sUSDV ATA (burn)
      { pubkey: SOLOMON_VAULT_USDV_ACCOUNT, isSigner: false, isWritable: true }, // [5] vault USDv
      { pubkey: userEscrow, isSigner: false, isWritable: true },               // [6] user escrow
      { pubkey: unstakeQueue, isSigner: false, isWritable: true },             // [7] unstake queue
      { pubkey: escrowAuthority, isSigner: false, isWritable: true },          // [8] escrow authority
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },          // [9]
    ],
    data,
  });
}

/** Derive ATA address (sync, no RPC needed) */
function findAtaAddress(mint: string, owner: PublicKey): PublicKey {
  const mintPk = new PublicKey(mint);
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mintPk.toBuffer()],
    ATA_PROGRAM,
  );
  return ata;
}
