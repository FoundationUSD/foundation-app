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
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
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
// ORO $GOLD — SPL Token, 6 decimals. 1 GOLD ≈ 1 oz physical gold.
const ORO_GOLD_MINT = new PublicKey("GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A");

const KAMINO_API = "https://api.kamino.finance";
const KAMINO_PRIME_MARKET = "CqAoLuqWtavaVE8deBjMKe8ZfSt9ghR6Vb8nfsyabyHA";
const KAMINO_USDC_RESERVE = "9GJ9GBRwCp4pHmWrQ43L5xpc9Vykg7jnfwcFGN8FoHYu";

const JUPITER_API = "https://lite-api.jup.ag/swap/v1";

// Solomon stake program
const SOLOMON_PROGRAM = new PublicKey("HSnn7bDvkZSEwujZDPtUcdo9KL7Conycgmy8m6mBFD5");
const SOLOMON_VAULT_STATE = new PublicKey("BsPrkRjar8ktWagbcxsEzSBSpVnaj47nasjpFHWp1VMF");
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
        return await deployToKamino(usdcAmount);
      case "solomon":
        return await deployToSolomon(usdcAmount);
      case "oro":
        return await deployToOro(usdcAmount);
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
        return await withdrawFromOro(usdcAmount);
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
  const instructions = await deserializeTxInstructions(txBase64);

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
  const instructions = await deserializeTxInstructions(txBase64);

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
  // Convert USDC amount (6 dec) to USDv amount (9 dec) — approximate 1:1
  const usdvAmount = BigInt(usdcAmount) * BigInt(1000); // 6 dec → 9 dec
  const stakeIx = buildSolomonStakeInstruction(vault.vaultPda, usdvAmount);
  const stakeSig = await executeVaultTransaction("solomon", [stakeIx]);
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
    slippageBps: 50,
  });

  console.log(`Solomon: swapped USDv → USDC, tx: ${swapSig}`);
  return { success: true, tx: swapSig };
}

// ============================================================
// ORO — Jupiter swap USDC ↔ $GOLD (tokenized physical gold)
// ============================================================
//
// v0: "just hold" — swap USDC → GOLD on Jupiter, multisig holds GOLD. Withdraw
// reverses the swap at the prevailing gold price. No lockup, no on-chain staking.
//
// Why not stake: ORO docs (April 2026) state sORO/stGOLD is "not currently issued"
// and staking requires a 12-month lockup via their off-chain GRAIL API. That
// conflicts with the "Withdraw anytime" UX every other Foundation vault guarantees.
// When ORO ships a no-lockup or API-based staking path, add a separate fdn-oro-staked
// vault tier instead of rewriting this one.
//
// User-facing implication: oroUSD tracks GOLD price, not a clean monotonic APY.
// Upside: gold price appreciation flows through. Downside: gold price drops flow
// through too (disclose in UI copy).

async function deployToOro(usdcAmount: number): Promise<{ success: boolean; tx?: string; error?: string }> {
  const vault = getVaultAddresses("oro");
  // Slippage: 50 bps (same as Solomon). ORO liquidity is ~$3M market cap in Apr 2026
  // so large deposits may see higher impact — client-side APIs should surface this.
  const swapSig = await jupiterSwap({
    vaultName: "oro",
    vaultPda: vault.vaultPda,
    inputMint: USDC_MINT,
    outputMint: ORO_GOLD_MINT,
    amount: usdcAmount,
    slippageBps: 50,
  });
  console.log(`Oro: swapped ${usdcAmount / 1e6} USDC → $GOLD, tx: ${swapSig}`);
  return { success: true, tx: swapSig };
}

