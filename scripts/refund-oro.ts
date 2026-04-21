/**
 * One-off refund:
 *   1. Transfer 0.1 USDC from ORO vault ATA → 3Mp5…Hc2r (via Squads multisig)
 *   2. Transfer 0.03 SOL from vault-authority → 3Mp5…Hc2r (direct)
 *
 * Run: NETWORK_URL=... bun run scripts/refund-oro.ts
 * Requires: VAULT_AUTHORITY_SECRET (bs58) and SOLANA_RPC_URL in env.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";
import { executeVaultTransaction } from "../src/lib/solana/squads";

const RECIPIENT = new PublicKey("3Mp5ArYysNCXxNnUeBnRCaFWGbCzHAiYoJacYK4Hhc2r");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const USDC_AMOUNT = 100_000; // 0.1 USDC (6 decimals)
const SOL_AMOUNT = Math.floor(0.03 * LAMPORTS_PER_SOL);

async function main() {
  const secret = process.env.VAULT_AUTHORITY_SECRET;
  if (!secret) throw new Error("VAULT_AUTHORITY_SECRET missing");
  const authority = Keypair.fromSecretKey(bs58.decode(secret));
  const rpc = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL!;
  const connection = new Connection(rpc, "confirmed");

  // VAULT_ORO_PDA here is the Squads *vault PDA* (token owner), not the multisig account.
  const oroVaultPda = new PublicKey(process.env.VAULT_ORO_PDA!);
  const oroUsdcAta = new PublicKey(process.env.VAULT_ORO_USDC_ATA!);
  const recipientUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, RECIPIENT);

  console.log("Authority:", authority.publicKey.toBase58());
  console.log("Recipient:", RECIPIENT.toBase58());
  console.log("ORO vault PDA (token owner):", oroVaultPda.toBase58());
  console.log("ORO USDC ATA:", oroUsdcAta.toBase58());
  console.log("Recipient USDC ATA:", recipientUsdcAta.toBase58());
  console.log();

  // ---- 1. USDC refund via Squads ----
  console.log("→ Submitting Squads tx: 0.1 USDC (ORO → recipient)…");
  const transferIx = createTransferInstruction(
    oroUsdcAta,
    recipientUsdcAta,
    oroVaultPda,          // vault PDA owns the ATA; executeVaultTransaction signs as this
    USDC_AMOUNT,
    [],
    TOKEN_PROGRAM_ID,
  );
  const usdcSig = await executeVaultTransaction("oro", [transferIx]);
  console.log("  ✓ USDC refund sig:", usdcSig);
  console.log();

  // ---- 2. SOL top-up (direct) ----
  console.log("→ Sending 0.03 SOL (authority → recipient)…");
  const solTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: RECIPIENT,
      lamports: SOL_AMOUNT,
    }),
  );
  solTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  solTx.feePayer = authority.publicKey;
  const solSig = await sendAndConfirmTransaction(connection, solTx, [authority]);
  console.log("  ✓ SOL top-up sig:", solSig);
  console.log();

  const finalSol = await connection.getBalance(authority.publicKey);
  console.log("Authority SOL remaining:", (finalSol / LAMPORTS_PER_SOL).toFixed(6));
}

main().catch((e) => {
  console.error("Refund failed:", e);
  process.exit(1);
});
