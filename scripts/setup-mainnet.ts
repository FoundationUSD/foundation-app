/**
 * Foundation Mainnet Setup Script
 *
 * Creates:
 * 1. A 1-of-1 Squads multisig (backend keypair as sole member)
 * 2. USDC token account on the vault PDA
 * 3. fdnALPHA Token-2022 mint with interest-bearing extension (mint authority = vault PDA)
 *
 * Usage:
 *   VAULT_AUTHORITY_SECRET=<base58_private_key> npx tsx scripts/setup-mainnet.ts
 *
 * The vault authority keypair is the sole member of the multisig.
 * It can propose, approve, and execute all transactions autonomously.
 * Later, add more members and increase threshold for security.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeInterestBearingMintInstruction,
  getMintLen,
  ExtensionType,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import * as multisig from "@sqds/multisig";
import bs58 from "bs58";
import fs from "fs";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

async function main() {
  const secret = process.env.VAULT_AUTHORITY_SECRET;
  if (!secret) {
    console.error("Set VAULT_AUTHORITY_SECRET env var (base58 private key)");
    process.exit(1);
  }

  const authority = Keypair.fromSecretKey(bs58.decode(secret));
  console.log("Authority:", authority.publicKey.toBase58());

  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  const balance = await connection.getBalance(authority.publicKey);
  console.log("SOL balance:", balance / 1e9);
  if (balance < 0.05 * 1e9) {
    console.error("Need at least 0.05 SOL for setup transactions");
    process.exit(1);
  }

  // ============================================
  // Step 1: Create Squads Multisig (1-of-1)
  // ============================================
  console.log("\n--- Step 1: Create Squads Multisig ---");

  const createKey = Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({
    createKey: createKey.publicKey,
  });
  const [vaultPda] = multisig.getVaultPda({
    multisigPda,
    index: 0,
  });

  console.log("Multisig PDA:", multisigPda.toBase58());
  console.log("Vault PDA:", vaultPda.toBase58());

  // Check if already exists
  const multisigInfo = await connection.getAccountInfo(multisigPda);
  if (multisigInfo) {
    console.log("Multisig already exists, skipping creation");
  } else {
    const createIx = multisig.instructions.multisigCreateV2({
      createKey: createKey.publicKey,
      creator: authority.publicKey,
      multisigPda,
      configAuthority: null,
      timeLock: 0,
      threshold: 1,
      members: [
        {
          key: authority.publicKey,
          permissions: multisig.types.Permissions.all(),
        },
      ],
      rentCollector: null,
      treasury: vaultPda,
    });

    const tx = new Transaction().add(createIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [authority, createKey]);
    console.log("Multisig created:", sig);
  }

  // ============================================
  // Step 2: Create USDC token account for vault PDA
  // ============================================
  console.log("\n--- Step 2: Create Vault USDC Account ---");

  const vaultUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, vaultPda, true, TOKEN_PROGRAM_ID);
  console.log("Vault USDC ATA:", vaultUsdcAta.toBase58());

  const usdcAtaInfo = await connection.getAccountInfo(vaultUsdcAta);
  if (usdcAtaInfo) {
    console.log("USDC ATA already exists, skipping");
  } else {
    const createAtaIx = createAssociatedTokenAccountInstruction(
      authority.publicKey,
      vaultUsdcAta,
      vaultPda,
      USDC_MINT,
      TOKEN_PROGRAM_ID,
    );
    const tx = new Transaction().add(createAtaIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [authority]);
    console.log("USDC ATA created:", sig);
  }

  // ============================================
  // Step 3: Create fdnALPHA Token-2022 Mint
  // ============================================
  console.log("\n--- Step 3: Create fdnALPHA Mint ---");

  const mintKeypair = Keypair.generate();
  const mintLen = getMintLen([ExtensionType.InterestBearingConfig]);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  // Initial interest rate: 800 bps = 8% APY (blended across strategies)
  const initialRateBps = 800;

  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeInterestBearingMintInstruction(
      mintKeypair.publicKey,
      vaultPda, // rate authority = vault PDA (updated via multisig)
      initialRateBps,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      6, // decimals (same as USDC)
      vaultPda, // mint authority = vault PDA
      null, // no freeze authority
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  const mintSig = await sendAndConfirmTransaction(connection, createMintTx, [
    authority,
    mintKeypair,
  ]);
  console.log("fdnALPHA mint created:", mintKeypair.publicKey.toBase58());
  console.log("Tx:", mintSig);

  // ============================================
  // Save config
  // ============================================
  const config = {
    network: "mainnet-beta",
    authority: authority.publicKey.toBase58(),
    multisig: multisigPda.toBase58(),
    vaultPda: vaultPda.toBase58(),
    vaultUsdcAta: vaultUsdcAta.toBase58(),
    fdnAlphaMint: mintKeypair.publicKey.toBase58(),
    initialRateBps,
    createKey: createKey.publicKey.toBase58(),
    createdAt: new Date().toISOString(),
  };

  const outPath = "./vault-config.json";
  fs.writeFileSync(outPath, JSON.stringify(config, null, 2));
  console.log("\n✅ Config saved to", outPath);
  console.log(JSON.stringify(config, null, 2));

  // Save mint keypair (needed if you want to close it later)
  const mintKeyPath = "./keys/fdnalpha-mint.json";
  fs.mkdirSync("./keys", { recursive: true });
  fs.writeFileSync(mintKeyPath, JSON.stringify(Array.from(mintKeypair.secretKey)));
  console.log("Mint keypair saved to", mintKeyPath);

  console.log("\n--- Environment Variables to Add to .env.local ---");
  console.log(`VAULT_MULTISIG=${multisigPda.toBase58()}`);
  console.log(`VAULT_PDA=${vaultPda.toBase58()}`);
  console.log(`VAULT_USDC_ATA=${vaultUsdcAta.toBase58()}`);
  console.log(`NEXT_PUBLIC_FDN_ALPHA_MINT=${mintKeypair.publicKey.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
