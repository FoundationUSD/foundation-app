/**
 * ONyc — OnRe tokenized reinsurance receipt on Solana.
 *
 * Yield from reinsurance premiums on diversified property, casualty, and specialty
 * lines underwritten by OnRe (Bermuda BMA-regulated reinsurer). NAV accrues daily;
 * Chainlink Data Streams publish the canonical price feed. Live as collateral on
 * Kamino since Aug 2025.
 *
 * APY/NAV are read from on-chain view instructions on the OnRe program, the same
 * primitive their own UI uses — no scraping, no spec fallback when the program is
 * reachable.
 *
 *   Program:    onreuGhHHgVzMWSkj2oQDLDtvvGvoepBPkqyaubFcwe
 *   ONyc mint:  5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5  (SPL, 9 decimals)
 *   Offer PDA:  ["offer", token_in_mint, token_out_mint]
 *
 * View ix scaling: getApy returns u64 with 6 decimals (1_000_000 = 1%);
 * getNav returns u64 with 9 decimals (1_000_000_000 = 1.0 USDC per ONyc).
 */

import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import type { Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { SOLANA_RPC_URL } from "@/lib/constants";
import onreIdl from "./idl/onreapp.json";

export const ONYC_PROGRAM_ID = new PublicKey(
  "onreuGhHHgVzMWSkj2oQDLDtvvGvoepBPkqyaubFcwe",
);
export const ONYC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_ONYC_MINT || "5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5",
);
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export const ONYC_DECIMALS = 9;

// IDL view-ix scaling — see program docs.
const APY_SCALE = 1_000_000;       // u64 → percent (1_000_000 = 1.0 %)
const NAV_SCALE = 1_000_000_000;   // u64 → USDC per ONyc

/**
 * Derive the canonical Offer PDA for a (token_in, token_out) pair.
 *   USDC → ONyc: deriveOfferPda(USDC, ONyc)  (the buy offer)
 *   ONyc → USDC: deriveOfferPda(ONyc, USDC)  (the redemption offer)
 */
export function deriveOfferPda(tokenIn: PublicKey, tokenOut: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("offer"), tokenIn.toBuffer(), tokenOut.toBuffer()],
    ONYC_PROGRAM_ID,
  )[0];
}

export function deriveStatePda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("state")], ONYC_PROGRAM_ID)[0];
}

export function deriveOfferVaultAuthorityPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("offer_vault_authority")],
    ONYC_PROGRAM_ID,
  )[0];
}

export function deriveMintAuthorityPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mint_authority")],
    ONYC_PROGRAM_ID,
  )[0];
}

/**
 * Permissionless authority is a single PDA that owns the intermediate token
 * accounts used by `take_offer_permissionless`. OnRe hardcoded its seed to
 * "permissionless-1" in their reference program.
 */
export function derivePermissionlessAuthorityPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("permissionless-1")],
    ONYC_PROGRAM_ID,
  )[0];
}

/**
 * Read the State account and pull out the current `boss` pubkey.
 * State layout (after 8-byte disc):
 *   boss            pubkey (32)   ← offset 8
 *   proposed_boss   pubkey (32)
 *   ...
 */
async function readBossPubkey(connection: Connection): Promise<PublicKey> {
  const acc = await connection.getAccountInfo(deriveStatePda(), "confirmed");
  if (!acc) throw new Error("OnRe State account not found on-chain");
  if (acc.data.length < 8 + 32) throw new Error("OnRe State data too short");
  return new PublicKey(acc.data.subarray(8, 8 + 32));
}

// Anchor's strict generic types here are noisy and don't add safety for our
// view-ix usage — we pass the IDL through as `any` and check at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _program: any | null = null;

/**
 * Minimal Anchor-compatible wallet stub. We don't import Anchor's `Wallet`
 * class because it lives only in the cjs/Node entry point of @coral-xyz/anchor;
 * the browser bundle omits it, which would break Next.js client-component
 * tree-shaking even though this module is server-only at runtime.
 *
 * For our usage (view-ix simulation + building unsigned instructions for
 * Squads to wrap), the wallet is never asked to sign — these stubs are safe.
 */
