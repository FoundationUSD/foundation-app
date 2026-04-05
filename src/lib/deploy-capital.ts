/**
 * Capital deployment — auto-deploys USDC into underlying protocols after deposit,
 * and withdraws from protocols before returning USDC on withdrawal.
 *
 * Flow:
 *   Deposit:  User sends USDC → mint receipt tokens → deployCapital()
 *   Withdraw: User burns tokens → withdrawCapital() → send USDC back
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferInstruction,
} from "@solana/spl-token";
import { executeVaultTransaction, getVaultAddresses } from "@/lib/solana/squads";
import type { VaultName } from "@/lib/solana/squads";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDV_MINT = new PublicKey("Ex5DaKYMCN6QWFA4n67TmMwsH8MJV68RX6YXTmVM532C");

const KAMINO_API = "https://api.kamino.finance";
const KAMINO_PRIME_MARKET = "CqAoLuqWtavaVE8deBjMKe8ZfSt9ghR6Vb8nfsyabyHA";
const KAMINO_USDC_RESERVE = "9GJ9GBRwCp4pHmWrQ43L5xpc9Vykg7jnfwcFGN8FoHYu";

const JUPITER_API = "https://lite-api.jup.ag/swap/v1";

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
        return await deployToKamino(usdcAmount);
      case "solomon":
        return await deployToSolomon(usdcAmount);
      case "oro":
        // Oro integration not built yet — USDC stays in vault
        console.warn("Oro deployment not implemented — USDC stays idle in vault");
        return { success: true, tx: "skipped-oro" };
      case "drift":
        // Drift is coming_soon
        console.warn("Drift deployment not implemented — USDC stays idle in vault");
        return { success: true, tx: "skipped-drift" };
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
        return await withdrawFromKamino(usdcAmount);
      case "solomon":
        return await withdrawFromSolomon(usdcAmount);
      case "oro":
        console.warn("Oro withdrawal not implemented");
        return { success: true, tx: "skipped-oro" };
      case "drift":
        console.warn("Drift withdrawal not implemented");
        return { success: true, tx: "skipped-drift" };
      default:
        return { success: false, error: `Unknown vault: ${vaultName}` };
    }
  } catch (error) {
    console.error(`withdrawCapital(${vaultName}) failed:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Withdrawal failed" };
  }
}

// ============================================================
// Kamino — deposit/withdraw via REST API
// ============================================================

async function deployToKamino(usdcAmount: number): Promise<{ success: boolean; tx?: string; error?: string }> {
  const vault = getVaultAddresses("kamino");

  // Build deposit tx via Kamino API (vault PDA as wallet owner)
  const res = await fetch(`${KAMINO_API}/ktx/klend/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: vault.vaultPda.toBase58(),
      reserve: KAMINO_USDC_RESERVE,
      amount: usdcAmount.toString(),
      market: KAMINO_PRIME_MARKET,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kamino deposit API ${res.status}: ${text}`);
  }

  const { transaction: txBase64 } = await res.json();
  const instructions = deserializeTxInstructions(txBase64);

  if (instructions.length === 0) {
    throw new Error("Kamino API returned empty transaction");
  }

  const sig = await executeVaultTransaction("kamino", instructions);
  console.log(`Kamino deposit: ${usdcAmount / 1e6} USDC deployed, tx: ${sig}`);
  return { success: true, tx: sig };
}

async function withdrawFromKamino(usdcAmount: number): Promise<{ success: boolean; tx?: string; error?: string }> {
  const vault = getVaultAddresses("kamino");

  const res = await fetch(`${KAMINO_API}/ktx/klend/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      wallet: vault.vaultPda.toBase58(),
      reserve: KAMINO_USDC_RESERVE,
      amount: usdcAmount.toString(),
      market: KAMINO_PRIME_MARKET,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kamino withdraw API ${res.status}: ${text}`);
  }

  const { transaction: txBase64 } = await res.json();
  const instructions = deserializeTxInstructions(txBase64);

  if (instructions.length === 0) {
    throw new Error("Kamino API returned empty transaction");
  }

  const sig = await executeVaultTransaction("kamino", instructions);
  console.log(`Kamino withdraw: ${usdcAmount / 1e6} USDC withdrawn, tx: ${sig}`);
  return { success: true, tx: sig };
}

// ============================================================
// Solomon — Jupiter swap USDC→USDv, then stake via Solomon
// ============================================================

async function deployToSolomon(usdcAmount: number): Promise<{ success: boolean; tx?: string; error?: string }> {
  const vault = getVaultAddresses("solomon");

  // Step 1: Jupiter swap USDC → USDv
  const swapSig = await jupiterSwap({
    vaultName: "solomon",
    vaultPda: vault.vaultPda,
    inputMint: USDC_MINT,
    outputMint: USDV_MINT,
    amount: usdcAmount,
    slippageBps: 50, // 0.5%
  });

  console.log(`Solomon: swapped ${usdcAmount / 1e6} USDC → USDv, tx: ${swapSig}`);

  // Step 2: Stake USDv → sUSDV via Solomon program
  // Solomon staking is permissionless — the vault PDA stakes its USDv
  // For now, the USDv sits in the vault after swap. Solomon staking
  // instruction building requires Anchor IDL which we don't have yet.
  // TODO: Build Solomon stake instruction when IDL is available
  console.warn("Solomon stake (USDv → sUSDV) not yet implemented — USDv held in vault");

  return { success: true, tx: swapSig };
}

async function withdrawFromSolomon(usdcAmount: number): Promise<{ success: boolean; tx?: string; error?: string }> {
  const vault = getVaultAddresses("solomon");

  // TODO: Step 1 — Unstake sUSDV → USDv (7-day cooldown)
  // For now, check if vault has USDv and swap back

  // Step 2: Jupiter swap USDv → USDC
  // First check how much USDv we need to swap for the requested USDC amount
  const swapSig = await jupiterSwap({
    vaultName: "solomon",
    vaultPda: vault.vaultPda,
    inputMint: USDV_MINT,
    outputMint: USDC_MINT,
    amount: usdcAmount, // approximate 1:1 for stablecoins
    slippageBps: 50,
  });

  console.log(`Solomon: swapped USDv → ${usdcAmount / 1e6} USDC, tx: ${swapSig}`);
  return { success: true, tx: swapSig };
}

// ============================================================
// Jupiter swap helper
// ============================================================

async function jupiterSwap(params: {
  vaultName: VaultName;
  vaultPda: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: number;
  slippageBps: number;
}): Promise<string> {
  // 1. Get quote
  const quoteRes = await fetch(
    `${JUPITER_API}/quote?` +
    `inputMint=${params.inputMint.toBase58()}` +
    `&outputMint=${params.outputMint.toBase58()}` +
    `&amount=${params.amount}` +
    `&slippageBps=${params.slippageBps}`,
  );

  if (!quoteRes.ok) {
    const text = await quoteRes.text();
    throw new Error(`Jupiter quote failed ${quoteRes.status}: ${text}`);
  }

  const quote = await quoteRes.json();

  // 2. Get swap transaction
  const swapRes = await fetch(`${JUPITER_API}/swap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: params.vaultPda.toBase58(),
      wrapAndUnwrapSol: false,
    }),
  });

  if (!swapRes.ok) {
    const text = await swapRes.text();
    throw new Error(`Jupiter swap failed ${swapRes.status}: ${text}`);
  }

  const { swapTransaction } = await swapRes.json();
  const instructions = deserializeTxInstructions(swapTransaction);

  if (instructions.length === 0) {
    throw new Error("Jupiter returned empty swap transaction");
  }

  // 3. Execute via Squads
  return await executeVaultTransaction(params.vaultName, instructions);
}

// ============================================================
// Tx deserialization helper
// ============================================================

/**
 * Deserialize a base64-encoded transaction and extract its instructions.
 * Works with both legacy Transaction and VersionedTransaction.
 */
