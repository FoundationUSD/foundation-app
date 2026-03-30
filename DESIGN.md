# Foundation App — Solana MVP Design Document

**Ship Date:** April 1, 2026 (5 days from now)
**Status:** Ready to build
**Author:** Vivek + Claude
**Scope:** Working production app — vault program, backend, frontend — deployed to Solana devnet (mainnet-ready)

---

## 1. What We're Building

A working RWA yield app on Solana where users connect their wallet, deposit USDC, receive fdnUSD vault tokens that accrue yield from off-chain credit funds, and can withdraw at any time from the liquidity buffer. Not a landing page. Not a points campaign. A real app with real on-chain mechanics.

### Core User Flow

```
User connects Phantom/Backpack
        ↓
Sees vault cards: fdnAPOLLO (8.77%), fdnBUILD (4.5%), fdnSCOPE (6.67%)
        ↓
Clicks "Deposit" → enters USDC amount
        ↓
Signs one transaction:
  • USDC transfers from wallet → vault buffer (on-chain)
  • fdnUSD shares minted to wallet (on-chain, Token-2022)
        ↓
Dashboard shows: position value, accrued yield, share price history
        ↓
Clicks "Withdraw" → burns shares → receives USDC from buffer (instant)
```

---

## 2. Architecture Decision: Simplified Vault Program

ADR-002 specifies 6 Anchor programs. For the 5-day MVP, we build **ONE program** (`fdn_vault`) that contains the critical path: deposit, withdraw, NAV update, pause. Everything else (router, registry, leverage, transfer hook) is deferred to v2.

### What's IN the MVP

| Feature | Description |
|---------|-------------|
| **Vault Program** | Single Anchor program: initialize, deposit, redeem, update_nav, pause |
| **Token-2022 Shares** | fdnUSD minted as Token-2022 with PDA mint authority |
| **Liquidity Buffer** | 15% target, 5% minimum, queue mode when depleted |
| **NAV Oracle** | Admin-only `update_nav()` instruction (no multi-operator consensus yet) |
| **Fee Logic** | Management fee (0.5% annual) + performance fee (10% above HWM) |
| **Pause** | Admin can pause deposits/withdrawals |
| **Frontend** | Next.js app with wallet adapter, deposit/withdraw, dashboard |
| **Backend API** | NAV update cron, vault analytics, user position tracking |

### What's DEFERRED to v2

| Feature | Why Deferred |
|---------|-------------|
| fdn_router | Direct vault interaction is fine for MVP |
| fdn_registry | Single vault doesn't need a registry |
| fdn_leverage | Kamino/Drift leverage integration is a partnership conversation |
| fdn_transfer_hook | 24h lockup enforcement — add after launch |
| Multi-operator NAV consensus | Single admin NAV update works for MVP, add 2-of-3 later |
| Redemption queue | Buffer handles instant withdrawals; queue mode just pauses |
| Rate limiter | Not needed at low TVL |

---

## 3. Tech Stack

```
┌─────────────────────────────────────────────────┐
│                   FRONTEND                       │
│  Next.js 14 (App Router) + TypeScript            │
│  @solana/wallet-adapter-react (Phantom/Backpack) │
│  @coral-xyz/anchor (IDL client)                  │
│  TailwindCSS + shadcn/ui                         │
│  Recharts (yield charts)                         │
└─────────────────┬───────────────────────────────┘
                  │ RPC + API calls
┌─────────────────▼───────────────────────────────┐
│                 SOLANA RPC                        │
│  Helius / Triton (mainnet)                       │
│  localhost:8899 (devnet/local)                   │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│              ANCHOR PROGRAM                      │
│  fdn_vault (Rust/Anchor 0.31+)                   │
│  • initialize  • deposit  • redeem              │
│  • update_nav  • harvest_fees  • pause          │
│  Token-2022 share mint (PDA authority)           │
│  USDC buffer + managed accounts (PDA authority)  │
└─────────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│              BACKEND / CRON                       │
│  Supabase (Postgres + Edge Functions)            │
│  • NAV history table                             │
│  • User position snapshots                       │
│  • Scheduled: daily NAV update tx                │
│  • Scheduled: fee harvest tx                     │
└─────────────────────────────────────────────────┘
```

---

## 4. Vault Program — Simplified for MVP

### 4.1 Account Structures

