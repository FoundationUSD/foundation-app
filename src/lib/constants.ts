import { address, type Address } from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

// Re-export program addresses for convenience
export { TOKEN_2022_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS };

// Network
export const SOLANA_NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "mainnet-beta";
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// USDC mints
export const USDC_MINT_DEVNET = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
export const USDC_MINT_MAINNET = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
export const USDC_MINT: Address = SOLANA_NETWORK === "mainnet-beta" ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;
export const USDC_DECIMALS = 6;

// Vault definitions
export const VAULT_CONFIGS = {
  fdnAPOLLO: {
    id: "fdnAPOLLO",
    name: "fdnAPOLLO",
    symbol: "fdnAPOLLO",
    underlying: "Apollo Diversified Credit (ACRED)",
    rateBps: 877,
    apy: 8.77,
    mint: process.env.NEXT_PUBLIC_VAULT_APOLLO_MINT || "",
  },
  fdnBUILD: {
    id: "fdnBUILD",
    name: "fdnBUILD",
    symbol: "fdnBUILD",
    underlying: "BlackRock USD Institutional (BUIDL)",
    rateBps: 450,
    apy: 4.5,
    mint: process.env.NEXT_PUBLIC_VAULT_BUILD_MINT || "",
  },
  fdnSCOPE: {
    id: "fdnSCOPE",
    name: "fdnSCOPE",
    symbol: "fdnSCOPE",
    underlying: "Hamilton Lane SCOPE",
    rateBps: 667,
    apy: 6.67,
    mint: process.env.NEXT_PUBLIC_VAULT_SCOPE_MINT || "",
  },
} as const;

export type VaultId = keyof typeof VAULT_CONFIGS;

// Protocol fee — covers Squads multisig tx fees + rent
export const PROTOCOL_FEE_SOL = 0.005;
export const VAULT_AUTHORITY_PUBKEY = process.env.NEXT_PUBLIC_VAULT_AUTHORITY || "4J9mszyDLi4js4rh8Hq5spNaLCNt4fRozr781zcVBYgv";

// Solomon Labs
export const SOLOMON_USDV_MINT = address("Ex5DaKYMCN6QWFA4n67TmMwsH8MJV68RX6YXTmVM532C");
export const SOLOMON_SUSDV_MINT = address("pTA4St7D5WshfLUPBXoaxn5m8e3k2ort2DVt3gUTa17");

// Explorer — orbmarkets.io
export const EXPLORER_URL = "https://orbmarkets.io";

export const getTxUrl = (sig: string) => `${EXPLORER_URL}/tx/${sig}`;
export const getAccountUrl = (addr: string) => `${EXPLORER_URL}/account/${addr}`;
