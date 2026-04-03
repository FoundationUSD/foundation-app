/**
 * Foundation App — Pre-Launch Test Script
 * 
 * Run this after deployment to verify everything works.
 * 
 * Usage:
 *   npx tsx scripts/test-deployment.ts
 */

import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getMint,
  getAccount,
} from "@solana/spl-token";
import bs58 from "bs58";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Load env vars
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const fdnAlphaMint = process.env.NEXT_PUBLIC_FDN_ALPHA_MINT;
  const vaultPda = process.env.VAULT_PDA;
  const vaultUsdcAta = process.env.VAULT_USDC_ATA;
  const authoritySecret = process.env.VAULT_AUTHORITY_SECRET;

  const connection = new Connection(rpcUrl, "confirmed");

  // Test 1: Environment variables
  console.log("\n📋 Test 1: Environment Variables");
  const envVars = {
    NEXT_PUBLIC_FDN_ALPHA_MINT: fdnAlphaMint,
    VAULT_PDA: vaultPda,
    VAULT_USDC_ATA: vaultUsdcAta,
    VAULT_AUTHORITY_SECRET: authoritySecret ? "✓ Set" : "✗ Missing",
  };

  const envPassed = Object.values(envVars).every((v) => v && !v.includes("Missing"));
  results.push({
    name: "Environment Variables",
    passed: envPassed,
    message: envPassed ? "All required vars set" : "Missing vars: check .env.local",
  });
  console.log(envVars);

  // Test 2: Solana RPC connectivity
  console.log("\n📋 Test 2: Solana RPC Connectivity");
  try {
    const slot = await connection.getSlot();
    const balance = await connection.getBalance(new PublicKey(vaultPda!));
    results.push({
      name: "Solana RPC",
      passed: true,
      message: `Connected (slot ${slot}, vault balance: ${balance / LAMPORTS_PER_SOL} SOL)`,
    });
    console.log(`✓ Connected to ${rpcUrl} (slot ${slot})`);
  } catch (error) {
    results.push({
      name: "Solana RPC",
      passed: false,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    console.log("✗ RPC connection failed");
    return results; // Can't continue without RPC
  }

  // Test 3: fdnALPHA mint exists
  console.log("\n📋 Test 3: fdnALPHA Mint");
  if (fdnAlphaMint) {
    try {
      const mintPubkey = new PublicKey(fdnAlphaMint);
      const mintInfo = await getMint(connection, mintPubkey, "confirmed", TOKEN_2022_PROGRAM_ID);
      results.push({
        name: "fdnALPHA Mint",
        passed: true,
        message: `Mint exists, supply: ${Number(mintInfo.supply) / 1e6} fdnALPHA`,
      });
      console.log(`✓ Mint: ${fdnAlphaMint}`);
      console.log(`  Supply: ${Number(mintInfo.supply) / 1e6}`);
      console.log(`  Decimals: ${mintInfo.decimals}`);
    } catch (error) {
      results.push({
        name: "fdnALPHA Mint",
        passed: false,
        message: "Mint not found or invalid",
      });
      console.log("✗ Mint not found");
    }
  }

  // Test 4: Vault PDA exists
  console.log("\n📋 Test 4: Vault PDA");
  if (vaultPda) {
    try {
      const vaultPubkey = new PublicKey(vaultPda);
      const info = await connection.getAccountInfo(vaultPubkey);
      results.push({
        name: "Vault PDA",
        passed: !!info,
        message: info ? "PDA exists" : "PDA not found",
      });
      console.log(info ? `✓ Vault PDA exists: ${vaultPda}` : "✗ Vault PDA not found");
    } catch (error) {
      results.push({
        name: "Vault PDA",
        passed: false,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Test 5: Vault USDC account
  console.log("\n📋 Test 5: Vault USDC Account");
  if (vaultUsdcAta) {
    try {
      const usdcAccount = new PublicKey(vaultUsdcAta);
      const accountInfo = await getAccount(connection, usdcAccount, "confirmed", TOKEN_PROGRAM_ID);
      const balance = Number(accountInfo.amount) / 1e6;
      results.push({
        name: "Vault USDC Account",
        passed: true,
        message: `Balance: ${balance} USDC`,
      });
      console.log(`✓ USDC Account: ${vaultUsdcAta}`);
      console.log(`  Balance: ${balance} USDC`);
    } catch (error) {
      results.push({
        name: "Vault USDC Account",
        passed: false,
        message: "Account not found or empty",
      });
      console.log("✗ USDC account not found or empty");
    }
  }

  // Test 6: Health endpoint
  console.log("\n📋 Test 6: Health Endpoint");
  try {
    const res = await fetch("http://localhost:3000/api/health");
    const data = await res.json();
    results.push({
      name: "Health Endpoint",
      passed: res.status === 200 && data.status === "ok",
      message: `Status: ${data.status}`,
    });
    console.log(res.status === 200 ? "✓ Health check passed" : `✗ Health check failed: ${res.status}`);
  } catch (error) {
    results.push({
      name: "Health Endpoint",
      passed: false,
      message: "Endpoint not reachable (is server running?)",
    });
    console.log("✗ Health endpoint not reachable");
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("TEST SUMMARY");
  console.log("=".repeat(50));
  
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  
  results.forEach((r) => {
    console.log(`${r.passed ? "✓" : "✗"} ${r.name}: ${r.message}`);
  });
  
  console.log(`\nTotal: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log("\n🎉 All tests passed! Ready for mainnet launch.");
  } else {
    console.log("\n⚠️  Some tests failed. Review and fix before launching.");
  }

  return results;
}

runTests().catch(console.error);
