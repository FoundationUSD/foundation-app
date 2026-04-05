/**
 * Foundation Managed Vaults — 4 Squads multisigs, 4 receipt tokens.
 *
 * Solomon:  LIVE — soloUSD
 * Kamino:   LIVE — kmnoUSD
 * Oro:      LIVE — oroUSD
 * Drift:    Coming Soon — driftUSD
 */

export interface FoundationVault {
  id: string;
  name: string;
  strategy: string;
  protocol: "solomon" | "kamino" | "drift" | "oro";
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
    strategy: "Gold Leasing Yield",
    protocol: "oro",
    description:
      "Deposit USDC. Foundation purchases tokenized gold ($GOLD) via Oro's GRAIL API and earns yield from institutional gold leasing through Monetary Metals.",
    underlying: "Oro $GOLD (Physical Gold Leasing)",
    riskTier: "conservative",
    apy: 3.5,
    receiptToken: "oroUSD",
    features: ["~3.5% gold-denominated APY", "Physical gold backed (Brinks)", "LBMA certified", "Managed by Foundation"],
    howItWorks: [
      "You deposit USDC into Foundation's Squads multisig vault",
      "Foundation purchases $GOLD (tokenized physical gold) via Oro's GRAIL API",
      "$GOLD is staked — yield comes from institutional gold leasing via Monetary Metals",
      "Jewelers and manufacturers pay lease fees denominated in gold",
      "Your oroUSD balance grows via Token-2022 interest-bearing extension",
      "Withdraw anytime — Foundation sells $GOLD and returns USDC",
    ],
    status: "coming_soon",
    vaultPda: process.env.NEXT_PUBLIC_ORO_VAULT_PDA || "",
    usdcAccount: process.env.NEXT_PUBLIC_ORO_USDC_ATA || "",
    mint: process.env.NEXT_PUBLIC_ORO_MINT || "",
    multisig: process.env.VAULT_ORO_MULTISIG || "",
  },
  {
    id: "fdn-drift",
    name: "Foundation × Drift",
    strategy: "Levered RWA Yield",
    protocol: "drift",
    description:
      "Deposit USDC. Foundation deposits into Gauntlet's levered RWA vault on Drift — loops sACRED (Apollo credit) collateral for enhanced yield.",
    underlying: "Drift/Gauntlet sACRED (Apollo Credit)",
    riskTier: "growth",
    apy: 0,
    receiptToken: "driftUSD",
    features: ["Gauntlet managed", "Levered RWA strategy", "Redemption period", "Managed by Foundation"],
    howItWorks: [
      "You deposit USDC into Foundation's Squads multisig vault",
      "Foundation deposits USDC into Gauntlet's levered RWA vault on Drift",
      "Vault manager loops sACRED collateral to amplify yield",
      "Your driftUSD balance grows via Token-2022 interest-bearing extension",
      "Withdraw anytime — Foundation requests Drift withdrawal (redemption period applies)",
    ],
    status: "coming_soon",
    vaultPda: process.env.NEXT_PUBLIC_DRIFT_VAULT_PDA || "",
    usdcAccount: process.env.NEXT_PUBLIC_DRIFT_USDC_ATA || "",
    mint: process.env.NEXT_PUBLIC_DRIFT_MINT || "",
    multisig: process.env.VAULT_DRIFT_MULTISIG || "",
  },
];