```rust
use anchor_lang::prelude::*;

declare_id!("FdnV...TODO");

#[program]
pub mod fdn_vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: InitParams) -> Result<()>;
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()>;
    pub fn redeem(ctx: Context<Redeem>, shares: u64) -> Result<()>;
    pub fn update_nav(ctx: Context<UpdateNav>, new_total_assets: u64) -> Result<()>;
    pub fn harvest_fees(ctx: Context<HarvestFees>) -> Result<()>;
    pub fn pause(ctx: Context<Pause>, paused: bool) -> Result<()>;
}

/// Core vault state — one per RWA asset
#[account]
#[derive(InitSpace)]
pub struct VaultState {
    // Identity
    pub admin: Pubkey,               // Squads multisig (upgradeable)
    pub asset_mint: Pubkey,          // USDC mint
    pub share_mint: Pubkey,          // Token-2022 fdnUSD mint (PDA)
    pub treasury: Pubkey,            // Fee destination

    // NAV
    pub total_assets: u64,           // Total USDC value (includes off-chain RWA)
    pub total_supply: u64,           // Total fdnUSD shares outstanding
    pub nav_per_share: u64,          // Cached: total_assets * 1e6 / total_supply
    pub last_nav_update: i64,        // Unix timestamp

    // Buffer
    pub buffer_target_bps: u16,      // 1500 = 15%
    pub buffer_balance: u64,         // USDC currently in buffer

    // Fees
    pub management_fee_bps: u16,     // 50 = 0.5% annual
    pub performance_fee_bps: u16,    // 1000 = 10%
    pub high_water_mark: u64,        // HWM for perf fee
    pub last_harvest: i64,

    // Deposit cap
    pub deposit_cap: u64,            // 0 = uncapped

    // Security
    pub paused: bool,

    // Vault name (for UI)
    pub vault_name: [u8; 32],

    // PDA bumps
    pub bump: u8,
    pub share_mint_bump: u8,
    pub vault_usdc_bump: u8,
    pub buffer_usdc_bump: u8,
    pub authority_bump: u8,
}
```

### 4.2 Instruction: `deposit`

```rust
pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault_state;
    let clock = Clock::get()?;

    // Guards
    require!(!vault.paused, VaultError::Paused);
    require!(clock.unix_timestamp - vault.last_nav_update < 86400, VaultError::StaleNav);
    require!(amount >= 1_000_000, VaultError::MinDeposit); // $1 min
    if vault.deposit_cap > 0 {
        require!(vault.total_assets + amount <= vault.deposit_cap, VaultError::CapExceeded);
    }

    // Calculate shares
    let shares = if vault.total_supply == 0 {
        amount // 1:1 for first deposit
    } else {
        (amount as u128)
            .checked_mul(vault.total_supply as u128).unwrap()
            .checked_div(vault.total_assets as u128).unwrap() as u64
    };
    require!(shares > 0, VaultError::ZeroShares);

    // All USDC goes to buffer in MVP (no managed account split needed yet)
    // CPI: Transfer USDC from user → buffer
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_usdc.to_account_info(),
                to: ctx.accounts.buffer_usdc.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount,
    )?;

    // CPI: Mint shares to user (Token-2022, PDA signs)
    let vault_key = vault.key();
    let seeds = &[b"vault_authority", vault_key.as_ref(), &[vault.authority_bump]];
    token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_2022_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.share_mint.to_account_info(),
                to: ctx.accounts.user_shares.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[seeds],
        ),
        shares,
    )?;

    // Update state
    vault.total_assets = vault.total_assets.checked_add(amount).unwrap();
    vault.total_supply = vault.total_supply.checked_add(shares).unwrap();
    vault.buffer_balance = vault.buffer_balance.checked_add(amount).unwrap();
    vault.nav_per_share = vault.total_assets
        .checked_mul(1_000_000).unwrap()
        .checked_div(vault.total_supply).unwrap();

    emit!(DepositEvent {
        vault: vault.key(),
        user: ctx.accounts.user.key(),
        assets: amount,
        shares,
        nav_per_share: vault.nav_per_share,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
```

### 4.3 Instruction: `redeem`

