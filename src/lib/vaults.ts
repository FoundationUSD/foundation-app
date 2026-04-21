/**
 * Foundation Managed Vaults — 3 Squads multisigs, 3 receipt tokens.
 *
 * Solomon:  LIVE — soloUSD
 * Kamino:   LIVE — kmnoUSD
 * Oro:      LIVE — oroUSD
 */

export interface FoundationVault {
  id: string;
  name: string;
  strategy: string;
  protocol: "solomon" | "kamino" | "oro";
  description: string;
  underlying: string;
  riskTier: "conservative" | "moderate" | "growth";
  apy: number;
  receiptToken: string;
  features: string[];
  howItWorks: string[];
  status: "live" | "coming_soon";
  vaultPda: string;
  usdcAccount: string;
  mint: string;
  multisig: string;
  /** USD value currently under management — filled at request time by /api/strategies. */
  tvlUsd?: number;
}

export const FOUNDATION_VAULTS: FoundationVault[] = [
  {
    id: "fdn-solomon",
    name: "Foundation × Solomon",
    strategy: "sUSDV Basis Yield",
    protocol: "solomon",
    description:
      "Deposit USDC. Foundation swaps to USDv via Jupiter and stakes into Solomon's sUSDV for delta-neutral basis trade yield on BTC, ETH, and SOL.",
    underlying: "Solomon sUSDV (Basis Trading)",
    riskTier: "moderate",
    apy: 12.5,
    receiptToken: "soloUSD",
    features: ["~12.5% target APY", "Delta-neutral strategy", "Managed by Foundation", "7-day unstake cooldown"],
    howItWorks: [
      "You deposit USDC into Foundation's Squads multisig vault",
      "Foundation swaps USDC → USDv via Jupiter aggregator",
      "USDv is staked into Solomon's program → receives sUSDV",
      "Yield accrues from basis trading (spot-long / perp-short)",
      "Your soloUSD balance grows via Token-2022 interest-bearing extension",
      "Withdraw anytime — Foundation unstakes and swaps back to USDC",
    ],
    status: "live",
    vaultPda: process.env.NEXT_PUBLIC_SOLOMON_VAULT_PDA || "",
    usdcAccount: process.env.NEXT_PUBLIC_SOLOMON_USDC_ATA || "",
    mint: process.env.NEXT_PUBLIC_SOLOMON_MINT || "",
    multisig: process.env.VAULT_SOLOMON_MULTISIG || "",
  },
  {
    id: "fdn-kamino",
    name: "Foundation × Kamino",
    strategy: "PRIME Credit Yield",
    protocol: "kamino",
    description:
      "Deposit USDC. Foundation supplies it to Kamino's PRIME lending market — backed by Figure's $19B HELOC portfolio (avg FICO 745, 88% max LTV).",
    underlying: "Kamino PRIME (Figure HELOCs)",
    riskTier: "conservative",
    apy: 0,
    receiptToken: "kmnoUSD",
    features: ["Institutional collateral", "$570M+ market", "No lockup", "Managed by Foundation"],
    howItWorks: [
      "You deposit USDC into Foundation's Squads multisig vault",
      "Foundation deposits USDC into Kamino's PRIME lending market",
      "USDC earns yield from PRIME borrowers (Figure home equity loans)",
      "Your kmnoUSD balance grows via Token-2022 interest-bearing extension",
      "Withdraw anytime — Foundation withdraws from Kamino and sends USDC back",
    ],
    status: "live",
    vaultPda: process.env.NEXT_PUBLIC_KAMINO_VAULT_PDA || "",
    usdcAccount: process.env.NEXT_PUBLIC_KAMINO_USDC_ATA || "",
    mint: process.env.NEXT_PUBLIC_KAMINO_MINT || "",
    multisig: process.env.VAULT_KAMINO_MULTISIG || "",
  },
  {
    id: "fdn-oro",
    name: "Foundation × Oro",
    strategy: "Gold-Backed Exposure",
    protocol: "oro",
    description:
      "Deposit USDC. Foundation swaps to $GOLD via Jupiter — tokenized physical gold (1:1 LBMA-certified, allocated, insured). Your position tracks live gold price; withdraw anytime.",
    underlying: "Oro $GOLD (Tokenized Physical Gold)",
    riskTier: "conservative",
    apy: 3.5,
    receiptToken: "oroUSD",
    features: [
      "1 $GOLD = 1 oz physical gold",
      "LBMA certified · allocated · insured",
      "No lockup · withdraw anytime",
      "Managed by Foundation",
    ],
    howItWorks: [
      "You deposit USDC into Foundation's Squads multisig vault",
      "Foundation swaps USDC → $GOLD via Jupiter (Oro's tokenized physical gold)",
      "$GOLD is held in the multisig — exposure tracks live gold spot price",
      "Your oroUSD balance reflects the vault's gold holdings via Token-2022 rate updates",
      "Withdraw anytime — Foundation swaps $GOLD back to USDC at market rate",
    ],
    status: "coming_soon",
    vaultPda: process.env.NEXT_PUBLIC_ORO_VAULT_PDA || "",
    usdcAccount: process.env.NEXT_PUBLIC_ORO_USDC_ATA || "",
    mint: process.env.NEXT_PUBLIC_ORO_MINT || "",
    multisig: process.env.VAULT_ORO_MULTISIG || "",
  },
];
