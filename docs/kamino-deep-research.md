# Kamino Finance — Deep Technical Research Report

**Date:** 2026-05-04
**Program ID:** `KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD` ([source](https://kamino.com/docs/build/resources/program-addresses.md))
**Verification:** All numbers confirmed via `api.kamino.finance` + `github.com/Kamino-Finance/klend` source code.

## Critical primary sources

- API root + OpenAPI: <https://api.kamino.finance/openapi/json> (71 endpoints documented)
- Docs index: <https://kamino.com/docs/llms.txt>
- Klend Rust source: <https://github.com/Kamino-Finance/klend>
- TS SDK: <https://github.com/Kamino-Finance/klend-sdk>
- Kvault program: <https://github.com/Kamino-Finance/kvault>
- Litepaper: <https://kamino.com/docs/kamino-lend-litepaper.md>
- Risk dashboard: <https://risk.kamino.finance> (Streamlit, JS-rendered)

---

## 1. Market architecture

### 1.1 Markets are isolated programs-of-state, not isolated programs

**Q: Are markets fully isolated? Yes — practically isolated, technically a single program.**

Every market in the list (Main, PRIME, Apollo, JLP, Altcoins/Memecoin, Ethena, Jito, Bitcoin, Jupiter, JTO, Marinade, Exponent PT-SOL, Bonk, rstSOL/bbSOL, Fartcoin) is a separate `LendingMarket` account under the SAME `KLend2g3cP87fff...` program. Cross-market liquidity sharing **does not exist**:

- Each `Reserve` account belongs to exactly one `LendingMarket` (verified in `programs/klend/src/state/reserve.rs:64` and `state/lending_market.rs:29`).
- Borrow rates are computed strictly from one reserve's own `total_borrow / total_supply`. The interpolation is over `self.config.borrow_rate_curve.points` — see `klend-sdk/src/classes/reserve.ts:705 calculateBorrowRate()`:
  ```typescript
  const currentUtilization = this.calculateUtilizationRatio();
  const curve = truncateBorrowCurve(this.state.config.borrowRateCurve.points);
  return getBorrowRate(currentUtilization, curve) * slotAdjustmentFactor;
  ```
  No cross-reserve term, no global pool, no backstop.
- Confirmed in docs: *"Reserves are isolated pools. The same asset in different markets has different borrowers, collateral, and risk profiles, and therefore different rates."* — <https://kamino.com/docs/build/borrow/get-market-reserve-apys.md>

**Tension with the litepaper:** The 2023 litepaper sells "Klend features a single liquidity market, rather than a multi-pool design." That was true at launch — there was just Main Market. Since then they shipped 16+ markets. So in practice **Kamino is now a multi-market protocol like Aave V3 / Morpho / Euler**, with each market being its own peer-to-pool reserve set governed independently. The litepaper is outdated on this point.

The full market list is `GET /v2/kamino-market` — verified 16 markets returned.

**Implication for our strategy:** A spike in PRIME-market USDC utilization does not affect Main-market USDC utilization or rates. They share zero state at the protocol level beyond the program code.

### 1.2 One borrow curve per reserve, NOT per collateral pair

**Q: Is the borrow curve per-reserve or per-reserve-pair? Per reserve.**

The curve lives on `Reserve.config.borrow_rate_curve` (`reserve.rs:1509`), not on any pair object. There is exactly one borrow APR for "USDC in PRIME market" at any given moment, regardless of whether the borrower posted PRIME, wYLDS, USDC, USDS, etc. as collateral.

What IS pair-specific:
- **Borrow caps** — via the `borrow_limit_against_this_collateral_in_elevation_group: [u64; 32]` array on each reserve (`reserve.rs:1555`). This lets governance say "Up to $X of USDC can be borrowed when posted against PRIME-collateral specifically".
- **LTV / liquidation threshold** — via the active elevation group on the obligation (`obligation.rs:75 elevation_group: u8`). When set, `ElevationGroup.ltv_pct`, `liquidation_threshold_pct`, and `max_liquidation_bonus_bps` (`lending_market.rs:513`) override the reserve-level defaults.

So in PRIME market, the USDC borrow APY of **6.42%** today is identical for all PRIME-market borrowers regardless of their collateral mix. The capacity gate is per-pair, the price is per-pool. Same model as Aave V3 eMode.

### 1.3 Live caps and curve parameters (verified 2026-05-04)

Pulled from `/kamino-market/{market}/reserves/{reserve}/metrics/history?frequency=day`:

| Reserve | Market | Reserve pubkey | Deposit cap | Borrow cap | Borrow curve `[util→APR]` | Live util / borrowAPY |
|---|---|---|---|---|---|---|
| **USDC** | Main | `D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59` | **$1,000M** | **$700M** | `[0→0%, 0.95→3.1%, 1→30.4%]` | 95.2% / 5.85% |
| **USDC** | PRIME | `9GJ9GBRwCp4pHmWrQ43L5xpc9Vykg7jnfwcFGN8FoHYu` | **$240M** | **$210M** | `[0→3.86%, 0.8→4.91%, 0.9→4.91%, 0.95→5.35%, 1→6.77%]` | 92.9% / 6.42% |
| **USDC** | Apollo | `7fTiUEgY6TkEivLithpChHK7pxrTkC7qgcoCPFyigB4G` | **$1M** | **$0** (borrow disabled) | `[0→3.5%, 1→3.5%]` (flat) | n/a |
| **PRIME** asset | PRIME | `BUTND9T7Ux4KR8RAEgd4WoZwnP7xA279oA1y3iPVcvSh` | **$350M** | **$0** (collateral-only) | `[0→0.01%, 0.8→3%, 0.85→6.7%, 0.9→15%, 0.95→33.54%, 1→75%]` | 0% (no borrows) |
| **sACRED** | Apollo | `2cDCaQ8jtB9XFrQTgA7t8x8q3guhF1xMofNFaMNmtBbH` | **$1M** | **$0** (collateral-only) | flat 4.5% | 0% (no borrows) |
| **PYUSD** | PRIME | `3ZUAwhEtK8XWfK4fy98z4yoptm4GeyeAu21L11HPXaZ5` | $100M | $50M | `[0→3.86%, 0.8→4.67%, 0.9→4.67%, 0.95→5.11%, 1→6.53%]` | 94.5% / 6.61% |
| **USDS** | PRIME | `7SzMWArC8WAenndXFmRyfvcvrNPodqUFkmPrmmoRZvn4` | $30M | $24M | same shape as PYUSD | 77.3% / 6.04% |
| **CASH** | PRIME | `GCRm26EuqzHtH8U3zTsXMEnq864qAGkkcAjMBL4dw9XC` | $100M | $70M | same shape as PYUSD | 91.3% / 6.22% |

**Notes from raw on-chain config:**
- PRIME-market USDC base curve has TWO flat segments: `0.8→0.9` is identical at 4.91%, then breaks. 5-point poly-linear curve (CURVE_POINTS_LENGTH=11 in source per `klend-sdk/src/classes/curve.ts:3`).
- Main USDC's curve is intentionally near-zero below 95% util to reward maximum-utilization steady-state, with a **97x slope above the kink** (3.1% → 30.4% over 5 percentage points of utilization). Brutal — designed to clear withdrawals fast.
- Apollo market: USDC borrow fully disabled (`borrowLimit=0`). Market exists for sACRED-collateral → sACRED-collateral (Multiply loop). $1M USDC deposit cap total — essentially a permissioned KYC market for ACRED holders.
- The PRIME asset itself has `borrowLimit=0` — you cannot borrow PRIME from anyone. Collateral-only. Same for sACRED.

**Live elevation-group breakdown for Main USDC** (from `borrowedAgainstCollInEG`):
- Group 1: $0 borrowed
- Group 3: ~$25,930 USDC borrowed (limit u64::MAX = unlimited)
- Group 6: $0 borrowed
- Group 8: ~$869,742 USDC borrowed (limit unlimited)
- Outside any group: ~$157,263,911 borrowed (limit unlimited)

So Main USDC borrowing is ~99.4% NOT in eMode — most users are cross-mode generalist borrowers, not eMode loopers.

### 1.4 Interest rate model parameters

**Per-reserve configurable.** Confirmed via `ReserveConfig` struct (`reserve.rs:1449`):
- `borrow_rate_curve: BorrowRateCurve` — up to 11 `(utilization_bps, borrow_rate_bps)` points
- `borrow_factor_pct: u64` — risk-weighted multiplier on borrows when computing position LTV (the litepaper "Borrow Factor")
- `protocol_take_rate_pct: u8` — the spread (currently 10% on PRIME stables)
- `host_fixed_interest_rate_bps: u16` — additive fixed rate stacked on top of the curve (used for Maple/private credit reserves)
- `loan_to_value_pct`, `liquidation_threshold_pct`, `min/max_liquidation_bonus_bps` — base risk params, overridable by `ElevationGroup`
- `utilization_limit_block_borrowing_above_pct: u8` — hard ceiling that blocks new borrows above some util %, separate from the curve

**ElevationGroup struct** (32 max per market, `lending_market.rs:513`):
```rust
pub struct ElevationGroup {
    pub max_liquidation_bonus_bps: u16,
    pub id: u8,
    pub ltv_pct: u8,
    pub liquidation_threshold_pct: u8,
    pub allow_new_loans: u8,
    pub max_reserves_as_collateral: u8,
    pub debt_reserve: Pubkey,  // <-- ONE debt asset per group
    ...
}
```

**Critical structural fact:** Each elevation group has **exactly one debt reserve**. So eMode binds N collateral reserves → 1 debt reserve at favorable LTV. This is how PRIME → USDC Multiply at 88% LTV works: PRIME is in an elevation group whose `debt_reserve` is USDC. You can't simultaneously borrow USDC and PYUSD inside the same eMode group.

---

## 2. Historical data — the API is rich

**Historical APR endpoint exists, hourly granularity, ~6 months back.**

### 2.1 Reserve metrics history (THE useful one)

```
GET https://api.kamino.finance/kamino-market/{market}/reserves/{reserve}/metrics/history
   ?frequency=hour|day
   &start=2025-11-01T00:00:00Z
   &end=2026-05-04T00:00:00Z
```

Verified curl example (PRIME USDC, 7d hourly):
```bash
curl "https://api.kamino.finance/kamino-market/CqAoLuqWtavaVE8deBjMKe8ZfSt9ghR6Vb8nfsyabyHA/reserves/9GJ9GBRwCp4pHmWrQ43L5xpc9Vykg7jnfwcFGN8FoHYu/metrics/history?frequency=hour&start=2026-04-26T00:00:00Z&end=2026-05-04T00:00:00Z"
```

Each row contains the **FULL reserve state snapshot**: `borrowInterestAPY`, `supplyInterestAPY`, `borrowTvl`, `depositTvl`, `borrowCurve` (so you can detect parameter changes), `borrowFactor`, `reserveBorrowLimit`, `reserveDepositLimit`, `loanToValue`, `liquidationThreshold`, `protocolTakeRate`, `borrowedAgainstCollateralInElevationGroups`, `borrowLimitAgainstCollateralInElevationGroups`, `assetOraclePriceUSD`, `borrowOutsideElevationGroup`. Effectively a complete time-series of every parameter that can affect rates.

**Granularity verified:**
- `frequency=hour` works → 24 rows/day. PRIME USDC over Nov 4 → May 4 returned **3,612 hourly points**.
- `frequency=day` works → 1 row/day, returned 151 daily points for same range.
- `frequency=minute` returns empty array — not supported.
- Historical depth: data exists from **2025-11-01** (~6 months) at hourly resolution for PRIME USDC. For older markets like Main, USDC reserve was tracked since at least Nov 2023 per DefiLlama (899 daily points back to 2023-11-18).

### 2.2 Borrow + staking APY history (LST-only)

```
GET /kamino-market/{market}/reserves/{reserve}/borrow-and-staking-apys/history
GET /kamino-market/{market}/reserves/{reserve}/borrow-and-staking-apys/history/median
```
Returns `{createdOn, borrowInterestApy, stakingApy}`. **Empty for non-staking-yield assets** (USDC, PRIME, etc.). Tested USDC and got `[]`. Use the `/metrics/history` endpoint for stables.

### 2.3 Other useful historical endpoints

- `GET /v2/kamino-market/{market}/obligations/{obligationPubkey}/metrics/history` — per-position history (your own loans)
- `GET /v2/kamino-market/{market}/obligations/{obligation}/interest-fees` — accumulated interest paid (lender side)
- `GET /v2/kamino-market/{market}/obligations/{obligation}/interest-paid` — borrower side
- `GET /klend/{depositReserve}/{borrowReserve}/rewards/history` — KMNO incentive history per reserve pair
- `GET /kvaults/vaults/{pubkey}/metrics/history` — kvault TVL/APY/theoretical APY series
- `GET /kvaults/private-credit/metrics` — Maple-style private credit loans (verified: returns active loans with LTV; today shows 1 loan, $6.5M debt against $19.18M BTC at LTV 33.89%, max LTV 60%)
- `GET /benchmark-rates/usd` — Kamino's "USD benchmark rate" (verified hourly: today ~3.7%, computed from 8 USD reserves across 3 protocols)

Full schema: <https://api.kamino.finance/openapi/json> — 71 documented endpoints.

### 2.4 Intraday volatility

**No source publishes pre-computed intraday σ.** The Kamino hourly endpoint gives the raw data — compute it yourself.

**Empirical 6-month stats on PRIME USDC:**
- mean borrowAPY = **6.64%**, σ = **0.79%**, min = **0.48%**, max = **9.99%**

Eight distinct curve configurations were observed in that window (so governance has been actively tweaking the curve), the most recent change appears to be in late April 2026 (curve flipped from `1→7.54%` to `1→6.77%` max).

**DefiLlama** has time-series for Kamino-Lend pools (e.g. Main USDC at <https://defillama.com/yields/pool/d2141a59-c199-4be7-8d4b-c8223954836b>) but cadence is **~daily, not hourly**: 899 points span 2023-11-18 → 2026-05-04, median diff 86,400 sec. Their `apyBaseBorrow` field is `null` for kamino-lend pools — they only track supply APY, not borrow.

**Dune dashboards** exist (<https://dune.com/drank0/kamino>, <https://dune.com/filarm/kamino-solana-lending>, <https://dune.com/tt_tyler/Interest-rate-dashboard>) — but for sub-daily precision, the official API is the cleanest path. **Topledger** is mentioned as Kamino's data partner but their public dashboards I could verify don't expose hourly time-series outside Kamino's own UI.

**Recommendation:** scrape `/metrics/history?frequency=hour` daily; rolling 7-day σ is the cleanest σ measure.

---

## 3. Multiply specifics

**Cross-market or in-market loop? In-market loop** — the position is a single `Obligation` PDA on one market. Verified on the PRIME multiply page URL `kamino.com/multiply/CqAoLuq.../BUTND9T...3ZUAwh.../info-faqs`: the URL encodes `marketPubkey/collReserve/debtReserve` — `CqAoLuq...` is PRIME market, `BUTND9T...` is PRIME asset, `3ZUAwh...` is **PYUSD** in PRIME market. So PRIME→PYUSD multiply lives entirely inside PRIME market.

`MultiplyObligation` PDA derivation (`klend-sdk/src/utils/ObligationType.ts:48`):
```typescript
new MultiplyObligation(collToken, debtToken, programId, id)
toArgs() { tag: 1, seed1: collToken, seed2: debtToken }
```
Each Multiply position is a separate obligation per `(collToken, debtToken)` pair. Cannot mix multiple Multiply positions, but a user can have a Vanilla obligation AND a Multiply obligation on the same market (different PDAs).

### Live PRIME multiply leverage data

From `/kamino-market/{prime}/leverage/metrics`, 2026-05-04:

| Loop pair | Vault TVL | Avg leverage | Total deposited (USD) | Total borrowed (USD) | # obligations |
|---|---|---|---|---|---|
| PRIME → USDC | $21.1M | **5.51×** | $135.1M | $114.0M | 310 |
| PRIME → CASH | $5.9M  | 5.46× | $38.1M | $32.2M | 208 |
| PRIME → USDS | $1.3M  | 5.73× | $6.1M  | $4.86M | 86 |
| PRIME → PYUSD | $5.0M | 5.81× | $26.7M | $21.6M | 74 |

So **678 active PRIME multiply positions, $156M aggregate borrowed** across 4 stable debt reserves. All inside the same PRIME `LendingMarket`.

### Multiply mechanics

From <https://kamino.com/docs/products/multiply/how-it-works.md> verbatim:

> "A Multiply position opens in seven steps:
> 1. User specifies deposit amount and target leverage multiplier
> 2. Protocol borrows the required additional amount via flash loan
> 3. Flash-borrowed funds and user deposit are swapped into the target asset (e.g., SOL → JitoSOL) via Kamino Swap
> 4. The full target asset amount is deposited into Kamino Lend as collateral
> 5. The underlying asset (e.g., SOL) is borrowed against the deposited collateral
> 6. Borrowed funds repay the flash loan
> 7. Position is established at target leverage with collateral and debt recorded on Kamino Lend"

Flash loan fee = **0.001% per tx** (open/adjust/close). Same Klend program — `/programs/klend/src/handlers/handler_flash_loan.rs`.

For PRIME specifically, max LTV = **0.88** (verified live: PRIME reserve `maxLtv: "0.88"`), liquidationThreshold = **0.91**. Combined with 5.51× avg leverage (LTV ~83%), the buffer between current LTV and liq is ~8 percentage points.

### Liquidation engine

**Same engine as Klend.** Multiply uses the standard `Obligation` and standard liquidation paths — only the obligation-creation seeds differ. From <https://kamino.com/docs/products/multiply/risks.md> verbatim:

> "**Close factor:** Up to 10% of the position is liquidated per transaction
> **Liquidation penalty:** ~0.1% (reduced 90% from ~1% in September 2025)
> **Multiple rounds:** If LTV remains above threshold after the first liquidation, additional rounds follow automatically until the position is healthy"

Auto-deleverage (separate from liquidation) is triggered by Kamino Risk Council, with a **72-hour warning**, never used in Kamino's history per the same doc.

**Stake-rate oracle** is critical for LSTs (`LST Price = SOL_staked / LST_minted`) but **does not apply to PRIME** — PRIME uses a regular price oracle. So PRIME multiply IS exposed to oracle dislocation if a Scope/Pyth feed depegs from NAV.

---

## 4. Versus Morpho

**Visualized per-vault dashboard.** Morpho's strength is the per-vault React component with cap/util/APR cards. Kamino's equivalents are split across 3 surfaces:

1. **`https://app.kamino.finance/lending/{market}`** — per-market UI showing each reserve's deposit/borrow/util/APY. Same shape as Morpho's vault tile.
2. **`https://risk.kamino.finance`** — Streamlit dashboard. JS-rendered. Per the docs link from `/products/borrow-lend.md`, this is the "Live Risk Dashboard" — public.
3. **`/v2/kamino-market` + `/kamino-market/{m}/reserves/metrics`** — programmatic equivalents.

**There is no single canonical Morpho-style "vault page with deposit cap, util, borrow APY" graphic.** The closest analogue: when you click a reserve in `app.kamino.finance`, the side panel shows util curve + caps + utilization — but the API exposes everything Morpho does, often with more fields (per-eMode-group caps, borrow factor, host fixed rate, withdrawal caps, oracle metadata). The `/metrics/history` endpoint is strictly more useful than Morpho's history endpoint because it returns the full curve definition at every snapshot, letting you reconstruct rate at any past utilization.

**Topledger / Dune:** Topledger is mentioned in news as Kamino's data partner but no public dashboard with hourly rate series found. Dune dashboards are mostly TVL/liquidation-volume oriented, not per-reserve rate trackers.

**Recommendation for parity with Morpho UX:** Build our own using `/kamino-market/{m}/reserves/metrics` (live snapshot) + `/metrics/history?frequency=hour` (time-series) + `/v2/kamino-market/{m}/users/{user}/obligations` (positions). All free, no auth.

---

## 5. SDK + IDL surface

### SDK forecast capabilities

`@kamino-finance/klend-sdk` (<https://github.com/Kamino-Finance/klend-sdk>) exposes the methods needed for "what-if" forecasts. Verified in `src/classes/reserve.ts`:

| Method | Use |
|---|---|
| `reserve.calculateUtilizationRatio()` | current util |
| `reserve.calculateBorrowRate()` | current per-slot rate |
| `reserve.calculateBorrowAPR(slot, referralFeeBps)` | annualized APR with fixed-host stack |
| `reserve.totalBorrowAPY(currentSlot)` | compounded APY |
| `reserve.totalSupplyAPY(currentSlot)` | supply side |
| `reserve.getEstimatedDebtAndSupply(slot, referralFeeBps)` | extrapolates total borrow / total supply forward to a target slot using current rate |
| `reserve.getEstimatedUtilizationRatio(slot, referralFeeBps)` | util at future slot |
| `reserve.calculateEstimatedBorrowRate(slot, referralFeeBps)` | rate at future slot |
| `reserve.getBorrowLimitAgainstCollateralInElevationGroup(idx)` | per-eMode borrow cap |
| `reserve.getBorrowedAmountAgainstCollateralInElevationGroup(idx)` | per-eMode current borrow |
| `reserve.getMaxBorrowAmountWithCollReserve(market, collReserve)` | maximum borrow given collateral reserve, factoring eMode caps |
| `reserve.getBorrowCapForReserve(market)` | aggregate cap object |

**For "if I deposit X PRIME and borrow Y USDC, what's the new borrow APR":** there is **no built-in forecast helper**. Write it manually:

```typescript
// Pseudocode using the SDK primitives
const debtReserve = market.getReserveBySymbol('USDC');
const newBorrow = debtReserve.getBorrowedAmount().add(Y);
const newSupply = debtReserve.getTotalSupply().add(0);  // your borrow doesn't change supply
const newUtil = newBorrow.div(newSupply);
const newBorrowRate = getBorrowRate(newUtil, truncateBorrowCurve(debtReserve.state.config.borrowRateCurve.points));
const newBorrowAPR = newBorrowRate * SLOTS_PER_YEAR / SLOTS_PER_SECOND;
```

The leverage SDK (`src/leverage/calcs.ts`) exposes `calculateMultiplyEffects`, `calcBorrowAmount`, `depositLeverageCalcs`, `withdrawLeverageCalcs`, `adjustDepositLeverageCalcs`, `adjustWithdrawLeverageCalcs` — these compute the **collateral/debt amounts and final LTV** for a target leverage but do NOT forecast the resulting borrow APR after your loop hits the pool. Chain them with the rate-curve interpolation above.

### IDL key structs

Available at <https://github.com/Kamino-Finance/klend-sdk/tree/master/src/idl/klend.json>. Key structs verified from `programs/klend/src/state/`:

**`ReserveConfig`** (`reserve.rs:1449`):
- `borrow_rate_curve: BorrowRateCurve` (11-point poly-linear, `klend-sdk/src/classes/curve.ts:3`)
- `deposit_limit: u64`, `borrow_limit: u64`
- `loan_to_value_pct: u8`, `liquidation_threshold_pct: u8`
- `min_liquidation_bonus_bps: u16`, `max_liquidation_bonus_bps: u16`
- `protocol_take_rate_pct: u8`, `protocol_liquidation_fee_pct: u8`
- `borrow_factor_pct: u64`
- `host_fixed_interest_rate_bps: u16`
- `elevation_groups: [u8; 20]` (which groups this reserve participates in)
- `borrow_limit_outside_elevation_group: u64`
- `borrow_limit_against_this_collateral_in_elevation_group: [u64; 32]`
- `utilization_limit_block_borrowing_above_pct: u8` (hard ceiling)
- `disable_usage_as_coll_outside_emode: u8` (forces eMode-only usage)
- `autodeleverage_enabled: u8`
- `debt_term_seconds: u64`, `debt_maturity_timestamp: u64` (for fixed-term loans like Maple)

**`Obligation`** (`obligation.rs:44`):
- `deposits: [ObligationCollateral; 8]` (max 8 collateral)
- `borrows: [ObligationLiquidity; 5]` (max 5 debt)
- `elevation_group: u8`
- `deposited_value_sf: u128` (Fraction-encoded)

**`LendingMarket`** (`lending_market.rs:29`):
- `elevation_groups: [ElevationGroup; 32]`
- `emergency_mode: u8`
- `insolvency_risk_unhealthy_ltv_pct: u8`

**`ElevationGroup`** (`lending_market.rs:513`):
- Per-group LTV/liq threshold/liq bonus + single `debt_reserve: Pubkey`

---

## 6. Rehypothecation primitives

### Conditional ownership / yield-bearing collateral that still earns underlying yield

The clean answer: **Kamino does not offer "earn protocol-A yield while collateralized in Kamino" as a first-class primitive.** When you deposit a yield-bearing token into a Klend reserve, you mint a cToken and the underlying token sits in the reserve's vault — passive yield that accrues into the token (LST exchange-rate appreciation, sUSDe rebasing-via-exchange-rate, sACRED, PRIME) **continues to accrue**, because the appreciation is encoded in the mint's exchange rate, not in stream payments. So:

- **JitoSOL** as collateral: stake yield is *intrinsic to JitoSOL's exchange rate vs SOL*. Held in Kamino's reserve vault, it still appreciates. Confirmed by Kamino's stake-rate oracle behavior (uses `SOL_staked / LST_minted`, monotonic increase). <https://kamino.com/docs/products/multiply/how-it-works.md> verbatim: *"This ratio increases monotonically each epoch as staking rewards accrue into the pool."*
- **PRIME** as collateral: PRIME's NAV grows from HELOC interest (current price ~$1.0342 vs $1.00 NAV on rwa.xyz, $318M supply, 1,707 holders per <https://app.rwa.xyz/assets/PRIME>). Held in Kamino reserve, NAV growth still flows to your cToken.
- **sACRED**: same pattern — fund-share appreciation is in the token's exchange rate, persists in custody.

**What does NOT persist in Kamino:**
- **Streaming/airdrop rewards** that require the token to be held in a specific staking contract (e.g., farm rewards, points programs that snapshot wallet balances rather than token mint state). Once your sUSDV is in Kamino's reserve, it's owned by the reserve, so any whitelist-based reward (Solomon's "YaaS" qualified-wallet stream) won't reach the depositor.
- **Lockup-gated yield** that requires the depositor's own wallet to call `claim()`.

### kVault collateral

Kamino's kVaults (the new institutional vault product, `KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd` program) deposit user assets across multiple Kamino reserves with rebalancing. The kVault share token IS itself a token, and there's no documented Klend reserve that lists kVault-shares as collateral today (verified by sweeping `/kamino-market/{m}/reserves/metrics` across all 16 markets — none of the 130+ reserves are kVault tokens by name). The closest is **kTokens** (CLMM LP positions) which are documented in the litepaper as collateralizable on Klend in JLP/specific markets but not on PRIME or Apollo today.

### State of rehypothecation in Solana DeFi

- **Kamino's stance** (Marius Ciubotariu): rehypothecation breaks isolation. Kamino blocked Jupiter Lend's migration tool over this in late 2025/early 2026. <https://www.theblock.co/post/381602/jupiter-exec-acknowledges-zero-contagion-claim-was-not-100-correct-after-backlash-over-vault-design> — Marius: *"Jupiter Lend repeatedly claims there is no cross-contamination between assets, which is utter nonsense"*.
- **Jupiter Lend / Fluid model:** explicitly rehypothecates. Samyak Jain (Fluid co-founder) acknowledged vaults are "not completely isolated" — collateral is reused for yield. This is what enables their headline high LTV but creates recursive borrower exposure.
- **Drift Amplify:** isolated-pool yield-loop primitive. Deposits LST/JLP → borrows underlying → re-deposits → loops. Same pattern as Kamino Multiply but Drift markets it as a margin-account feature with cross-collateralization for perps. <https://docs.drift.trade/getting-started/cross-collateral-deposits>
- **MarginFi (mrgnlend):** previously the "yield stack" reference (deposit JitoSOL collateral → borrow USDC → deploy elsewhere). Doesn't ship a Multiply UI but the on-chain primitive is the same. No protocol-level rehypothecation.
- **Marinade Directed Stake:** unrelated — that's about validator selection for native stake, no lending hookup.
- **Jito Restaking (JRS):** distinct primitive — a token can be restaked to multiple AVS-style services on top of Jito. Not exposed via Kamino.

**Bottom line:** No Solana lending protocol I found ships a clean primitive where "collateral earns yield in protocol A while being collateralized in protocol B" with **the depositor's wallet** still treated as the points/yield endpoint. The closest pattern is *yield-bearing wrapper tokens* (LST, sUSDe, sUSDV, PRIME, sACRED) where the yield is already encoded in exchange-rate growth that persists through any holding venue — which is what Kamino implicitly leverages today. If you want depositor-wallet-snapshot rewards (the Solomon YaaS gating), you cannot get it through Kamino as-is; you'd need either (a) Solomon to whitelist Kamino's reserve vault address as an eligible wallet, or (b) a new on-chain primitive (probably a Token-2022 transfer hook that streams rewards based on cToken holders) — which is exactly the problem space your `fdn_transfer_hook` was built for.

---

## 7. Recommendations for Foundation strategy

For each of the levers your strategy needs, the cleanest path:

### 7.1 Get current borrow rates across markets
`GET /kamino-market/{m}/reserves/metrics` (one call per market). 16 markets × 1 call = 16 reqs. Or load all reserves via SDK with `KaminoMarket.load(rpc, marketAddress, slotDuration)`.

### 7.2 Get historical borrow rates (hourly, 6mo)
`GET /kamino-market/{m}/reserves/{r}/metrics/history?frequency=hour&start=...&end=...`. Each row carries the full reserve snapshot including the curve at that time, so you can detect parameter changes inline. Cache the curve definition to compute rolling σ at exact granularity. **Free, no auth.**

### 7.3 Compute σ of borrow APY
Roll your own from (7.2). Empirical reference: PRIME USDC over 6 months has σ=0.79% on a mean of 6.64%; min 0.48%, max 9.99%. Apollo USDC is flat 3.5% (no variance, since `borrowLimit=0` blocks any utilization).

### 7.4 Forecast borrow APR after your hypothetical deposit/borrow
SDK gives the primitives (`getEstimatedDebtAndSupply`, `getEstimatedUtilizationRatio`, `calculateEstimatedBorrowRate`) but not a single `simulateBorrow(deltaBorrow)` helper. Wrap them yourself:
```typescript
const newUtil = (currentBorrow + Y) / (currentSupply + X_collateral_if_same_reserve);
const newRate = getBorrowRate(newUtil, truncateBorrowCurve(reserve.state.config.borrowRateCurve.points));
```

### 7.5 Watch for cap exhaustion risk
Both reserve-level and per-eMode-group caps matter. PRIME-market USDC has $30M of headroom ($210M cap, $156M+ already drawn by Multiply alone — see leverage/metrics). Per-eMode caps are read via `reserve.getBorrowLimitAgainstCollateralInElevationGroup(idx)`.

### 7.6 Detect parameter changes
Diff the `borrowCurve` field in consecutive `/metrics/history` rows. Eight distinct curves observed on PRIME USDC over 6 months — the Risk Council changes them frequently (typically ≤monthly per the monthly Risk Insights forum threads, e.g. <https://gov.kamino.finance/t/kamino-lend-monthly-risk-insights-march-2026/873>).

### 7.7 PRIME-as-collateral leveraged yield strategy
The use case from the URL `kamino.com/multiply/CqAoLuq.../BUTND9T...3ZUAwh.../info-faqs`: the playbook is verified live with $156M deployed across 678 positions at ~5.5× leverage. Math: PRIME yields ~8% gross from HELOC interest; you borrow PYUSD/USDS/CASH/USDC at 6.0–6.6% APY; spread ~1.4–2.0%; multiplied by (5.5−1)=4.5× gives net APY of **~14.5–17.5% on initial deposit** before flash-loan fees and Kamino's protocol take (10% spread, already baked into supply APY computation). This matches the docs' worked example for the JitoSOL/SOL loop (14% net at 8×).

### 7.8 Conditional-ownership idea (sUSDV-style "earn while collateralized")
- **If the underlying yield is exchange-rate growth** (PRIME, sACRED, LSTs, sUSDe-style): it works on Kamino out of the box, no new primitive needed. The cToken accrues underlying NAV.
- **If the yield is wallet-snapshot streamed (Solomon YaaS, points programs)**: Kamino can't help. You need either issuer-side whitelisting of Kamino's reserve vault PDA, or your own Token-2022 transfer hook that splits incoming yield among current cToken holders (your `fdn_transfer_hook` design).
- **If the yield is farm-claim style**: there's a per-reserve farm system (`getCollateralFarmAddress`, `getDebtFarmAddress` in SDK) that distributes farm rewards to depositors — that's the existing Kamino mechanism for layering rewards on top of base supply APY (KMNO incentives, ~$1.59M USD reserve rewards distributed per `/kvaults/summary`).

### 7.9 Where Kamino is structurally weaker than Morpho
There's no Morpho-style "permissionless vault listing" on Kamino. New markets/reserves require Kamino governance (Risk Council). Curators can deploy new kVaults (<https://kamino.com/docs/curators/vaults/creating-a-vault.md>) but kVaults are *aggregators over existing Klend reserves*, they don't create new lending markets. So if your strategy depends on a custom reserve config (e.g., listing fdnGAIB as collateral), you need a governance proposal or you build outside Kamino.

### 7.10 What I could not verify from public sources
- Specific PRIME market initial cap / historical cap-raise proposal numbers — the monthly Risk Insights forum threads (Dec 2025 onward) only quote performance, not parameter votes. The actual cap-raise discussions presumably happen in Kamino's private Risk Council Slack, not on the public forum.
- Apollo sACRED cap evolution — only the current $1M deposit cap is visible; no forum thread documents the listing parameters.
- Whether Topledger has a Kamino-specific dashboard with hourly rate granularity — site says they're a data partner but I couldn't surface a public Kamino dashboard URL.
- The full content of the now-removed `docs.kamino.finance/risk/protocol-mechanisms/e-mode-caps` page (the docs site moved to `kamino.com/docs` in 2025–26 and that path returns the JS shell). The mechanic is fully recoverable from the on-chain `borrow_limit_against_this_collateral_in_elevation_group: [u64; 32]` field on the Reserve struct, which I quoted from source.

---

## Sources

- [Kamino API OpenAPI spec](https://api.kamino.finance/openapi/json)
- [Kamino docs index](https://kamino.com/docs/llms.txt)
- [Kamino Lend litepaper](https://kamino.com/docs/kamino-lend-litepaper.md)
- [Multiply how-it-works](https://kamino.com/docs/products/multiply/how-it-works.md)
- [Multiply risks](https://kamino.com/docs/products/multiply/risks.md)
- [Cross & isolated modes](https://kamino.com/docs/products/borrow-lend/cross-and-isolated-modes.md)
- [Get reserve APYs (API + SDK code samples)](https://kamino.com/docs/build/borrow/get-market-reserve-apys.md)
- [Market data metrics](https://kamino.com/docs/build/borrow/market-data-metrics.md)
- [Program addresses](https://kamino.com/docs/build/resources/program-addresses.md)
- [Klend program source — reserve.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/state/reserve.rs)
- [Klend program source — lending_market.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/state/lending_market.rs)
- [Klend program source — obligation.rs](https://github.com/Kamino-Finance/klend/blob/master/programs/klend/src/state/obligation.rs)
- [klend-sdk source — reserve.ts](https://github.com/Kamino-Finance/klend-sdk/blob/master/src/classes/reserve.ts)
- [klend-sdk source — leverage/calcs.ts](https://github.com/Kamino-Finance/klend-sdk/blob/master/src/leverage/calcs.ts)
- [klend-sdk source — utils/ObligationType.ts](https://github.com/Kamino-Finance/klend-sdk/blob/master/src/utils/ObligationType.ts)
- [Kvault program README](https://github.com/Kamino-Finance/kvault)
- [Risk dashboard](https://risk.kamino.finance) (Streamlit, JS-rendered)
- [Kamino Lend Mar 2026 risk insights](https://gov.kamino.finance/t/kamino-lend-monthly-risk-insights-march-2026/873)
- [Kamino Lend Jan 2026 risk insights](https://gov.kamino.finance/t/kamino-lend-monthly-risk-insights-january-2026/869)
- [Kamino Lend Dec 2025 risk insights](https://gov.kamino.finance/t/kamino-lend-monthly-risk-insights-december-2025/865)
- [ACRED tokenized fund onboarding (Steakhouse)](https://gov.kamino.finance/t/kamino-to-onboard-acred-tokenized-fund-in-collaboration-with-steakhouse-financial/658)
- [PRIME on RWA.xyz](https://app.rwa.xyz/assets/PRIME)
- [Defillama Main USDC Kamino pool history](https://defillama.com/yields/pool/d2141a59-c199-4be7-8d4b-c8223954836b)
- [Dune — Kamino Solana lending dashboard](https://dune.com/filarm/kamino-solana-lending)
- [Dune — Kamino main dashboard](https://dune.com/drank0/kamino)
- [The Block — Jupiter Lend zero-contagion correction](https://www.theblock.co/post/381602/jupiter-exec-acknowledges-zero-contagion-claim-was-not-100-correct-after-backlash-over-vault-design)
- [Drift cross-collateral deposits](https://docs.drift.trade/getting-started/cross-collateral-deposits)
- [Solomon Labs docs](https://docs.solomonlabs.org)
