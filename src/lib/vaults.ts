/**
 * Foundation Managed Vaults
 *
 * Each vault is a Squads multisig that holds USDC deposits and deploys
 * them into a specific RWA strategy. Users deposit USDC and receive
 * fdnALPHA (Token-2022 interest-bearing receipt token).
 *
 * The vault team manages the underlying strategy:
 *   - Solomon: USDC → Jupiter swap → USDv → stake sUSDV
 *   - Kamino: USDC → deposit into PRIME lending market
 *   - Drift: USDC → deposit into Gauntlet RWA vault
 */

export interface FoundationVault {
  id: string;
  name: string;
  strategy: string;
  protocol: "solomon" | "kamino" | "drift";
  description: string;
  underlying: string;
  riskTier: "conservative" | "moderate" | "growth";
  apy: number;
  features: string[];
  howItWorks: string[];
  // On-chain addresses
  multisig: string; // Squads multisig vault address
  receiptMint: string; // fdnALPHA Token-2022 mint
  usdcAccount: string; // Vault's USDC token account
}

// These will be populated after Squads multisig + Token-2022 mint setup
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
    features: ["~12.5% target APY", "Delta-neutral strategy", "Managed by Foundation", "7-day unstake cooldown"],
    howItWorks: [
      "You deposit USDC into Foundation's Squads multisig vault",
      "Foundation swaps USDC → USDv via Jupiter aggregator",
      "USDv is staked into Solomon's program → receives sUSDV",
      "Yield accrues from basis trading (spot-long / perp-short)",
      "Your fdnALPHA balance grows via Token-2022 interest-bearing extension",
      "Withdraw anytime — Foundation unstakes and swaps back to USDC",
    ],
    multisig: "", // TODO: set after Squads setup
    receiptMint: "", // TODO: set after Token-2022 mint creation
    usdcAccount: "", // TODO: set after vault setup
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
    apy: 0, // filled from live data
    features: ["Institutional collateral", "$570M+ market", "No lockup", "Managed by Foundation"],
    howItWorks: [
      "You deposit USDC into Foundation's Squads multisig vault",
      "Foundation deposits USDC into Kamino's PRIME lending market",
      "USDC earns yield from PRIME borrowers (Figure home equity loans)",
      "Your fdnALPHA balance grows via Token-2022 interest-bearing extension",
      "Withdraw anytime — Foundation withdraws from Kamino and sends USDC back",
    ],
    multisig: "",
    receiptMint: "",
    usdcAccount: "",
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
    apy: 0, // filled from live data
    features: ["Gauntlet managed", "Levered RWA strategy", "Redemption period", "Managed by Foundation"],
    howItWorks: [
      "You deposit USDC into Foundation's Squads multisig vault",
      "Foundation deposits USDC into Gauntlet's levered RWA vault on Drift",
      "Vault manager loops sACRED collateral to amplify yield",
      "Your fdnALPHA balance grows via Token-2022 interest-bearing extension",
      "Withdraw anytime — Foundation requests Drift withdrawal (redemption period applies)",
    ],
    multisig: "",
    receiptMint: "",
    usdcAccount: "",
  },
];