```rust
pub fn redeem(ctx: Context<Redeem>, shares: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault_state;
    let clock = Clock::get()?;

    require!(!vault.paused, VaultError::Paused);
    require!(shares > 0, VaultError::ZeroShares);

    // Calculate USDC owed
    let assets = (shares as u128)
        .checked_mul(vault.total_assets as u128).unwrap()
        .checked_div(vault.total_supply as u128).unwrap() as u64;

    // Check buffer has enough
    require!(vault.buffer_balance >= assets, VaultError::InsufficientBuffer);

    // CPI: Burn user's shares (Token-2022, user signs)
    token_2022::burn(
        CpiContext::new(
            ctx.accounts.token_2022_program.to_account_info(),
            Burn {
                mint: ctx.accounts.share_mint.to_account_info(),
                from: ctx.accounts.user_shares.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        shares,
    )?;

    // CPI: Transfer USDC from buffer → user (PDA signs)
    let vault_key = vault.key();
    let seeds = &[b"vault_authority", vault_key.as_ref(), &[vault.authority_bump]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.buffer_usdc.to_account_info(),
                to: ctx.accounts.user_usdc.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &[seeds],
        ),
        assets,
    )?;

    // Update state
    vault.total_assets = vault.total_assets.checked_sub(assets).unwrap();
    vault.total_supply = vault.total_supply.checked_sub(shares).unwrap();
    vault.buffer_balance = vault.buffer_balance.checked_sub(assets).unwrap();
    vault.nav_per_share = if vault.total_supply > 0 {
        vault.total_assets.checked_mul(1_000_000).unwrap()
            .checked_div(vault.total_supply).unwrap()
    } else { 1_000_000 };

    emit!(RedeemEvent {
        vault: vault.key(),
        user: ctx.accounts.user.key(),
        shares,
        assets,
        nav_per_share: vault.nav_per_share,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
```

### 4.4 Instruction: `update_nav`

This is the critical RWA piece — admin pushes the real-world NAV on-chain.

```rust
pub fn update_nav(ctx: Context<UpdateNav>, new_total_assets: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault_state;
    let clock = Clock::get()?;

    // Only admin can update NAV
    require!(ctx.accounts.admin.key() == vault.admin, VaultError::Unauthorized);

    // Sanity: NAV can't change more than 5% in a single update (safety circuit breaker)
    if vault.total_assets > 0 {
        let change_bps = if new_total_assets > vault.total_assets {
            ((new_total_assets - vault.total_assets) as u128)
                .checked_mul(10000).unwrap()
                .checked_div(vault.total_assets as u128).unwrap() as u16
        } else {
            ((vault.total_assets - new_total_assets) as u128)
                .checked_mul(10000).unwrap()
                .checked_div(vault.total_assets as u128).unwrap() as u16
        };
        require!(change_bps <= 500, VaultError::NavChangeExceedsLimit); // 5% max per update
    }

    let old_total_assets = vault.total_assets;

    // Update total_assets (includes: on-chain buffer + off-chain RWA value)
    vault.total_assets = new_total_assets;
    vault.last_nav_update = clock.unix_timestamp;

    // Recalculate share price
    vault.nav_per_share = if vault.total_supply > 0 {
        vault.total_assets.checked_mul(1_000_000).unwrap()
            .checked_div(vault.total_supply).unwrap()
    } else { 1_000_000 };

    // Update HWM if new ATH
    if vault.total_assets > vault.high_water_mark {
        vault.high_water_mark = vault.total_assets;
    }

    emit!(NavUpdateEvent {
        vault: vault.key(),
        old_total_assets,
        new_total_assets,
        nav_per_share: vault.nav_per_share,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
```

### 4.5 Instruction: `harvest_fees`

```rust
pub fn harvest_fees(ctx: Context<HarvestFees>) -> Result<()> {
    let vault = &mut ctx.accounts.vault_state;
    let clock = Clock::get()?;

    require!(ctx.accounts.admin.key() == vault.admin, VaultError::Unauthorized);

    let elapsed = (clock.unix_timestamp - vault.last_harvest) as u64;
    let seconds_per_year: u64 = 365 * 24 * 3600;

    // Management fee: annual rate prorated
    let mgmt_fee = vault.total_assets
        .checked_mul(vault.management_fee_bps as u64).unwrap()
        .checked_div(10000).unwrap()
        .checked_mul(elapsed).unwrap()
        .checked_div(seconds_per_year).unwrap();

    // Performance fee: 10% of gains above HWM
    let perf_fee = if vault.total_assets > vault.high_water_mark {
        (vault.total_assets - vault.high_water_mark)
            .checked_mul(vault.performance_fee_bps as u64).unwrap()
            .checked_div(10000).unwrap()
    } else { 0 };

    let total_fee = mgmt_fee + perf_fee;

    if total_fee > 0 {
        // Mint fee shares to treasury (dilutes existing holders proportionally)
        let fee_shares = (total_fee as u128)
            .checked_mul(vault.total_supply as u128).unwrap()
            .checked_div(vault.total_assets as u128).unwrap() as u64;

        let vault_key = vault.key();
        let seeds = &[b"vault_authority", vault_key.as_ref(), &[vault.authority_bump]];
        token_2022::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_2022_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    to: ctx.accounts.treasury_shares.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                &[seeds],
            ),
            fee_shares,
        )?;

        vault.total_supply = vault.total_supply.checked_add(fee_shares).unwrap();
    }

    vault.last_harvest = clock.unix_timestamp;
    vault.high_water_mark = vault.total_assets; // Reset HWM after perf fee

    emit!(HarvestEvent {
        vault: vault.key(),
        mgmt_fee,
        perf_fee,
        total_fee,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
```