function makeStubWallet(): Wallet {
  const payer = Keypair.generate();
  return {
    publicKey: payer.publicKey,
    payer,
    signTransaction: async <T extends Transaction | VersionedTransaction>(
      tx: T,
    ): Promise<T> => tx,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(
      txs: T[],
    ): Promise<T[]> => txs,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getProgram(): any {
  if (_program) return _program;
  const conn = new Connection(SOLANA_RPC_URL, "confirmed");
  // View instructions don't need a real signer — Anchor's `.view()` runs
  // simulateTransaction, which works with any feepayer.
  const provider = new AnchorProvider(conn, makeStubWallet(), { commitment: "confirmed" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _program = new Program(onreIdl as any, provider);
  return _program;
}

export interface OnycLiveData {
  apy: number;        // percent — e.g. 12.34 means 12.34% APY
  nav: number | null; // USDC per ONyc — e.g. 1.005
  mint: string;
  source: string;
}

/**
 * Fetch live ONyc APY + NAV via the program's view instructions. Falls back to
 * `apy: 0, source: "spec-fallback"` on any RPC / simulation failure so the AWY
 * aggregator can substitute the static spec APY without UI breakage.
 */
export async function getOnycData(): Promise<OnycLiveData> {
  try {
    const program = getProgram();
    const offer = deriveOfferPda(USDC_MINT, ONYC_MINT);
    const accounts = {
      offer,
      tokenInMint: USDC_MINT,
      tokenOutMint: ONYC_MINT,
    };

    const [apyRaw, navRaw] = (await Promise.all([
      program.methods.getApy().accountsStrict(accounts).view(),
      program.methods.getNav().accountsStrict(accounts).view(),
    ])) as [BN, BN];

    const apy = Number(apyRaw.toString()) / APY_SCALE;
    const nav = Number(navRaw.toString()) / NAV_SCALE;

    if (!Number.isFinite(apy) || apy <= 0) {
      return { apy: 0, nav: null, mint: ONYC_MINT.toBase58(), source: "spec-fallback" };
    }

    return {
      apy,
      nav: Number.isFinite(nav) && nav > 0 ? nav : null,
      mint: ONYC_MINT.toBase58(),
      source: "onre-program",
    };
  } catch (err) {
    console.error("getOnycData failed:", err instanceof Error ? err.message : err);
    return { apy: 0, nav: null, mint: ONYC_MINT.toBase58(), source: "spec-fallback" };
  }
}

/* ============================================================
   Direct mint via take_offer_permissionless
   ============================================================ */

const USDC_MINT_PK = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export interface OnycTakeOfferPlan {
  /** ATA that will hold ONyc for the user (AWY vault PDA). Created idempotently. */
  userOnycAta: PublicKey;
  /** Instructions to submit (all signed by `user`): create ATA + take_offer. */
  instructions: TransactionInstruction[];
  /** Expected ONyc out at current NAV — for slippage / accounting display. */
  expectedOnycOut: number;
}

/**
 * Build the instruction set to swap USDC → ONyc through OnRe's permissionless
 * mint channel. Caller (Foundation's Squads vault transaction) provides:
 *
 *   user        — the AWY vault PDA (signs the resulting tx)
 *   feePayer    — the wallet that pays SOL fees / ATA rent (vault PDA itself)
 *   usdcAmount  — amount in 6-decimal base units
 *
 * Returns the ATA to read back ONyc balance from after execution, plus a list
 * of instructions: a `createAssociatedTokenAccountIdempotent` for the vault's
 * ONyc ATA (no-op if it already exists) followed by `take_offer_permissionless`.
 *
 * Note: ONyc Global Access (the permissionless channel) is geofenced from US
 * persons. Foundation's UI should block US deposits before this is called.
 */
export async function buildOnycTakeOfferIxs({
  user,
  feePayer,
  usdcAmount,
}: {
  user: PublicKey;
  feePayer: PublicKey;
  usdcAmount: bigint;
}): Promise<OnycTakeOfferPlan> {
  const program = getProgram();
  const conn: Connection = program.provider.connection;

  // 1. Read on-chain state for `boss` pubkey.
  const boss = await readBossPubkey(conn);

  // 2. Derive PDAs.
  const offer = deriveOfferPda(USDC_MINT_PK, ONYC_MINT);
  const statePda = deriveStatePda();
  const vaultAuthority = deriveOfferVaultAuthorityPda();
  const permissionlessAuthority = derivePermissionlessAuthorityPda();
  const mintAuthority = deriveMintAuthorityPda();

  // 3. Compute all ATAs. `allowOwnerOffCurve = true` everywhere because PDAs
  //    are off the ed25519 curve.
  const vaultUsdc = getAssociatedTokenAddressSync(USDC_MINT_PK, vaultAuthority, true);
  const vaultOnyc = getAssociatedTokenAddressSync(ONYC_MINT, vaultAuthority, true);
  const permissionlessUsdc = getAssociatedTokenAddressSync(USDC_MINT_PK, permissionlessAuthority, true);
  const permissionlessOnyc = getAssociatedTokenAddressSync(ONYC_MINT, permissionlessAuthority, true);
  const userUsdc = getAssociatedTokenAddressSync(USDC_MINT_PK, user, true);
  const userOnyc = getAssociatedTokenAddressSync(ONYC_MINT, user, true);
  // boss is OnRe's own program/multisig PDA (off-curve), so allowOwnerOffCurve = true.
  const bossUsdc = getAssociatedTokenAddressSync(USDC_MINT_PK, boss, true);

  // 4. Build the take_offer_permissionless ix via Anchor methods.
  const takeOfferIx = await program.methods
    .takeOfferPermissionless(new BN(usdcAmount.toString()), null)
    .accountsStrict({
      offer,
      state: statePda,
      boss,
      vaultAuthority,
      vaultTokenInAccount: vaultUsdc,
      vaultTokenOutAccount: vaultOnyc,
      permissionlessAuthority,
      permissionlessTokenInAccount: permissionlessUsdc,
      permissionlessTokenOutAccount: permissionlessOnyc,
      tokenInMint: USDC_MINT_PK,
      tokenInProgram: TOKEN_PROGRAM_ID,
      tokenOutMint: ONYC_MINT,
      tokenOutProgram: TOKEN_PROGRAM_ID,
      userTokenInAccount: userUsdc,
      userTokenOutAccount: userOnyc,
      bossTokenInAccount: bossUsdc,
      mintAuthority,
      instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      user,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  // 5. Idempotent ATA creation for the vault's ONyc receipt account. The
  //    ATA program is a no-op if the account already exists, so wrapping
  //    every deploy with this is safe.
  const createUserOnycAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    feePayer,
    userOnyc,
    user,
    ONYC_MINT,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  // 6. Estimated ONyc out for caller bookkeeping (NAV-based, not exact).
  let expectedOnycOut = 0;
  try {
    const live = await getOnycData();
    if (live.nav && live.nav > 0) {
      // USDC has 6 decimals, ONyc 9. usdcAmount/1e6 USDC at NAV USDC/ONyc → ONyc.
      expectedOnycOut = Number(usdcAmount) / 1e6 / live.nav;
    }
  } catch {}

  return {
    userOnycAta: userOnyc,
    instructions: [createUserOnycAtaIx, takeOfferIx],
    expectedOnycOut,
  };
}

/* ============================================================
   Async redemption: ONyc → USDC via OnRe's queued admin flow
   ============================================================

   ONyc redemption is two-step:
     1. Caller submits `create_redemption_request` (this module)
     2. OnRe's redemption_admin runs `fulfill_redemption_request` off-chain,
        on their schedule, depositing USDC into the redeemer's ATA.

   Because step 2 is admin-controlled, redemption is NOT atomic. The AWY
   withdrawal flow only invokes this when faster legs (idle USDC, Kamino
   PRIME, Solomon USDv reverse-swap) can't satisfy the requested amount —
   and it returns a "pending" state to the user instead of confirmed USDC.
*/

const REDEMPTION_OFFER_ACCOUNT_DISCRIMINATOR = Buffer.from([
  170, 229, 178, 15, 184, 107, 140, 41,
]);

export function deriveRedemptionVaultAuthorityPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("redemption_offer_vault_authority")],
    ONYC_PROGRAM_ID,
  )[0];
}

export function deriveRedemptionOfferPda(
  tokenInMint: PublicKey,
  tokenOutMint: PublicKey,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("redemption_offer"), tokenInMint.toBuffer(), tokenOutMint.toBuffer()],
    ONYC_PROGRAM_ID,
  )[0];
}

interface RedemptionOfferState {
  offer: PublicKey;
  tokenInMint: PublicKey;
  tokenOutMint: PublicKey;
  executedRedemptions: bigint;
  requestedRedemptions: bigint;
  feeBasisPoints: number;
  requestCounter: bigint;
}

/**
 * Decode a RedemptionOffer account.
 * Layout (after 8-byte disc):
 *   offer                  pubkey (32)
 *   token_in_mint          pubkey (32)
 *   token_out_mint         pubkey (32)
 *   executed_redemptions   u128 (16)
 *   requested_redemptions  u128 (16)
 *   fee_basis_points       u16  (2)
 *   request_counter        u64  (8)
 *   bump                   u8   (1)
 *   reserved               109 bytes
 */
function decodeRedemptionOffer(data: Buffer): RedemptionOfferState | null {
  if (data.length < 8 + 32 * 3 + 16 * 2 + 2 + 8 + 1) return null;
  if (!data.subarray(0, 8).equals(REDEMPTION_OFFER_ACCOUNT_DISCRIMINATOR)) return null;
  let off = 8;
  const offer = new PublicKey(data.subarray(off, off + 32)); off += 32;
  const tokenInMint = new PublicKey(data.subarray(off, off + 32)); off += 32;
  const tokenOutMint = new PublicKey(data.subarray(off, off + 32)); off += 32;
  // u128 = lo + (hi << 64). The high 64 bits would overflow Number; we keep as
  // bigint and ignore overflow risk for our usage (these are accounting totals).
  const SHIFT_64 = BigInt(64);
  const executedRedemptions =
    data.readBigUInt64LE(off) | (data.readBigUInt64LE(off + 8) << SHIFT_64); off += 16;
  const requestedRedemptions =
    data.readBigUInt64LE(off) | (data.readBigUInt64LE(off + 8) << SHIFT_64); off += 16;
  const feeBasisPoints = data.readUInt16LE(off); off += 2;
  const requestCounter = data.readBigUInt64LE(off);
  return {
    offer,
    tokenInMint,
    tokenOutMint,
    executedRedemptions,
    requestedRedemptions,
    feeBasisPoints,
    requestCounter,
  };
}

export interface OnycRedemptionPlan {
  /** PDA where the request will be recorded (used to read pending status). */
  redemptionRequestPda: PublicKey;
  /** Instructions to execute through the AWY Squads vault. */
  instructions: TransactionInstruction[];
  /** Sequential request id from RedemptionOffer.request_counter at submit time. */
  requestId: bigint;
}

/**
 * Build a `create_redemption_request` instruction. The redeemer (AWY vault PDA)
 * must hold ≥ `onycAmount` ONyc; the program transfers ONyc to the redemption
 * vault and records a pending request. The OnRe admin later fulfills it with
 * USDC into the redeemer's USDC ATA.
 */
export async function buildOnycRedemptionRequestIxs({
  redeemer,
  onycAmount,
}: {
  redeemer: PublicKey;
  onycAmount: bigint;
}): Promise<OnycRedemptionPlan> {
  const program = getProgram();
  const conn: Connection = program.provider.connection;

  // Redemption direction: token_in = ONyc (going INTO the program), token_out = USDC.
  const redemptionOfferPda = deriveRedemptionOfferPda(ONYC_MINT, USDC_MINT_PK);

  // Read the offer to get the next request_id (= current request_counter).
  const offerInfo = await conn.getAccountInfo(redemptionOfferPda, "confirmed");
  if (!offerInfo) throw new Error("OnRe redemption_offer account not found on-chain");
  const decoded = decodeRedemptionOffer(offerInfo.data);
  if (!decoded) throw new Error("Failed to decode RedemptionOffer");

  const requestId = decoded.requestCounter;
  const requestIdBuf = Buffer.alloc(8);
  requestIdBuf.writeBigUInt64LE(requestId);

  const redemptionRequestPda = PublicKey.findProgramAddressSync(
    [Buffer.from("redemption_request"), redemptionOfferPda.toBuffer(), requestIdBuf],
    ONYC_PROGRAM_ID,
  )[0];

  const redemptionVaultAuthority = deriveRedemptionVaultAuthorityPda();
  const redeemerOnycAta = getAssociatedTokenAddressSync(ONYC_MINT, redeemer, true);
  const vaultOnycAta = getAssociatedTokenAddressSync(ONYC_MINT, redemptionVaultAuthority, true);

  const ix = await program.methods
    .createRedemptionRequest(new BN(onycAmount.toString()))
    .accountsStrict({
      state: deriveStatePda(),
      redemptionOffer: redemptionOfferPda,
      redemptionRequest: redemptionRequestPda,
      redeemer,
      redemptionVaultAuthority,
      tokenInMint: ONYC_MINT,
      redeemerTokenAccount: redeemerOnycAta,
      vaultTokenAccount: vaultOnycAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  return {
    redemptionRequestPda,
    instructions: [ix],
    requestId,
  };
}

/**
 * List all pending OnRe redemption requests submitted by `redeemer`.
 * Useful for surfacing "Pending redemption — awaiting OnRe fulfillment" in
 * the portfolio UI and for a future cron that watches for fulfillment.
 *
 * Reads via getProgramAccounts with the discriminator + redeemer offset.
 */
export interface OnycPendingRedemption {
  pda: string;
  requestId: bigint;
  amountOnyc: bigint;
}

const REDEMPTION_REQUEST_DISCRIMINATOR = Buffer.from([
  117, 157, 214, 214, 64, 160, 31, 58,
]);

export async function getOnycPendingRedemptions(
  redeemer: PublicKey,
): Promise<OnycPendingRedemption[]> {
  try {
    const program = getProgram();
    const conn: Connection = program.provider.connection;

    /*
      RedemptionRequest layout (after disc):
        offer       pubkey (32)
        request_id  u64    (8)
        redeemer    pubkey (32)   ← offset 8 + 32 + 8 = 48
        amount      u64    (8)
        bump        u8     (1)
    */
    const redeemerOffset = 8 + 32 + 8;
    const accs = await conn.getProgramAccounts(ONYC_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 0, bytes: REDEMPTION_REQUEST_DISCRIMINATOR.toString("base64"), encoding: "base64" } },
        { memcmp: { offset: redeemerOffset, bytes: redeemer.toBase58() } },
      ],
    });

    return accs.map(({ pubkey, account }) => {
      const data = account.data;
      const offerOff = 8;
      const requestId = data.readBigUInt64LE(offerOff + 32);
      const amount = data.readBigUInt64LE(offerOff + 32 + 8 + 32);
      return {
        pda: pubkey.toBase58(),
        requestId,
        amountOnyc: amount,
      };
    });
  } catch (err) {
    console.error("getOnycPendingRedemptions failed:", err);
    return [];
  }
}
