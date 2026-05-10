/**
 * Create a single Foundation vault (Squads multisig + Token-2022 mint).
 *
 * Usage:
 *   VAULT_AUTHORITY_SECRET=<key> VAULT_NAME=kamino VAULT_RATE=540 npx tsx scripts/setup-vault.ts
 *
 * VAULT_NAME: solomon | kamino | drift
 * VAULT_RATE: initial interest rate in bps (540 = 5.4%)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
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
const SQUADS_TREASURY = new PublicKey("5DH2e3cJmFpyi6mk65EGFediunm4ui6BiKNUNrhWtD1b");

const MINT_NAMES: Record<string, string> = {
  solomon: "soloUSD",
  kamino: "kmnoUSD",
  drift: "driftUSD",
  oro: "oroUSD",
  awy: "awyUSD",
  awy2x: "awy2xUSD",
  awy3x: "awy3xUSD",
};

async function main() {
  const secret = process.env.VAULT_AUTHORITY_SECRET;
  const vaultName = process.env.VAULT_NAME;
  const rateBps = parseInt(process.env.VAULT_RATE || "800", 10);

  if (!secret) { console.error("Set VAULT_AUTHORITY_SECRET"); process.exit(1); }
  if (!vaultName || !MINT_NAMES[vaultName]) {
    console.error("Set VAULT_NAME to: solomon | kamino | drift | oro | awy | awy2x | awy3x");
    process.exit(1);
  }

  const authority = Keypair.fromSecretKey(bs58.decode(secret));
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const mintLabel = MINT_NAMES[vaultName];

  console.log(`\n=== Setting up ${mintLabel} vault ===`);
  console.log("Authority:", authority.publicKey.toBase58());

  const balance = await connection.getBalance(authority.publicKey);
  console.log("SOL balance:", balance / 1e9);
  if (balance < 0.03 * 1e9) {
    console.error("Need at least 0.03 SOL");
    process.exit(1);
  }

  const outDir = `./.keys_vaults/${vaultName}`;
  fs.mkdirSync(outDir, { recursive: true });

  // Check if already set up
  const configPath = `${outDir}/vault-config.json`;
  if (fs.existsSync(configPath)) {
    console.log(`\n⚠️  ${configPath} already exists. Vault may already be created.`);
    const existing = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    console.log(JSON.stringify(existing, null, 2));
    console.log("\nTo recreate, delete the config file first.");
    process.exit(0);
  }

  // Step 1: Create Squads Multisig
  console.log("\n--- Creating Squads Multisig ---");
  const createKey = Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

  console.log("Multisig PDA:", multisigPda.toBase58());
  console.log("Vault PDA:", vaultPda.toBase58());

  const createIx = multisig.instructions.multisigCreateV2({
    createKey: createKey.publicKey,
    creator: authority.publicKey,
    multisigPda,
    configAuthority: null,
    timeLock: 0,
    threshold: 1,
    members: [{
      key: authority.publicKey,
      permissions: multisig.types.Permissions.all(),
    }],
    rentCollector: null,
    treasury: SQUADS_TREASURY,
  });

  const tx1 = new Transaction().add(createIx);
  const sig1 = await sendAndConfirmTransaction(connection, tx1, [authority, createKey]);
  console.log("Multisig created:", sig1);

  // Step 2: Create USDC ATA for vault PDA
  console.log("\n--- Creating Vault USDC Account ---");
  const vaultUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, vaultPda, true, TOKEN_PROGRAM_ID);
  console.log("Vault USDC ATA:", vaultUsdcAta.toBase58());

  const createAtaIx = createAssociatedTokenAccountInstruction(
    authority.publicKey, vaultUsdcAta, vaultPda, USDC_MINT, TOKEN_PROGRAM_ID,
  );
  const tx2 = new Transaction().add(createAtaIx);
  const sig2 = await sendAndConfirmTransaction(connection, tx2, [authority]);
  console.log("USDC ATA created:", sig2);

  // Step 3: Create Token-2022 mint
  console.log(`\n--- Creating ${mintLabel} Mint (${rateBps} bps) ---`);
  const mintKeypair = Keypair.generate();
  const mintLen = getMintLen([ExtensionType.InterestBearingConfig]);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const tx3 = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: authority.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeInterestBearingMintInstruction(
      mintKeypair.publicKey,
      vaultPda, // rate authority
      rateBps,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      6, // decimals
      vaultPda, // mint authority
      null, // no freeze
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  const sig3 = await sendAndConfirmTransaction(connection, tx3, [authority, mintKeypair]);
  console.log(`${mintLabel} mint:`, mintKeypair.publicKey.toBase58());
  console.log("Tx:", sig3);

  // Save everything
  const config = {
    name: vaultName,
    mintLabel,
    network: "mainnet-beta",
    authority: authority.publicKey.toBase58(),
    multisig: multisigPda.toBase58(),
    vaultPda: vaultPda.toBase58(),
    vaultUsdcAta: vaultUsdcAta.toBase58(),
    mint: mintKeypair.publicKey.toBase58(),
    rateBps,
    createKey: createKey.publicKey.toBase58(),
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  fs.writeFileSync(`${outDir}/mint.json`, JSON.stringify(Array.from(mintKeypair.secretKey)));
  fs.writeFileSync(`${outDir}/create-key.json`, JSON.stringify(Array.from(createKey.secretKey)));

  console.log(`\n✅ Config saved to ${configPath}`);
  console.log(JSON.stringify(config, null, 2));

  console.log(`\n--- Env vars for ${vaultName} ---`);
  const prefix = vaultName.toUpperCase();
  console.log(`VAULT_${prefix}_MULTISIG=${multisigPda.toBase58()}`);
  console.log(`VAULT_${prefix}_PDA=${vaultPda.toBase58()}`);
  console.log(`VAULT_${prefix}_USDC_ATA=${vaultUsdcAta.toBase58()}`);
  console.log(`NEXT_PUBLIC_${prefix}_MINT=${mintKeypair.publicKey.toBase58()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