---

## 5. Frontend — UI Design

### 5.1 Page Structure

```
/                     → Landing / marketing hero
/app                  → Main app dashboard (wallet required)
/app/vault/[id]       → Individual vault detail + deposit/withdraw
/app/portfolio        → User's positions across all vaults
```

### 5.2 Main Dashboard (`/app`)

```
┌──────────────────────────────────────────────────────────────────┐
│  🏛️ Foundation                        [Connect Wallet] [SOL: 2.3]│
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Total Value Locked: $2,450,000        Your Portfolio: $12,500   │
│  Protocol Yield: 8.2% avg              Your Yield: $47.23/day   │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐    │
│  │  fdnAPOLLO      │ │  fdnBUILD       │ │  fdnSCOPE       │    │
│  │  Apollo ACRED   │ │  BlackRock BUIDL│ │  Hamilton Lane  │    │
│  │                 │ │                 │ │                 │    │
│  │  APY: 8.77%     │ │  APY: 4.50%     │ │  APY: 6.67%     │    │
│  │  TVL: $1.2M     │ │  TVL: $800K     │ │  TVL: $450K     │    │
│  │  Share: $1.0234  │ │  Share: $1.0089  │ │  Share: $1.0156  │    │
│  │  Buffer: 14.2%  │ │  Buffer: 15.1%  │ │  Buffer: 12.8%  │    │
│  │                 │ │                 │ │                 │    │
│  │  [Deposit]      │ │  [Deposit]      │ │  [Deposit]      │    │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘    │
│                                                                  │
│  ── Share Price History ──────────────────────────────────────   │
│  [Line chart: fdnAPOLLO share price over time, 30d/90d/all]    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 5.3 Vault Detail Page (`/app/vault/[id]`)

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Back to Vaults                                                │
│                                                                  │
│  fdnAPOLLO — Apollo Diversified Credit (ACRED)                  │
│  Underlying: Apollo ACRED ($130.7M AUM)                         │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────── LEFT PANEL ───────────────────────┐            │
│  │                                                   │            │
│  │  Share Price:    $1.0234                          │            │
│  │  Total Assets:   $1,234,567                      │            │
│  │  Total Shares:   1,206,234                       │            │
│  │  Buffer:         $185,185 (15.0%)                │            │
│  │  APY (30d):      8.77%                           │            │
│  │  Last NAV:       2 hours ago                     │            │
│  │                                                   │            │
│  │  Fees:                                            │            │
│  │    Management:   0.50% annual                    │            │
│  │    Performance:  10% above HWM                   │            │
│  │                                                   │            │
│  │  Contract: FdnV...abc  [↗ Solscan]               │            │
│  │  Share Mint: FdnS...xyz [↗ Solscan]              │            │
│  │                                                   │            │
│  └───────────────────────────────────────────────────┘            │
│                                                                  │
│  ┌─────────────── RIGHT PANEL ──────────────────────┐            │
│  │                                                   │            │
│  │  [Deposit] [Withdraw]                             │            │
│  │                                                   │            │
│  │  ┌─────────────────────────────────────────────┐  │            │
│  │  │  Amount: [___________] USDC                 │  │            │
│  │  │  Balance: 5,000.00 USDC     [MAX]          │  │            │
│  │  │                                             │  │            │
│  │  │  You receive: ~4,885.5 fdnAPOLLO shares    │  │            │
│  │  │  Share price: $1.0234                       │  │            │
│  │  │                                             │  │            │
│  │  │  [ Deposit USDC → fdnAPOLLO ]              │  │            │
│  │  └─────────────────────────────────────────────┘  │            │
│  │                                                   │            │
│  │  Your Position:                                   │            │
│  │    Shares:    2,450.00 fdnAPOLLO                 │            │
│  │    Value:     $2,507.33                           │            │
│  │    Cost Basis: $2,450.00                          │            │
│  │    P&L:       +$57.33 (+2.34%)                   │            │
│  │                                                   │            │
│  └───────────────────────────────────────────────────┘            │
│                                                                  │
│  ── Share Price Chart ────────────────────────────────            │
│  [Recharts line graph, y-axis: share price, x-axis: date]       │
│                                                                  │
│  ── Transaction History ──────────────────────────────           │
│  | Type    | Amount     | Shares  | Price   | Date       |      │
│  | Deposit | 1,000 USDC | 980.3   | $1.0201 | Mar 25     |      │
│  | Deposit | 1,450 USDC | 1,469.7 | $1.0171 | Mar 20     |      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 5.4 Key UI Components

```
src/
├── app/
│   ├── layout.tsx              # WalletProvider, theme, nav
│   ├── page.tsx                # Landing hero
│   └── app/
│       ├── layout.tsx          # App shell (sidebar, wallet required)
│       ├── page.tsx            # Dashboard with vault cards
│       ├── vault/
│       │   └── [address]/
│       │       └── page.tsx    # Vault detail + deposit/withdraw
│       └── portfolio/
│           └── page.tsx        # User positions
├── components/
│   ├── VaultCard.tsx           # Vault summary card
│   ├── DepositForm.tsx         # USDC amount input, calculate shares, submit tx
│   ├── WithdrawForm.tsx        # Share amount input, calculate USDC, submit tx
│   ├── SharePriceChart.tsx     # Recharts line chart
│   ├── PositionSummary.tsx     # User's position in a vault
│   ├── ProtocolStats.tsx       # TVL, yield, buffer stats
│   └── TransactionHistory.tsx  # On-chain tx history for user
├── hooks/
│   ├── useVault.ts             # Read vault state from on-chain
│   ├── useDeposit.ts           # Build + send deposit tx
│   ├── useRedeem.ts            # Build + send redeem tx
│   ├── useUserPosition.ts      # Read user's share balance + value
│   └── useNavHistory.ts        # Fetch NAV history from Supabase
├── lib/
│   ├── idl/                    # Generated Anchor IDL
│   │   └── fdn_vault.json
│   ├── program.ts              # Anchor program instance
│   ├── constants.ts            # Program ID, vault addresses, USDC mint
│   └── supabase.ts             # Supabase client for historical data
└── types/
    └── vault.ts                # TypeScript types from IDL