async function withdrawFromOro(usdcAmount: number): Promise<{ success: boolean; tx?: string; error?: string }> {
  const vault = getVaultAddresses("oro");
  const connection = getConnection();

  // Convert target USDC amount to an estimated GOLD amount to sell, via a live
  // Jupiter reverse-quote. Then sell exactly that much GOLD back to USDC.
  // If the vault holds less GOLD than needed, sell everything available — Foundation
  // will top up the shortfall from reserves or mark as insufficient-liquidity.
  const vaultGoldAta = getAssociatedTokenAddressSync(ORO_GOLD_MINT, vault.vaultPda, true, TOKEN_PROGRAM_ID);
  const goldBalRes = await connection.getTokenAccountBalance(vaultGoldAta).catch(() => null);
  const goldBalance = goldBalRes ? Number(goldBalRes.value.amount) : 0;

  if (goldBalance <= 0) {
    return { success: false, error: "Vault holds no $GOLD — cannot service withdrawal" };
  }

  // Reverse-quote: how much GOLD does Jupiter want for `usdcAmount` USDC?
  const quoteRes = await fetch(
    `${JUPITER_API}/quote?` +
    `inputMint=${ORO_GOLD_MINT.toBase58()}` +
    `&outputMint=${USDC_MINT.toBase58()}` +
    `&amount=${goldBalance}` + // quote full balance — we'll scale proportionally
    `&slippageBps=50`,
  );
  if (!quoteRes.ok) throw new Error(`Jupiter quote failed ${quoteRes.status}`);
  const quote = await quoteRes.json();
  const usdcPerFullGold = Number(quote.outAmount);

  if (usdcPerFullGold <= 0) {
    throw new Error("Jupiter returned zero USDC output — no liquidity");
  }

  // goldToSell = goldBalance * (usdcAmount / usdcPerFullGold), clamped to goldBalance
  const goldToSell = Math.min(
    Math.ceil((goldBalance * usdcAmount) / usdcPerFullGold),
    goldBalance,
  );

  const swapSig = await jupiterSwap({
    vaultName: "oro",
    vaultPda: vault.vaultPda,
    inputMint: ORO_GOLD_MINT,
    outputMint: USDC_MINT,
    amount: goldToSell,
    slippageBps: 50,
  });
  console.log(`Oro: swapped ${goldToSell / 1e6} $GOLD → USDC, tx: ${swapSig}`);
  return { success: true, tx: swapSig };
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
  const quoteRes = await fetch(
    `${JUPITER_API}/quote?` +
    `inputMint=${params.inputMint.toBase58()}` +
    `&outputMint=${params.outputMint.toBase58()}` +
    `&amount=${params.amount}` +
    `&slippageBps=${params.slippageBps}` +
    `&onlyDirectRoutes=true`,
  );
  if (!quoteRes.ok) throw new Error(`Jupiter quote failed ${quoteRes.status}`);
  const quote = await quoteRes.json();

  const swapRes = await fetch(`${JUPITER_API}/swap`, {
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

  // Resolve ALTs for signing
  const altAccounts = await Promise.all(
    (vtx.message.addressTableLookups || []).map(async (lookup) => {
      const res = await connection.getAddressLookupTable(lookup.accountKey);
      return res.value!;
    }),
  );

  const { blockhash } = await connection.getLatestBlockhash();
  vtx.message.recentBlockhash = blockhash;
  vtx.sign([authority]);
  const swapSig = await connection.sendRawTransaction(vtx.serialize());
  await connection.confirmTransaction(swapSig, "confirmed");
  console.log(`Jupiter: swap executed by authority, tx: ${swapSig}`);

  // Step 3: Transfer output token from authority back to vault PDA
  const authOutputAta = getAssociatedTokenAddressSync(params.outputMint, authority.publicKey, false, TOKEN_PROGRAM_ID);
  const vaultOutputAta = getAssociatedTokenAddressSync(params.outputMint, params.vaultPda, true, TOKEN_PROGRAM_ID);

  // Get actual output amount received
  const outputBalance = await connection.getTokenAccountBalance(authOutputAta);
  const outputAmount = Number(outputBalance.value.amount);
  if (outputAmount <= 0) throw new Error("Jupiter swap returned 0 output tokens");

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
 * Deserialize a base64-encoded transaction and extract its instructions.
 * Resolves Address Lookup Tables for VersionedTransactions.
 */
async function deserializeTxInstructions(txBase64: string): Promise<TransactionInstruction[]> {
  const buffer = Buffer.from(txBase64, "base64");

  // Try VersionedTransaction first (more common from APIs)
  try {
    const vtx = VersionedTransaction.deserialize(buffer);
    const msg = vtx.message;

    // Build full account key list (static + ALT resolved)
    let allKeys = [...msg.staticAccountKeys];

    if (msg.addressTableLookups && msg.addressTableLookups.length > 0) {
      const connection = getConnection();
      // Fetch all lookup tables in parallel
      const altAccounts = await Promise.all(
        msg.addressTableLookups.map(async (lookup) => {
          const res = await connection.getAddressLookupTable(lookup.accountKey);
          return res.value;
        }),
      );

      // Resolve writable and readonly keys from each ALT
      for (let i = 0; i < msg.addressTableLookups.length; i++) {
        const lookup = msg.addressTableLookups[i];
        const alt = altAccounts[i];
        if (!alt) throw new Error(`Failed to fetch ALT: ${lookup.accountKey.toBase58()}`);

        for (const idx of lookup.writableIndexes) {
          allKeys.push(alt.state.addresses[idx]);
        }
        for (const idx of lookup.readonlyIndexes) {
          allKeys.push(alt.state.addresses[idx]);
        }
      }
    }

    const numStaticWritableSigned = msg.header.numRequiredSignatures - msg.header.numReadonlySignedAccounts;
    const numStaticWritableUnsigned = msg.staticAccountKeys.length - msg.header.numRequiredSignatures - msg.header.numReadonlyUnsignedAccounts;

    // Count ALT writable keys
    const altWritableCount = msg.addressTableLookups
      ? msg.addressTableLookups.reduce((s, l) => s + l.writableIndexes.length, 0)
      : 0;

    return msg.compiledInstructions.map((ci) => {
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
          // ALT keys: writable ones come first, then readonly
          const altIdx = idx - msg.staticAccountKeys.length;
          isWritable = altIdx < altWritableCount;
        }

        return { pubkey, isSigner, isWritable };
      });
      return new TransactionInstruction({ programId, keys, data: Buffer.from(ci.data) });
    });
  } catch (e) {
    // If it's an ALT fetch error, re-throw
    if (e instanceof Error && e.message.includes("ALT")) throw e;
    // Fall back to legacy Transaction
  }

  try {
    const tx = Transaction.from(buffer);
    return tx.instructions;
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
  const userUsdvAta = findAtaAddress(USDV_MINT.toBase58(), userPda);
  const userSusdvAta = findAtaAddress(SUSDV_MINT.toBase58(), userPda);

  // Per-user escrow PDA (41 bytes, program-owned receipt account)
  const [userEscrow] = PublicKey.findProgramAddressSync(
    [SOLOMON_VAULT_STATE.toBuffer(), userPda.toBuffer()],
    SOLOMON_PROGRAM,
  );
  // Escrow authority PDA
  const [escrowAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), SOLOMON_VAULT_STATE.toBuffer(), userPda.toBuffer()],
    SOLOMON_PROGRAM,
  );

  // Data: 8-byte discriminator + 8-byte padding (0) + 8-byte amount (u64 LE)
  const data = Buffer.alloc(24);
  SOLOMON_STAKE_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(usdvAmount, 16);

  return new TransactionInstruction({
    programId: SOLOMON_PROGRAM,
    keys: [
      { pubkey: SOLOMON_VAULT_STATE, isSigner: false, isWritable: true },    // [0] vault state
      { pubkey: SUSDV_MINT, isSigner: false, isWritable: true },             // [1] sUSDV mint
      { pubkey: userUsdvAta, isSigner: false, isWritable: true },            // [2] user USDv ATA (source)
      { pubkey: userSusdvAta, isSigner: false, isWritable: true },           // [3] user sUSDV ATA (dest)
      { pubkey: SOLOMON_VAULT_USDV_ACCOUNT, isSigner: false, isWritable: true }, // [4] vault USDv
      { pubkey: userEscrow, isSigner: false, isWritable: true },             // [5] user escrow
      { pubkey: escrowAuthority, isSigner: false, isWritable: true },        // [6] escrow authority
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },         // [7]
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },        // [8]
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
