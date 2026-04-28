/**
 * Foundation Managed Vaults — Squads multisig + Token-2022 InterestBearing receipt mint.
 *
 * Solomon:  LIVE — soloUSD
 * Kamino:   LIVE — kmnoUSD
 * Oro:      LIVE — oroUSD
 * AWY:      LIVE — awyUSD (4-leg blended RWA basket; flagship)
 */

export interface FoundationVault {
  id: string;
  name: string;
  strategy: string;
  protocol: "solomon" | "kamino" | "oro" | "awy";
  /**
   * Source classification surfaced by the Invest page filter.
   *  - "foundation": composed and managed by Foundation itself (e.g. AWY blended basket).
   *  - "partner":    pass-through into a single partner protocol (Solomon, Kamino, Oro).
   */
  category: "foundation" | "partner";
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
  /** USD value currently under management. Filled at request time by /api/strategies. */
  tvlUsd?: number;
  /** Per-protocol live metadata. See /api/strategies for shape per protocol. */
  meta?: Record<string, unknown>;
}

export const FOUNDATION_VAULTS: FoundationVault[] = [
  {
    id: "fdn-solomon",
    name: "Foundation × Solomon",
    strategy: "sUSDV Basis Yield",
    protocol: "solomon",
    category: "partner",
    description:
      "Deposit USDC and Foundation routes it into Solomon's sUSDV, a delta-neutral basis trade across BTC, ETH, and SOL. Yield comes from the funding rate spread between spot longs and perpetual shorts. The position is hedge-neutral by construction, so directional moves in the underlyings do not affect principal.",
    underlying: "Solomon sUSDV (Basis Trading)",
    riskTier: "moderate",
    apy: 12.5,
    receiptToken: "soloUSD",
    features: ["~12.5% target APY", "Delta-neutral strategy", "Managed by Foundation", "7-day unstake cooldown"],
    howItWorks: [
      "Deposit USDC into Foundation's Squads multisig vault.",
      "Foundation converts USDC into USDv through Jupiter and stakes it into Solomon for sUSDV.",
      "Yield accrues continuously from the basis trade (spot long, perpetual short).",
      "Your soloUSD balance grows automatically through the Token-2022 InterestBearing extension.",
      "Withdraw any time. Foundation unstakes the position and returns USDC to your wallet.",
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
    category: "partner",
    description:
      "Deposit USDC and Foundation supplies it to Kamino's PRIME lending market. PRIME is collateralized by Figure Technologies' on-chain HELOC portfolio, currently sized at $19B with an average borrower FICO of 745 and an 88 percent max loan-to-value. Yield comes from the spread between USDC supply and HELOC borrow rates.",
    underlying: "Kamino PRIME (Figure HELOCs)",
    riskTier: "conservative",
    apy: 0,
    receiptToken: "kmnoUSD",
    features: ["Institutional collateral", "$570M+ market", "No lockup", "Managed by Foundation"],
    howItWorks: [
      "Deposit USDC into Foundation's Squads multisig vault.",
      "Foundation supplies the deposit into Kamino's PRIME lending market.",
      "Borrowers pay supply yield directly to depositors. Foundation passes that through to kmnoUSD holders.",
      "Your kmnoUSD balance grows automatically through the Token-2022 InterestBearing extension.",
      "Withdraw any time. Foundation pulls the position from Kamino and returns USDC to your wallet.",
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
    category: "partner",
    description:
      "Deposit USDC and Foundation converts it into $GOLD, Oro's tokenized physical gold. Each $GOLD represents one ounce of LBMA-certified, allocated, and insured bullion held in vault. Your position tracks the live spot price and is redeemable at market on withdrawal.",
    underlying: "Oro $GOLD (Tokenized Physical Gold)",
    riskTier: "conservative",
    apy: 3.5,
    receiptToken: "oroUSD",
    features: [
      "1 $GOLD equals 1 oz physical gold",
      "LBMA certified, allocated, insured",
      "No lockup",
      "Managed by Foundation",
    ],
    howItWorks: [
      "Deposit USDC into Foundation's Squads multisig vault.",
      "Foundation routes the USDC into $GOLD through Jupiter at the prevailing spot price.",
      "The multisig holds the $GOLD position. Exposure tracks the live gold market.",
      "Your oroUSD balance reflects the vault's gold holdings via Token-2022 rate updates.",
      "Withdraw any time. Foundation sells the $GOLD back to USDC at market rate.",
    ],
    status: "coming_soon",
    vaultPda: process.env.NEXT_PUBLIC_ORO_VAULT_PDA || "",
    usdcAccount: process.env.NEXT_PUBLIC_ORO_USDC_ATA || "",
    mint: process.env.NEXT_PUBLIC_ORO_MINT || "",
    multisig: process.env.VAULT_ORO_MULTISIG || "",
  },
  {
    id: "fdn-awy",
    name: "Foundation × AWY",
    strategy: "All-Weather Yield",
    protocol: "awy",
    category: "foundation",
    description:
      "Deposit USDC into a four-leg basket designed to hold its yield across rate cycles, credit cycles, and crypto drawdowns. Foundation allocates 35 percent to OnRe reinsurance receipts (ONyc), 30 percent to Kamino PRIME credit, 25 percent to Maple's institutional lending (syrupUSDC), and 10 percent to Solomon's delta-neutral basis trade (USDv). No single macro regime compresses every leg at once.",
    underlying: "Blended: ONyc · PRIME · syrupUSDC · USDv",
    riskTier: "moderate",
    // Spec-target only — the strategies API overwrites this with the live blended
    // value computed from each leg's actual APY (see /api/strategies).
    apy: 8.1,
    receiptToken: "awyUSD",
    features: [
      "~8.1% blended base APY",
      "4 independent risk drivers",
      "Quarterly rebalance",
      "Managed by Foundation",
    ],
    howItWorks: [
      "Deposit USDC into Foundation's Squads multisig vault.",
      "Foundation routes the deposit across four legs at target weights of 35, 30, 25, and 10 percent.",
      "Each leg accrues yield from its own underlying source. The basket rebalances quarterly back to target.",
      "Your awyUSD balance grows automatically through the Token-2022 InterestBearing extension at the live blended rate.",
      "Withdraw any time. Foundation unwinds proportional slices across the four legs and returns USDC.",
    ],
    status: "live",
    vaultPda: process.env.NEXT_PUBLIC_AWY_VAULT_PDA || "",
    usdcAccount: process.env.NEXT_PUBLIC_AWY_USDC_ATA || "",
    mint: process.env.NEXT_PUBLIC_AWY_MINT || "",
    multisig: process.env.VAULT_AWY_MULTISIG || "",
  },
];
