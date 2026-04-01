/**
 * Environment variable validation.
 * Import this in API routes that need specific env vars.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getVaultEnv() {
  return {
    multisig: requireEnv("VAULT_MULTISIG"),
    vaultPda: requireEnv("VAULT_PDA"),
    vaultUsdcAta: requireEnv("VAULT_USDC_ATA"),
    fdnAlphaMint: requireEnv("NEXT_PUBLIC_FDN_ALPHA_MINT"),
    authoritySecret: requireEnv("VAULT_AUTHORITY_SECRET"),
    rpcUrl: process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  };
}

export function isVaultConfigured(): boolean {
  return !!(
    process.env.VAULT_MULTISIG &&
    process.env.VAULT_PDA &&
    process.env.NEXT_PUBLIC_FDN_ALPHA_MINT &&
    process.env.VAULT_AUTHORITY_SECRET
  );
}