```

---

## 6. Backend — Supabase

### 6.1 Database Schema

```sql
-- Vault metadata (denormalized from on-chain for fast reads)
CREATE TABLE vaults (
  address TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  underlying TEXT NOT NULL,          -- "Apollo ACRED"
  share_mint TEXT NOT NULL,
  total_assets BIGINT NOT NULL,
  total_supply BIGINT NOT NULL,
  nav_per_share BIGINT NOT NULL,
  buffer_balance BIGINT NOT NULL,
  buffer_target_bps INT NOT NULL,
  apy_30d NUMERIC,
  apy_inception NUMERIC,
  last_nav_update TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- NAV history (for charts)
CREATE TABLE nav_history (
  id BIGSERIAL PRIMARY KEY,
  vault_address TEXT NOT NULL REFERENCES vaults(address),
  total_assets BIGINT NOT NULL,
  nav_per_share BIGINT NOT NULL,     -- 6 decimal fixed point (1000000 = $1.00)
  total_supply BIGINT NOT NULL,
  buffer_balance BIGINT NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_nav_history_vault_time ON nav_history(vault_address, recorded_at DESC);

-- User positions (snapshot from on-chain, for fast portfolio reads)
CREATE TABLE user_positions (
  wallet TEXT NOT NULL,
  vault_address TEXT NOT NULL REFERENCES vaults(address),
  shares BIGINT NOT NULL,
  cost_basis BIGINT NOT NULL,        -- Total USDC deposited
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (wallet, vault_address)
);

-- Transaction log (indexed from on-chain events)
CREATE TABLE transactions (
  signature TEXT PRIMARY KEY,
  vault_address TEXT NOT NULL REFERENCES vaults(address),
  wallet TEXT NOT NULL,
  tx_type TEXT NOT NULL,             -- 'deposit' | 'redeem' | 'nav_update'
  assets BIGINT,
  shares BIGINT,
  nav_per_share BIGINT,
  timestamp TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_tx_wallet ON transactions(wallet, timestamp DESC);
```

### 6.2 Edge Functions

```
supabase/functions/
├── sync-vault-state/         # Cron: reads on-chain vault state → updates vaults table
│   └── index.ts              # Runs every 5 minutes
├── sync-nav-history/         # Cron: snapshots NAV → nav_history
│   └── index.ts              # Runs every hour
├── index-events/             # Webhook: Helius webhook pushes program events → transactions table
│   └── index.ts              # Real-time on deposit/redeem/nav_update events
└── submit-nav-update/        # Admin: accepts NAV value, builds + submits update_nav tx
    └── index.ts              # Called by admin dashboard or cron
```

### 6.3 Helius Webhook Integration

```typescript
// Register webhook for fdn_vault program events
const webhook = await helius.createWebhook({
  webhookURL: `${SUPABASE_URL}/functions/v1/index-events`,
  transactionTypes: ["Any"],
  accountAddresses: [VAULT_STATE_ADDRESS],
  webhookType: "enhanced",
});

// index-events handler
export default async function handler(req: Request) {
  const events = await req.json();
  for (const event of events) {
    // Parse Anchor event discriminator
    if (event.type === "DEPOSIT") {
      await supabase.from('transactions').insert({
        signature: event.signature,
        vault_address: event.accountData.vault,
        wallet: event.accountData.user,
        tx_type: 'deposit',
        assets: event.accountData.assets,
        shares: event.accountData.shares,
        nav_per_share: event.accountData.navPerShare,
        timestamp: new Date(event.timestamp * 1000),
      });
    }
  }
}
```

---

## 7. Anchor Client Hooks (Frontend → On-Chain)

### 7.1 useDeposit

```typescript
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getAssociatedTokenAddress } from "@solana/spl-token";

export function useDeposit(vaultAddress: PublicKey) {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();

  const deposit = async (usdcAmount: number) => {
    if (!wallet) throw new Error("Wallet not connected");

    const provider = new AnchorProvider(connection, wallet, {});
    const program = new Program(IDL, PROGRAM_ID, provider);

    // Derive PDAs
    const [vaultState] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), USDC_MINT.toBuffer()],
      PROGRAM_ID
    );
    const [shareMint] = PublicKey.findProgramAddressSync(
      [Buffer.from("share_mint"), vaultState.toBuffer()],
      PROGRAM_ID
    );
    const [bufferUsdc] = PublicKey.findProgramAddressSync(
      [Buffer.from("buffer_usdc"), vaultState.toBuffer()],
      PROGRAM_ID
    );
    const [vaultAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault_authority"), vaultState.toBuffer()],
      PROGRAM_ID
    );

    // Get/create user token accounts
    const userUsdc = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
    const userShares = await getAssociatedTokenAddress(
      shareMint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID
    );

    // Build + send tx
    const tx = await program.methods
      .deposit(new BN(usdcAmount * 1_000_000)) // 6 decimals
      .accounts({
        user: wallet.publicKey,
        vaultState,
        userUsdc,
        userShares,
        bufferUsdc,
        shareMint,
        vaultAuthority,
        tokenProgram: TOKEN_PROGRAM_ID,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  };

  return { deposit };
}
```

### 7.2 useVault (Read State)

```typescript
export function useVault(vaultAddress: PublicKey) {
  const { connection } = useConnection();
  const [vault, setVault] = useState<VaultState | null>(null);

  useEffect(() => {
    const fetchVault = async () => {
      const provider = new AnchorProvider(connection, {} as any, {});
      const program = new Program(IDL, PROGRAM_ID, provider);
      const state = await program.account.vaultState.fetch(vaultAddress);

      setVault({
        totalAssets: state.totalAssets.toNumber(),
        totalSupply: state.totalSupply.toNumber(),
        navPerShare: state.navPerShare.toNumber() / 1_000_000,
        bufferBalance: state.bufferBalance.toNumber(),
        bufferTargetBps: state.bufferTargetBps,
        paused: state.paused,
        lastNavUpdate: state.lastNavUpdate.toNumber(),
        managementFeeBps: state.managementFeeBps,
        performanceFeeBps: state.performanceFeeBps,
        vaultName: new TextDecoder().decode(
          new Uint8Array(state.vaultName).filter(b => b !== 0)
        ),
      });
    };

    fetchVault();
    const interval = setInterval(fetchVault, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [vaultAddress, connection]);

  return vault;
}
```

---

## 8. Project Structure

```
foundation-app/
├── DESIGN.md                           # This document
├── programs/
│   └── fdn-vault/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                  # Program entry point
│           ├── state.rs                # VaultState, events, errors
│           ├── instructions/
│           │   ├── mod.rs
│           │   ├── initialize.rs       # Create vault
│           │   ├── deposit.rs          # USDC → shares
│           │   ├── redeem.rs           # Shares → USDC
│           │   ├── update_nav.rs       # Admin NAV update
│           │   ├── harvest_fees.rs     # Fee collection
│           │   └── pause.rs            # Emergency pause
│           └── errors.rs               # Custom error codes
├── tests/
│   ├── fdn-vault.ts                    # Anchor integration tests
│   └── utils.ts                        # Test helpers
├── app/                                # Next.js frontend
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                # Landing
│   │   │   └── app/
│   │   │       ├── layout.tsx          # App shell
│   │   │       ├── page.tsx            # Dashboard
│   │   │       ├── vault/
│   │   │       │   └── [address]/
│   │   │       │       └── page.tsx    # Vault detail
│   │   │       └── portfolio/
│   │   │           └── page.tsx        # Portfolio
│   │   ├── components/
│   │   │   ├── VaultCard.tsx
│   │   │   ├── DepositForm.tsx
│   │   │   ├── WithdrawForm.tsx
│   │   │   ├── SharePriceChart.tsx
│   │   │   ├── PositionSummary.tsx
│   │   │   ├── ProtocolStats.tsx
│   │   │   ├── TransactionHistory.tsx
│   │   │   └── ui/                     # shadcn components
│   │   ├── hooks/
│   │   │   ├── useVault.ts
│   │   │   ├── useDeposit.ts
│   │   │   ├── useRedeem.ts
│   │   │   ├── useUserPosition.ts
│   │   │   └── useNavHistory.ts
│   │   ├── lib/
│   │   │   ├── idl/
│   │   │   │   └── fdn_vault.json
│   │   │   ├── program.ts
│   │   │   ├── constants.ts
│   │   │   └── supabase.ts
│   │   └── types/
│   │       └── vault.ts
│   └── public/
│       └── assets/                     # Logos, vault icons
├── supabase/
│   ├── migrations/
│   │   └── 001_initial.sql             # Schema above
│   └── functions/
│       ├── sync-vault-state/
│       │   └── index.ts
│       ├── sync-nav-history/
│       │   └── index.ts
│       ├── index-events/
│       │   └── index.ts
│       └── submit-nav-update/
│           └── index.ts
├── scripts/
│   ├── deploy.ts                       # Deploy program to devnet/mainnet
│   ├── initialize-vault.ts             # Create vault instances
│   ├── update-nav.ts                   # Manual NAV update script
│   └── seed-devnet.ts                  # Seed devnet with test data
├── Anchor.toml
├── Cargo.toml
├── package.json
└── .env.example
```

---

## 9. Five-Day Build Plan

### Day 1 (Thursday Mar 27) — Vault Program

| Task | Hours | Output |
|------|-------|--------|
| Scaffold Anchor project | 0.5 | `Anchor.toml`, `Cargo.toml`, program skeleton |
| Implement `state.rs` | 1 | VaultState, events, errors |
| Implement `initialize.rs` | 1.5 | Create vault, share mint (Token-2022), buffer accounts |
| Implement `deposit.rs` | 2 | USDC → buffer, mint shares, update state |
| Implement `redeem.rs` | 1.5 | Burn shares, buffer → USDC, update state |
| Implement `update_nav.rs` | 1 | Admin NAV update with 5% circuit breaker |
| Implement `harvest_fees.rs` | 1 | Management + performance fee minting |
| Implement `pause.rs` | 0.5 | Toggle pause flag |
| **Total** | **9.5h** | **Complete vault program** |

### Day 2 (Friday Mar 28) — Tests + Deploy + Supabase

| Task | Hours | Output |
|------|-------|--------|
| Write Anchor tests (deposit, redeem, nav, fees) | 3 | Full test suite passing |
| Deploy to devnet | 1 | Program live on devnet |
| Initialize test vaults (fdnAPOLLO, fdnBUILD, fdnSCOPE) | 0.5 | 3 vault instances |
| Set up Supabase project + schema | 1 | Tables created |
| Build `sync-vault-state` edge function | 1 | Cron reads on-chain → DB |
| Build `index-events` edge function | 1.5 | Helius webhook → transactions |
| Seed devnet with test deposits + NAV updates | 1 | Historical data for charts |
| **Total** | **9h** | **Backend complete, program on devnet** |

### Day 3 (Saturday Mar 29) — Frontend Core

| Task | Hours | Output |
|------|-------|--------|
| Scaffold Next.js + wallet adapter + Anchor IDL | 1.5 | App boots, wallet connects |
| Build VaultCard component | 1 | Reads on-chain vault state |
| Build Dashboard page (vault cards grid + stats) | 2 | Main dashboard working |
| Build DepositForm (amount input, share preview, tx) | 2.5 | Deposits work end-to-end |
| Build WithdrawForm (share input, USDC preview, tx) | 2 | Withdrawals work end-to-end |
| Build Vault detail page layout | 1 | Page structure + routing |
| **Total** | **10h** | **Core app functional** |

### Day 4 (Sunday Mar 30) — Frontend Polish + Charts

| Task | Hours | Output |
|------|-------|--------|
| Build SharePriceChart (Recharts + Supabase data) | 2 | Line chart with 30d/90d/all toggle |
| Build PositionSummary (shares, value, P&L) | 1.5 | User portfolio view |
| Build TransactionHistory (from Supabase) | 1.5 | Table of user deposits/withdrawals |
| Build Portfolio page (all positions) | 1.5 | Portfolio overview |
| UI polish: loading states, error handling, toasts | 2 | Production-quality UX |
| Mobile responsive pass | 1 | Works on phone |
| **Total** | **9.5h** | **Complete, polished UI** |

### Day 5 (Monday Mar 31) — Deploy + Launch

| Task | Hours | Output |
|------|-------|--------|
| Deploy frontend to Vercel | 0.5 | app.fdnusd.com live |
| Configure custom domain + SSL | 0.5 | |
| Write deployment script for mainnet | 1 | Ready for mainnet deploy |
| End-to-end testing on devnet | 2 | All flows verified |
| Create 3 test vaults with real parameters | 1 | fdnAPOLLO, fdnBUILD, fdnSCOPE |
| Transfer vault admin to Squads multisig | 1 | Production security |
| Screenshot + record demo | 1 | Marketing assets |
| Write launch tweet thread | 1 | Announcement ready |
| **Total** | **8h** | **Shipped.** |

---

## 10. Configuration

### 10.1 Environment Variables

```env
# .env.example

# Solana
SOLANA_RPC_URL=https://rpc.helius.xyz/?api-key=YOUR_KEY
SOLANA_NETWORK=devnet  # or mainnet-beta
ADMIN_KEYPAIR_PATH=./keys/admin.json

# Program
PROGRAM_ID=FdnV...TODO
USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# Vault Addresses (set after initialization)
VAULT_APOLLO=...
VAULT_BUILD=...
VAULT_SCOPE=...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Helius (webhooks + enhanced RPC)
HELIUS_API_KEY=xxx
HELIUS_WEBHOOK_SECRET=xxx

# Frontend
NEXT_PUBLIC_SOLANA_RPC_URL=https://rpc.helius.xyz/?api-key=YOUR_KEY
NEXT_PUBLIC_PROGRAM_ID=FdnV...TODO
NEXT_PUBLIC_NETWORK=devnet
```

### 10.2 Vault Initialization Parameters

```typescript
// scripts/initialize-vault.ts
const VAULTS = [
  {
    name: "fdnAPOLLO",
    underlying: "Apollo Diversified Credit (ACRED)",
    params: {
      vaultName: padTo32Bytes("fdnAPOLLO"),
      bufferTargetBps: 1500,       // 15%
      managementFeeBps: 50,        // 0.5%
      performanceFeeBps: 1000,     // 10%
      depositCap: 50_000_000_000000, // $50M
    },
  },
  {
    name: "fdnBUILD",
    underlying: "BlackRock USD Institutional (BUIDL)",
    params: {
      vaultName: padTo32Bytes("fdnBUILD"),
      bufferTargetBps: 2000,       // 20% (T-bills are very liquid)
      managementFeeBps: 30,        // 0.3%
      performanceFeeBps: 0,        // No perf fee on T-bills
      depositCap: 100_000_000_000000, // $100M
    },
  },
  {
    name: "fdnSCOPE",
    underlying: "Hamilton Lane SCOPE (Private Credit)",
    params: {
      vaultName: padTo32Bytes("fdnSCOPE"),
      bufferTargetBps: 1500,       // 15%
      managementFeeBps: 75,        // 0.75%
      performanceFeeBps: 1500,     // 15%
      depositCap: 20_000_000_000000, // $20M
    },
  },
];
```

---

## 11. Security Considerations (MVP)

| Risk | Mitigation |
|------|-----------|
| Admin key compromise | Transfer to Squads 3-of-5 multisig on Day 5 |
| NAV manipulation | 5% max change per update, circuit breaker auto-pauses |
| Buffer drain | `redeem` fails if buffer insufficient (no silent IOU) |
| Stale NAV | Deposit/redeem require NAV updated within 24h |
| Share price manipulation | Invariant checks: asset conservation, share proportionality |
| Token-2022 edge cases | Use Anchor's `InterfaceAccount` for proper deserialization |
| Front-running deposits before NAV update | NAV staleness check makes this a non-issue (price already set) |

---

## 12. Post-MVP Roadmap

### Week 2 — Integrations
- List fdnUSD on Meteora DLMM pool (fdnUSD/USDC) → Jupiter picks it up
- Kamino integration: fdnUSD as lendable collateral
- Perena Growth Pool application
- Pyth oracle feed for fdnUSD share price

### Week 3 — Program V2
- Add fdn_transfer_hook (24h lockup enforcement)
- Multi-operator NAV consensus (2-of-3)
- Redemption queue (for when buffer is depleted)
- Rate limiter

### Week 4 — Squads Multisig Admin Dashboard
- All admin ops via Squads proposals
- Auto NAV updates via Clockwork keeper
- Watchtower bot (3 independent pause authorities)

### Month 2 — DeFi Composability
- fdn_leverage (Kamino/Drift leverage on fdnUSD)
- fdn_router (multi-vault deposits, auto-allocation)
- fdn_registry (vault discovery, TVL caps)
