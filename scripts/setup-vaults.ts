/**
 * One-time setup script: creates Token-2022 mints with interest-bearing extension.
 *
 * Usage:
 *   npx tsx scripts/setup-vaults.ts
 *   npx tsx scripts/setup-vaults.ts --mainnet
 */

import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeInterestBearingMintInstruction,
  getMintLen,
  ExtensionType,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fs from "fs";
import path from "path";

const USDC_MINT_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const USDC_MINT_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

const VAULTS = [
  {
    name: "fdnAPOLLO",
    symbol: "fdnAPOLLO",
    rate: 877,
    underlying: "Apollo Diversified Credit (ACRED)",
  },
  {
    name: "fdnBUILD",
    symbol: "fdnBUILD",
    rate: 450,
    underlying: "BlackRock USD Institutional (BUIDL)",
  },
  {
    name: "fdnSCOPE",
    symbol: "fdnSCOPE",
    rate: 667,
    underlying: "Hamilton Lane SCOPE",
  },
];

async function main() {
  const isMainnet = process.argv.includes("--mainnet");
  const network = isMainnet ? "mainnet-beta" : "devnet";
  const usdcMint = isMainnet ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;

  console.log(`Network: ${network}`);

  const connection = new Connection(
    process.env.SOLANA_RPC_URL || clusterApiUrl(network as any),
    "confirmed",
  );

  // Generate or load vault authority keypair
  const keysDir = path.join(process.cwd(), "keys");
  const keyPath = path.join(keysDir, "vault-authority.json");

  let vaultAuthority: Keypair;

  if (fs.existsSync(keyPath)) {
    vaultAuthority = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, "utf-8"))),
    );
    console.log(`Loaded existing vault authority: ${vaultAuthority.publicKey.toBase58()}`);
  } else {
    vaultAuthority = Keypair.generate();
    fs.mkdirSync(keysDir, { recursive: true });
    fs.writeFileSync(keyPath, JSON.stringify(Array.from(vaultAuthority.secretKey)));
    console.log(`Generated new vault authority: ${vaultAuthority.publicKey.toBase58()}`);
    console.log(`Fund this wallet with SOL before proceeding`);
  }

  // Check SOL balance
  const balance = await connection.getBalance(vaultAuthority.publicKey);
  console.log(`Authority SOL balance: ${balance / 1e9} SOL`);

  if (balance < 0.05 * 1e9) {
    console.log("\nInsufficient SOL. Fund the vault authority first:");
    console.log(`  solana airdrop 2 ${vaultAuthority.publicKey.toBase58()} --url devnet`);
    process.exit(1);
  }

  const results: Record<string, any> = {};

  for (const vault of VAULTS) {
    console.log(`\nCreating ${vault.name}...`);

    const mintKeypair = Keypair.generate();
    const mintLen = getMintLen([ExtensionType.InterestBearingConfig]);
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: vaultAuthority.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        space: mintLen,
        lamports,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
      createInitializeInterestBearingMintInstruction(
        mintKeypair.publicKey,
        vaultAuthority.publicKey, // rateAuthority
        vault.rate, // initial rate in bps
        TOKEN_2022_PROGRAM_ID,
      ),
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        6, // decimals (same as USDC)
        vaultAuthority.publicKey, // mintAuthority
        null, // freezeAuthority
        TOKEN_2022_PROGRAM_ID,
      ),
    );

    await sendAndConfirmTransaction(connection, tx, [vaultAuthority, mintKeypair]);
    console.log(`  Mint created: ${mintKeypair.publicKey.toBase58()}`);

    // Create USDC ATA for vault (to hold deposits)
    const vaultUsdcAta = getAssociatedTokenAddressSync(
      usdcMint,
      vaultAuthority.publicKey,
      false,
      TOKEN_PROGRAM_ID,
    );

    try {
      const ataCheck = await connection.getAccountInfo(vaultUsdcAta);
      if (!ataCheck) {
        const ataTx = new Transaction().add(
          createAssociatedTokenAccountInstruction(
            vaultAuthority.publicKey,
            vaultUsdcAta,
            vaultAuthority.publicKey,
            usdcMint,
            TOKEN_PROGRAM_ID,
          ),
        );
        await sendAndConfirmTransaction(connection, ataTx, [vaultAuthority]);
        console.log(`  USDC ATA created: ${vaultUsdcAta.toBase58()}`);
      } else {
        console.log(`  USDC ATA exists: ${vaultUsdcAta.toBase58()}`);
      }
    } catch (e) {
      console.log(`  USDC ATA note: may already exist or need SOL`);
    }

    // Save mint keypair
    const mintKeyPath = path.join(keysDir, `${vault.name.toLowerCase()}-mint.json`);
    fs.writeFileSync(mintKeyPath, JSON.stringify(Array.from(mintKeypair.secretKey)));

    results[vault.name] = {
      mint: mintKeypair.publicKey.toBase58(),
      rate: vault.rate,
      underlying: vault.underlying,
      vaultUsdcAccount: vaultUsdcAta.toBase58(),
    };

    console.log(`  Rate: ${vault.rate} bps (${vault.rate / 100}% APY)`);
  }

  // Write config
  const config = {
    network,
    vaultAuthority: vaultAuthority.publicKey.toBase58(),
    usdcMint: usdcMint.toBase58(),
    vaults: results,
    createdAt: new Date().toISOString(),
  };

  const configPath = path.join(process.cwd(), "vault-config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log("\nConfig written to vault-config.json");
  console.log(JSON.stringify(config, null, 2));

  // Output .env.local values
  console.log("\n--- Add to .env.local ---");
  console.log(`VAULT_AUTHORITY_SECRET=${require("bs58").encode(vaultAuthority.secretKey)}`);
  for (const [name, data] of Object.entries(results)) {
    const envKey = `NEXT_PUBLIC_VAULT_${name.replace("fdn", "").toUpperCase()}_MINT`;
    console.log(`${envKey}=${(data as any).mint}`);
  }
}

main().catch(console.error);
