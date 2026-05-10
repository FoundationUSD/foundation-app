/**
 * Foundation Managed Vaults — Squads multisig + Token-2022 InterestBearing receipt mint.
 *
 * Solomon:    LIVE — soloUSD
 * Kamino:     LIVE — kmnoUSD
 * Oro:        LIVE — oroUSD
 * AWY:        LIVE — awyUSD  (4-leg blended RWA basket; flagship)
 */

export interface FoundationVault {
  id: string;
  /** Display name — used as fallback in lists, search, and back-compat. */
  name: string;
  /** Provider / curator label. Shown in small gold above the title.
   *  "Solomon" / "Kamino" / "Oro" for partner pass-throughs.
   *  "Foundation" for in-house baskets (AWY). */
  provider: string;
  /** The headline asset or product. Shown big as the page/card title.
   *  e.g. "sUSDV" / "PRIME" / "$GOLD" / "All-Weather Yield" / "Forge Basket". */
  assetName: string;
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
  /** Leverage multiple applied to the PRIME slice via Kamino Multiply.
   *  Unset for unlevered vaults. 2 = 50% LTV target. 3 = 67% LTV target. */
  leverage?: number;
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
    name: "Solomon",
    provider: "Solomon",
    assetName: "sUSDV",
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
    name: "Kamino",
    provider: "Kamino",
    assetName: "PRIME",
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
    name: "Oro",
    provider: "Oro",
    assetName: "$GOLD",
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
    name: "AWY",
    provider: "Foundation",
    assetName: "All-Weather Yield",
    strategy: "All-Weather Yield",
    protocol: "awy",
    category: "foundation",
    description:
      "Deposit USDC into a four-leg basket designed to hold its yield across rate cycles, credit cycles, and crypto drawdowns. Foundation allocates 35 percent to OnRe reinsurance receipts (ONyc, minted at NAV via OnRe's permissionless program), 25 percent to Kamino's Figure-PRIME USDC supply, 20 percent to Kamino Main USDC supply (Maple proxy), and 20 percent to Solomon's delta-neutral basis trade (USDv). External leverage on the credit legs is on the roadmap — wired in once Kamino publishes an ONyc lending reserve.",
    underlying: "Blended: ONyc + Kamino-PRIME + Kamino-Main + USDv",
    riskTier: "moderate",
    // Spec-target — the actual on-chain awyUSD interest rate is set by the
    // update-rate cron from awyData.blendedBaseApy (live data per leg).
    apy: 7.85,
    receiptToken: "awyUSD",
    features: [
      "~7.85% blended target APY",
      "4 independent risk drivers",
      "ONyc minted at NAV · others routed to Kamino supply",
      "Quarterly rebalance · async ONyc redemption",
    ],
    howItWorks: [
      "Deposit USDC into Foundation's Squads multisig vault.",
      "Foundation routes the deposit across four legs at target weights of 20 percent USDv, 25 percent PRIME, 35 percent ONyc, and 20 percent syrupUSDC.",
      "ONyc slice mints directly at NAV via OnRe's permissionless program (no Jupiter slippage). PRIME and syrupUSDC slices supply USDC to Kamino markets. USDv slice swaps via Jupiter, then stakes into sUSDV.",
      "Your awyUSD balance grows automatically through the Token-2022 InterestBearing extension at the live blended rate.",
      "Withdraw any time — instant via idle USDC + Kamino redemption + USDv reverse-swap. Larger withdrawals queue an ONyc redemption (24–72h fulfillment).",
    ],
    status: "live",
    vaultPda: process.env.NEXT_PUBLIC_AWY_VAULT_PDA || "",
    usdcAccount: process.env.NEXT_PUBLIC_AWY_USDC_ATA || "",
    mint: process.env.NEXT_PUBLIC_AWY_MINT || "",
    multisig: process.env.VAULT_AWY_MULTISIG || "",
  },
  {
    id: "fdn-awy-2x",
    name: "AWY 2x",
    provider: "Foundation",
    assetName: "All-Weather Yield · 2x",
    strategy: "Levered All-Weather Yield",
    protocol: "awy",
    category: "foundation",
    description:
      "AWY base basket with the PRIME credit slice levered ~2x via Kamino Multiply (50 percent target LTV). Net APY = base blended yield + (PRIME supply − borrow spread × leverage). Liquidation gap stays above 30 percentage points to PRIME's 80 percent threshold. ONyc, syrupUSDC, and USDv slices remain unlevered.",
    underlying: "AWY basket · PRIME slice 2x via Kamino Multiply",
    riskTier: "moderate",
    apy: 14,
    leverage: 2,
    receiptToken: "awy2xUSD",
    features: [
      "~14% target APY",
      "PRIME slice 2x via Kamino Multiply",
      "30+ pp gap to liquidation",
      "Quarterly rebalance · async ONyc redemption",
    ],
    howItWorks: [
      "Deposit USDC into the AWY 2x Squads multisig vault.",
      "Foundation routes the deposit across the four AWY legs at standard weights, then opens a Kamino Multiply position on the PRIME slice at 50 percent target LTV (~2x exposure).",
      "Levered net APY = unlevered blend + (PRIME supply − cheapest stable borrow) × leverage on the PRIME slice. Updated to the awy2xUSD InterestBearing rate by the rate cron.",
      "Your awy2xUSD balance grows automatically through the Token-2022 InterestBearing extension at the live levered rate.",
      "Withdraw any time — Foundation unwinds the multiply position and returns USDC. Larger withdrawals may queue an ONyc redemption (24–72h fulfillment).",
    ],
    status: "live",
    vaultPda: process.env.NEXT_PUBLIC_AWY2X_VAULT_PDA || "",
    usdcAccount: process.env.NEXT_PUBLIC_AWY2X_USDC_ATA || "",
    mint: process.env.NEXT_PUBLIC_AWY2X_MINT || "",
    multisig: process.env.VAULT_AWY2X_MULTISIG || "",
  },
  {
    id: "fdn-awy-3x",
    name: "AWY 3x",
    provider: "Foundation",
    assetName: "All-Weather Yield · 3x",
    strategy: "Max Levered All-Weather Yield",
    protocol: "awy",
    category: "foundation",
    description:
      "AWY base basket with the PRIME credit slice levered ~3x via Kamino Multiply (67 percent target LTV). Higher net APY than the 2x tier with a tighter 13 percentage-point gap to PRIME's 80 percent liquidation threshold. ONyc, syrupUSDC, and USDv slices remain unlevered.",
    underlying: "AWY basket · PRIME slice 3x via Kamino Multiply",
    riskTier: "growth",
    apy: 21,
    leverage: 3,
    receiptToken: "awy3xUSD",
    features: [
      "~21% target APY",
      "PRIME slice 3x via Kamino Multiply",
      "13 pp gap to liquidation",
      "Quarterly rebalance · async ONyc redemption",
    ],
    howItWorks: [
      "Deposit USDC into the AWY 3x Squads multisig vault.",
      "Foundation routes the deposit across the four AWY legs at standard weights, then opens a Kamino Multiply position on the PRIME slice at 67 percent target LTV (~3x exposure).",
      "Levered net APY = unlevered blend + (PRIME supply − cheapest stable borrow) × leverage on the PRIME slice. Updated to the awy3xUSD InterestBearing rate by the rate cron.",
      "Your awy3xUSD balance grows automatically through the Token-2022 InterestBearing extension at the live levered rate.",
      "Withdraw any time — Foundation unwinds the multiply position and returns USDC. Larger withdrawals may queue an ONyc redemption (24–72h fulfillment).",
    ],
    status: "live",
    vaultPda: process.env.NEXT_PUBLIC_AWY3X_VAULT_PDA || "",
    usdcAccount: process.env.NEXT_PUBLIC_AWY3X_USDC_ATA || "",
    mint: process.env.NEXT_PUBLIC_AWY3X_MINT || "",
    multisig: process.env.VAULT_AWY3X_MULTISIG || "",
  },
];