function deserializeTxInstructions(txBase64: string): TransactionInstruction[] {
  const buffer = Buffer.from(txBase64, "base64");

  // Try VersionedTransaction first (more common from APIs)
  try {
    const vtx = VersionedTransaction.deserialize(buffer);
    const msg = vtx.message;
    const accountKeys = msg.staticAccountKeys;

    // Resolve address table lookups if present
    // For now, we only handle static keys — ALT resolution requires fetching lookup tables
    return msg.compiledInstructions.map((ci) => {
      const programId = accountKeys[ci.programIdIndex];
      const keys = ci.accountKeyIndexes.map((idx) => ({
        pubkey: accountKeys[idx],
        // We don't know exact signer/writable from compiled format,
        // but the Squads vault transaction re-derives these from the program
        isSigner: idx < msg.header.numRequiredSignatures,
        isWritable:
          idx < msg.header.numRequiredSignatures - msg.header.numReadonlySignedAccounts ||
          (idx >= msg.header.numRequiredSignatures &&
            idx < accountKeys.length - msg.header.numReadonlyUnsignedAccounts),
      }));
      return new TransactionInstruction({ programId, keys, data: Buffer.from(ci.data) });
    });
  } catch {
    // Fall back to legacy Transaction
  }

  try {
    const tx = Transaction.from(buffer);
    return tx.instructions;
  } catch {
    throw new Error("Failed to deserialize transaction");
  }
}
