# Foundation

Foundation builds the definitive instruments to capture yield from the trillion-dollar AI infrastructure expansion. Where everyone else trades the equity side (NVIDIA, Microsoft, TSMC), Foundation makes the **financing side** investable, GPU-backed credit, datacenter debt, neocloud lending, all wrapped into a single composable USDC vault on Solana.

- **App:** [demo.fdnusd.com](https://demo.fdnusd.com)
- **Landing:** [fdnusd.com](https://fdnusd.com)

---

## Why this exists

AI demand is pulling capital into the physical world faster than the existing financing system can keep up. Frontier labs need GPUs. Datacenters need land, power, cooling. Neoclouds need working capital. Hyperscaler bonds yield ~5% — the operators below them rely on private credit at **15–25%**. That market has been institution-only.

Foundation is the index and fund layer that opens it to crypto-native capital:

- **FCY (Foundation Compute Yield Index)** — a rules-based, on-chain benchmark for AI infrastructure debt. Constituents include GAIB and USD.AI as the first two on-chain compute-credit protocols.
- **FCY Vault** — the first fund tracking the index. Deposit USDC, hold an appreciating Token-2022 receipt (`fcyUSD`), get composable exposure to AI infrastructure yield.
- **AWY (All-Weather Yield)** — Foundation's live, production vault and the proven architecture template. Four-leg basket across OnRe ONyc, Kamino-PRIME, Kamino-Syrup (Maple proxy), and Solomon USDv. AWY proves the vault architecture works; FCY applies it to a much larger thesis.

The vault architecture is the same across products: Squads v4 multisig custody, Token-2022 receipt with InterestBearing extension, atomic delegate-burn withdraws, async OnRe redemption queue for non-instant constituents.

---

## Live products

| Product                     | Status                         | Receipt token                          | Target APY    | Custody            |
| --------------------------- | ------------------------------ | -------------------------------------- | ------------- | ------------------ |
| **AWY** (All-Weather Yield) | Live on Solana mainnet         | `awyUSD` (Token-2022, InterestBearing) | ~8% blended   | Squads v4 multisig |
| **AWY 2x**                  | Live, hidden from UI           | `awy2xUSD`                             | ~14%          | Squads v4 multisig |
| **AWY 3x**                  | Live, hidden from UI           | `awy3xUSD`                             | ~21%          | Squads v4 multisig |
| **FCY** (Compute Yield)     | Waitlist, launching post-audit | `fcyUSD`                               | 12–18% target | Squads v4 multisig |

AWY routes USDC across four risk-uncorrelated legs at fixed target weights:

- **35% ONyc** — OnRe reinsurance receipt, minted at NAV via OnRe's permissionless program
- **25% Kamino-PRIME** — USDC supply on Kamino's Figure-PRIME RWA market
- **20% Kamino-Syrup** — USDC supply on Kamino's main lending market (Maple `syrupUSDC` proxy)
- **20% Solomon USDv** — delta-neutral basis trade, swap via Jupiter

Withdraw is a single atomic Squads transaction: burn receipt via delegate, unwind protocol positions as needed, transfer USDC back. If the request exceeds idle + sync-recoverable capacity, the residual queues an OnRe redemption — fulfilled in 24–72h.

The levered tiers (2x / 3x) apply real on-chain leverage via iterated Kamino borrow loops on the PRIME and Syrup slices — no flash loans, no mocks, just multiple Squads transactions converging to the target LTV.

---

## Architecture

**Custody**: Each vault is a Squads v4 multisig. The multisig PDA holds USDC, receipt mint authority, and all protocol position state (Kamino obligations, OnRe redemptions, Solomon perp accounts). Every redeploy, rebalance, and redemption is a multisig-executed Anchor instruction.

**Receipt token**: Token-2022 mint with the `InterestBearing` extension. APY accrues continuously on-chain at a rate set by the rate-updater keeper. No rebase, no checkpoints — users hold an appreciating SPL token that any other Solana program can read.

**Strategy routing**: Each vault has a strategy module under `src/lib/deploy-capital.ts` that splits incoming USDC across protocol legs at target weights. Deposits route via Anchor CPI (OnRe, Solomon) or Kamino's REST API (PRIME, Syrup). Failed legs leave funds idle for the sweep keeper to retry.

**Atomic withdraw**: User pays a 0.005 SOL protocol fee + grants the vault PDA delegate authority over their receipt-token ATA. Server then runs a single Squads transaction: `[burn via delegate, unwind protocol positions, transfer USDC]`. Either succeeds end-to-end or reverts. Async-only paths (OnRe redemption) queue an on-chain request; the user comes back when liquidity materialises.

**Off-chain ledger**: Supabase Postgres tracks deposits, withdrawals, and pending redemptions. Source of truth for user entitlement; the on-chain receipt-token balance is the source of truth for what can actually be burned. Drift between the two surfaces honestly in the withdraw UI (recovery flow when on-chain < ledger).

**Index methodology**: Defined under `src/lib/integrations/awy/` (AWY) and `src/lib/integrations/compute/` (FCY). Each leg has its own module with live APY fetch, deposit/withdraw orchestration, and stress-test fallbacks. Constituent weights and leverage tiers live in `src/lib/integrations/awy/leverage.ts`.

---

## Getting started

### Prerequisites

- **Bun** ≥ 1.1 (`curl -fsSL https://bun.sh/install | bash`)
- **Node** ≥ 20 (Next.js 16 requires it)
- **Rust + Anchor** if you want to build/test the Solana programs (Anchor 0.31+, Solana CLI 1.18+)
- **Foundry** if you want to build/test the Solidity SPC vault
- A Solana RPC URL (Helius, Triton, or `https://api.mainnet-beta.solana.com` for read-only)

### Install

```bash
git clone https://github.com/foundationusd/foundation-app
cd foundation-app
bun install
```

### Environment

Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SOLANA_RPC_URL=...        # Public RPC for client reads
SOLANA_RPC_URL=...                    # Private RPC for server writes
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
VAULT_AUTHORITY_SECRET=...            # bs58 keypair that executes Squads txs
RESEND_API_KEY=...                    # OTP + transactional email

# Per-vault: PDA, multisig, USDC ATA, receipt mint
NEXT_PUBLIC_AWY_VAULT_PDA=...
NEXT_PUBLIC_AWY_MINT=...
VAULT_AWY_MULTISIG=...
# ... see .env.example for the full list
```

### Run the web app

```bash
bun dev                # http://localhost:3000
```

The Next.js app reads on-chain state directly from RPC and the off-chain ledger from Supabase. No backend server is required separately — API routes (`/api/deposit`, `/api/withdraw`, `/api/strategies`, etc.) run inside Next.

### Build the Anchor programs

```bash
cd programs
anchor build
anchor test --skip-deploy        # local unit tests
```

Program IDs are pinned in `Anchor.toml`. The web app reads IDLs from `programs/target/idl/`.

### Build the SPC contract

```bash
cd contracts
forge build
forge test
```

### Run keepers locally

```bash
cd keepers/nav-keeper
bun run dev
```

Each keeper has its own README under `keepers/*/README.md` covering its responsibility and trigger schedule.

---

## How the code is organised

### Next.js app (`src/`)

- **`src/app/awy/`** — AWY product page. Deposit, withdraw, composition breakdown.
- **`src/app/compute/`** — FCY waitlist + index thesis page.
- **`src/app/portfolio/`** — User's positions across all Foundation vaults.
- **`src/app/transparency/`** — Public dashboard: NAV history, TVL, position breakdown.
- **`src/app/api/`** — Server routes:
  - `deposit/route.ts` — atomic deposit (route capital, mint receipt)
  - `withdraw/route.ts` — atomic withdraw (verify fee tx, burn, unwind, transfer)
  - `strategies/route.ts` — live APY per vault
  - `cron/update-rate/route.ts` — pushes Token-2022 interest rate per vault
  - `cron/sweep-idle/route.ts` — redeploys stuck idle USDC
  - `user/portfolio/route.ts` — per-wallet entitlement + max-withdrawable
- **`src/lib/integrations/`** — protocol adapters (Kamino, OnRe, Solomon, Jupiter, AWY composer, Kamino-loop)
- **`src/lib/solana/squads.ts`** — Squads v4 vault transaction execution
- **`src/lib/deploy-capital.ts`** — capital routing and unwind orchestration

### Anchor programs (`programs/`)

- **`fdn_vault_compute`** — vault execution: deposit, redeem, rebalance, NAV publish. Spec: `dataroom/solana/ADR-004-vault-architecture.md`.
- **`fdn_transfer_hook`** — 24h transfer lockup on freshly minted receipt tokens (anti-flash-loan).

### Solidity contracts (`contracts/`)

- **`FdnSpcVault.sol`** — Cayman SPC vault primitive. Bridge target for cross-chain RWA deposits.

### SDK (`sdk/`)

- **`@foundation/sdk`** — typed client wrapping the Anchor programs and on-chain reads. Used by the Next app, keepers, and integration tests.

### Keepers (`keepers/`)

- **`nav-keeper`** — publishes NAV + APY snapshots every N minutes; drives the on-chain InterestBearing rate.
- **`queue-keeper`** — watches OnRe redemption fulfilments; sweeps proceeds back to the vault USDC ATA.
- **`batch-keeper`** — periodic rebalance back to target weights when drift exceeds threshold.
- **`monitor`** — health checks; pages on stale NAV, low authority SOL, or stuck redemptions.

---

## Testing

```bash
# Unit tests (lib/)
bun test

# Anchor program tests
cd programs && anchor test --skip-deploy

# Foundry contract tests
cd contracts && forge test

# Smoke test the deployed vault end-to-end (mainnet, costs ~$0.50 in gas)
bun run test:deployment
```

CI runs all four on every PR. The smoke test deploys $1 USDC into AWY, asserts the receipt token is minted, then withdraws and asserts the proceeds match (modulo Jupiter slippage).

---

## Deployment

The Next.js app deploys to Fly.io (`fly.toml`). Secrets are managed via `fly secrets set`; never commit to `.env.local`.

```bash
fly deploy -a foundation-app
```

Anchor programs deploy via `anchor deploy --provider.cluster mainnet`. Program upgrades require the Squads multisig that owns the upgrade authority — Foundation never holds it directly. Three of the six on-chain programs are **immutable** (upgrade authority revoked); the other three are upgradable behind a 7-day timelock.

---

## Security

- **Custody**: Squads v4 multisig (3-of-5) holds every vault. No single key can move funds. Threshold and signer set are public on-chain.
- **Immutable programs**: `fdn_transfer_hook` is upgrade-revoked. `fdn_vault_compute` upgrades behind a Squads timelock.
- **Bug bounty**: Reach Eugene (eugene@fdnusd.com) for now; formal program post-FCY launch.

---

## Contributing

Foundation is currently a closed three-person team (CEO, CTO, growth). External contributions go through GitHub PRs against `main`:

1. Fork, branch off `main`, keep changes scoped.
2. Run `bun lint && bun x tsc --noEmit` before pushing.
3. Reference the relevant ADR in `dataroom/` when proposing protocol-level changes.
4. PR description should answer: **what user-visible behaviour changes, and what could it break?**

---

## Links

- **Deck**: [deck.fdnusd.com](https://deck.fdnusd.com)
- **App**: [demo.fdnusd.com](https://demo.fdnusd.com)
- **Landing**: [fdnusd.com](https://fdnusd.com)
- **Telegram**: [t.me/fdnusd](https://t.me/fdnusd)
- **X**: [x.com/fdn_labs](https://x.com/fdn_labs)

---

## License

The Anchor programs and SPC contract are released under Apache 2.0 (see `programs/LICENSE` and `contracts/LICENSE`). The Next.js app and SDK remain proprietary while in private alpha; ask before reusing material beyond the on-chain layer.
