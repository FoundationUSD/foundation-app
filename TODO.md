# Foundation Vault Infrastructure — Execution Tracker

**Source of truth:** `../dataroom/solana/ADR-004-vault-architecture.md` (engineering blueprint) · `../dataroom/solana/ADR-003-compute-rwa-solana.md` (scope) · Notion product pages **AWY** (`349a6e99f38380d2a432c76c8a92fd29`) and **Robinhood-for-RWA** (`349a6e99f383809dab1dd75de744ff3d`) (narrative).

**Positioning:** *Robinhood for RWA. Starting on Solana.* One USDC deposit, one token, institutional yield engines.

**First instance:** **AWY — All-Weather Yield** (`awyUSD` Token-2022 share). On-chain composite basket over four native-Solana RWA assets, Jupiter-routed at entry/exit/rebalance, quarterly rebalance, no leverage, no emissions in headline APY.

**Target:** $1M+ TVL within 90 days of AWY mainnet. AWY → institutional vaults (Apollo ACRED via Securitize SPC) on the follow-on roadmap.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Flagship — All-Weather Yield (AWY)

**Thesis:** four yield engines with distinct dominant risk drivers (actuarial events · US rate cycle · crypto borrowing demand · Fed funds), so no single macro regime compresses every leg simultaneously.

### Composition (target weights)

| # | Asset | Protocol | Yield Source | Weight | Base APY |
|---|-------|----------|-------------------------------------|--------|----------|
| 1 | ONyc       | OnRe            | Reinsurance premiums + collateral yield | 35%    | 11.0%    |
| 2 | PRIME      | Figure / Hastra | Tokenized HELOC lending                | 30%    | 7.5%     |
| 3 | syrupUSDC  | Maple           | Overcollateralized crypto lending      | 25%    | 6.5%     |
| 4 | USDY       | Ondo            | Short-term US Treasuries               | 10%    | 3.7%     |
|   |            |                 | **Blended base**                       | **100%** | **~8.1%** |

Rebalance cadence: **quarterly, fixed weights** (operator-gated ix with 48h timelock on any weight delta >5%).

### Open work (rolls up detail from sections below)
- [ ] `fdn_vault_compute` basket extensions (new ixs, state, Jupiter CPI helper, tests)
- [ ] 4 asset integrations under `src/lib/integrations/` (ONyc, PRIME, syrupUSDC, USDY) + shared Jupiter routing client
- [ ] NAV keeper rewritten for 4 per-leg feeds; Rebalance keeper; Redemption keeper
- [ ] AWY-aware strategy detail page (composition, drift, rebalance countdown) + deposit/redeem preview with per-leg slippage
- [ ] Security review pass covering Jupiter CPI surface, per-leg NAV sanity, slippage post-check
- [ ] Compressed OtterSec scope (basket ixs + hook) + Neodyme office hours
- [ ] Devnet smoke + mainnet beta with $10K seed / $50K cap → ramp to $250K after clean 72h watch

---

## Security Review — 2026-04-14

Applied during scaffolding pass. Every finding below links to a mitigation or an open TODO.

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| S1 | `init-if-needed` Anchor feature enables re-initialization attacks when seeds are reused | high | [x] Removed from workspace deps; must be enabled per-ix with audit note if genuinely needed |
| S2 | Placeholder program IDs in `declare_id!` and Anchor.toml are not real keypairs | medium | [ ] Run `anchor keys sync` on first devnet deploy; pin real IDs in Anchor.toml per cluster |
| S3 | `high_water_mark` initialized to 0 triggers false perf fee on first NAV update | high | [x] Initialize to `NAV_FLOOR` (1_000_000) in `initialize` ix (verified on-chain) |
| S4 | Rate-limit epoch does not auto-advance — `redeemed_this_epoch` would grow unbounded | high | [x] `rate_limit::maybe_advance_epoch` rolls epoch before every redeem; unit-tested |
| S5 | SAS `attestation_schema/issuer` must only be read when `requires_attestation = true` | medium | [ ] Guard clause in `deposit` — only load SAS account when flag set |
| S6 | Events emitting `Vec<u64>` are unbounded — could OOM the validator log | low | [ ] Enforce `MAX_WITHDRAWALS_PER_BATCH = 10` before `emit!` in `process_withdrawals` |
| S7 | No workspace-wide clippy lints; silent math bugs possible | medium | [x] Added `arithmetic_side_effects = deny`, `unwrap/expect/indexing/panic = deny` to workspace |
| S8 | Pause authorities must be **separate keys from Squads 3-of-5 signers** — overlap collapses defense-in-depth | high | [ ] Document in ops runbook; verify signer key fingerprints before mainnet initialize |
| S9 | `.env.local` at repo root holds vault secrets; keepers must not inherit them | high | [ ] Create per-keeper `.env` with minimum-privilege hot-wallet keys; never mount repo root env into keeper containers |
| S10 | `emergencyWithdraw` destination must be pre-committed on deploy (Bybit-style UI injection defense) | high | [ ] Hardcode `immutable address EMERGENCY_RECIPIENT` in SPC constructor; no runtime override (GAIB backlog; re-apply pattern for any future SPC) |
| S11 | Share math: u128 intermediates, checked ops, round-down toward vault | critical | [x] `math::assets_to_shares`, `shares_to_assets`, `compute_nav_per_share` with 10 unit tests covering inflation attack, round-trip, bounds |
| S12 | Transfer hook `execute` writes dest lockup — needs writable PDA in `ExtraAccountMetaList` | critical | [x] Implemented source-only lockup for v0; destination-propagation tracked as v1 follow-up |
| S13 | Cargo profiles: `dev` lacked `overflow-checks` → tests could pass with silent overflow | medium | [x] `overflow-checks = true` on both `dev` and `release` profiles |
| S14 | Dependency versions not pinned — supply-chain drift risk (see `@solana/web3.js` CVE-2024-54134) | medium | [x] All workspace deps pinned with `=` exact version |
| S15 | No `InvariantViolation` auto-pause helper — every ix would re-implement it inconsistently | high | [x] `invariants::enforce` pauses in-place, emits event, returns mapped error |

### Security gates still open
- Formal OtterSec review of `fdn_transfer_hook` reentrancy surface **AND** AWY basket ixs + Jupiter CPI surface
- Neodyme office-hours review of full vault program (schedule in Week 1 of AWY plan)
- Fuzz harness for share math with 1-wei ↔ max-u64 edge cases, extended to per-leg basket NAV aggregation
- Immunefi bug bounty program ($50K–$250K) live at AWY mainnet launch
- Signer-key fingerprint verification procedure documented for Squads 3-of-5

### AWY-specific security findings (pre-implementation)
- [ ] **A1** — Jupiter CPI trust surface: whitelist Jupiter program ID as a `constants.rs` constant; reject any swap ix whose `program_id` does not match. Prevents malicious program substitution through passed accounts.
- [ ] **A2** — Slippage bound per leg must be enforced **post-swap** by reading the destination token account balance delta, not by trusting the Jupiter quote pre-execution (price moves between quote and land).
- [ ] **A3** — Per-leg NAV must be sanity-checked: reject basket NAV update if any one leg's NAV delta exceeds its own `check_nav_bounds` (±5% up / -2% down), not just the basket average. Global NAV floor invariant still holds.
- [ ] **A4** — Rebalance ix must not let the operator drain a leg to zero unless its target weight is explicitly zero. If `basket_weights_bps[i] > 0`, post-swap leg balance must be > 0.
- [ ] **A5** — Any single-leg NAV feed failure (staleness or oracle error) **stalls** the basket NAV update; must not proceed with a stale leg value.

---

## Solana Programs

### `fdn_vault_compute` — shipped (single-asset base, reused for AWY)

*Devnet: `2PLMStk5P2GNKMH3ciK7N62wifwZZL9fmjcef4S7Ezop` · Anchor 0.31 · Token-2022 share mint via PDA-signed helper.*

- [x] `initialize` ix — VaultState init + Token-2022 share mint creation via `create_share_mint` helper (MetadataPointer + TransferHook extensions), HWM=NAV_FLOOR, virtual offset locked, constraint binds `transfer_hook_program` to the canonical `FDN_TRANSFER_HOOK_PROGRAM_ID`
- [x] `initialize_token_accounts` ix — creates `buffer_usdc`, `managed_usdc`, `fee_treasury`, `redeem_escrow`, `pending_claims_usdc` PDAs (5 accounts/tx). Idempotent via `TokenAccountsAlreadySet` guard.
- [x] Token-2022 share mint creation helper (`src/token.rs`) — system allocate → MetadataPointer init → TransferHook init → initialize_mint2 with PDA signer; MintAuthority=vault_authority PDA, FreezeAuthority=None
- [x] `pause` + `unpause` — fully implemented with access control, events, idempotent pause
- [x] `deposit` ix — SAS guard + virtual-offset math + buffer/managed split + SPL USDC transfers + Token-2022 `mint_to` with vault_authority PDA signer + lockup refresh + invariant enforcement at end
- [x] `redeem` ix — not-paused + queue-mode + lockup check + `rate_limit::consume` + buffer sufficiency + Token-2022 burn + SPL USDC transfer with PDA signer + nav recompute + invariant enforcement
- [x] `fdn_transfer_hook::execute` — Anchor `fallback` dispatch, reads source `ShareLockup` by offset, enforces `now >= locked_until` (~100 LOC total)
- [x] `fdn_transfer_hook::initialize_extra_account_meta_list` — declares 1 extra: source lockup PDA; vault pubkey baked in as Seed::Literal at init time
- [x] `request_redeem` — lockup check + Token-2022 `transfer_checked` (redeemer→redeem_escrow, hook fires) + RedeemRequest PDA init with monotonic request_id
- [x] `process_withdrawals` — operator gate + status Pending check + `shares_to_assets` + buffer sufficiency + Token-2022 burn from escrow + SPL USDC transfer buffer→pending_claims + mark Claimable + NAV recompute + invariants (v0 processes 1 req/ix)
- [x] `claim_redeem` — status Claimable check + SPL USDC transfer pending_claims→redeemer + mark Completed (idempotent)
- [x] `harvest_fees` — `compute_management_fee_shares` + `compute_performance_fee_shares` + Token-2022 `mint_to` fee_treasury + HWM update on upward NAV only + `last_fee_harvest` timestamp
- [x] `drain_managed` — operator gate + not-paused + amount-sufficiency + SPL USDC transfer managed→destination + event. total_assets NOT decremented (funds still Foundation-owned)
- [x] `update_nav` — operator gate + non-empty oracle_proof + 26h staleness cap + `check_nav_bounds` (±5%/-2% TWAP) + inline fee harvest using PRE-update NAV + `apply_twap` (70/30) + `check_nav_floor` auto-pause w/ `InvariantViolation` event + commit. Pyth cross-check deferred to v1 (Anchor 0.31 compat).
- [x] Devnet keypairs generated (`2PLMStk5...`, `3hBtJLsk...`, deployer `ABQADtDr...`)
- [x] **Devnet deployment live + smoke test passed** (2026-04-15):
  - `fdn_vault_compute` → `2PLMStk5P2GNKMH3ciK7N62wifwZZL9fmjcef4S7Ezop`
  - `fdn_transfer_hook` → `3hBtJLskNbhbdzjA8imqiR9uaWMKrvUEiwseenAwgCTs`
  - Mock USDC mint: `9dsc8YzHtcEMVPRiKeVj3BXcFgUBeHkm7MYRGrEJ6HSg`
  - Smoke vault `fdnSMOKE`: `5XXkck1uRmz2QUYg3Ta69ptS7tZa1fo1dbeY33RpANSc`
  - Share mint PDA: `2L44XLVE8d6eH2m3tUz8keYotft88K5T2zyVzBbP5tmp`
- [x] **Ixs verified on devnet:** `initialize`, `initialize_token_accounts`, `deposit`, `pause`, `unpause`
- [x] **On-chain invariants verified:** `nav_per_share = 1_000_000`, `high_water_mark = 1_000_000`, `virtual_assets = virtual_shares = 1_000_000`
- [x] **Deposit flow verified end-to-end (devnet tx `4gDgbRUHcs7S...`):** 50 USDC → 50M shares minted, buffer split 15/85, NAV held at $1.00, lockup set to `now + 86399s`
- [x] **Negative paths verified:** lockup blocks redeem (`LockupActive`); paused vault blocks deposit (`VaultPaused`)
- [x] Stack-frame overflow mitigation: `Box<>` applied to ALL heavy handlers (`deposit`, `redeem`, `request_redeem`, `process_withdrawals`, `claim_redeem`, `harvest_fees`, `drain_managed`, `update_nav`)
- [x] Smoke test script with idempotent re-runs: `tests-integration/scripts/devnet-smoke.ts`

### `fdn_vault_compute` — AWY basket extensions (new)

- [ ] Extend `VaultState` with new fields behind a `basket_enabled: bool` flag (keeps single-asset vaults backward-compatible):
  - `basket_underlyings: [Pubkey; 4]` — mint addresses of ONyc, PRIME, syrupUSDC, USDY (in fixed index order)
  - `basket_weights_bps: [u16; 4]` — target weights; must sum to 10_000
  - `basket_nav_per_leg: [u64; 4]` — last known per-leg NAV in 6-decimal units
  - `last_rebalance: i64`, `rebalance_interval_seconds: i64` (default `90 * 86_400`)
  - `max_slippage_bps: u16` (default 50)
  - Update `VaultState::SPACE` constant accordingly
- [ ] `deposit_basket(amount)` ix — splits USDC by `basket_weights_bps` → 4 Jupiter CPI swaps (USDC → leg_i) → aggregate post-swap assets via per-leg NAV → mint shares via virtual-offset `assets_to_shares`. Lockup refresh, invariants, emit `BasketDeposited`.
- [ ] `redeem_basket(shares)` ix — burn shares → read `shares_to_assets` → per-leg proportional unwind via Jupiter (leg_i → USDC) → buffer-sufficiency check aggregated across 4 legs → SPL USDC transfer to redeemer. Invariants, emit `BasketRedeemed`.
- [ ] `rebalance(new_weights_bps)` ix — operator-gated, enforces:
  - Sum of weights == 10_000
  - `now >= last_rebalance + rebalance_interval_seconds` OR per-leg drift >3% vs target
  - Weight delta per leg ≤5% **or** 48h timelock elapsed (reuse existing `UpgradePending` pattern)
  - 4 Jupiter swaps rebalance holdings; write `last_rebalance = now`; emit `Rebalanced`
- [ ] `update_nav` extension — accept `new_nav_per_leg: [u64; 4]`; compute basket NAV = weighted sum; per-leg `check_nav_bounds` still applied; basket NAV floor invariant unchanged
- [ ] Jupiter CPI helper (`programs/fdn_vault_compute/src/jupiter.rs`) — builds swap ix, validates Jupiter program ID constant, caps slippage at `max_slippage_bps`, max 3 hops, post-swap balance-delta check (see A2)
- [ ] New errors in `errors.rs`: `BasketWeightsInvalid`, `BasketUnderlyingMismatch`, `BasketNotEnabled`, `RebalanceTooSoon`, `JupiterProgramIdMismatch`, `JupiterSlippageExceeded`, `PerLegNavStale`
- [ ] New events in `events.rs`: `BasketDeposited { user, usdc_in, shares_out, per_leg_delta: [u64; 4] }`, `BasketRedeemed { user, shares_in, usdc_out, per_leg_delta: [u64; 4] }`, `Rebalanced { old_weights, new_weights, swap_summary }`
- [ ] Unit tests: basket math round-trip (`deposit_basket` → `redeem_basket` ≈ identity ± rounding), weight-sum validation, per-leg NAV aggregation golden values, rebalance drift math, slippage post-check rejection on adversarial quote
- [ ] Devnet: initialize `fdnAWY` with the 4 (devnet-mock or real) underlyings, `deposit_basket(100 USDC)`, verify per-leg balances hit `[35, 30, 25, 10]` USDC splits within slippage, `redeem_basket` full exit, `rebalance` smoke path
- [ ] `awyUSD` Token-2022 mint creation via existing `create_share_mint` helper (MetadataPointer + TransferHook extensions, MintAuthority=vault_authority PDA)

### `fdn_transfer_hook` — shipped + v1 follow-ups

- [x] Minimal ~100 LOC Anchor program, read-only lockup enforcement, zero external CPI, deployed devnet, source-only lockup
- [x] `initialize_extra_account_meta_list` implemented
- [ ] Destination lockup propagation (v1 — v0 enforces source-only, which already blocks the primary "deposit → transfer → redeem" arb)
- [ ] Formal OtterSec / Neodyme reentrancy audit sign-off before mainnet

---

## AWY Asset Integrations (`src/lib/integrations/`)

Pattern: mirror existing `solomon.ts` / `kamino.ts` / `oro.ts` shape. Each client exports `getMint()`, `getCurrentNavUsdc()`, `getTvl()`, `getBaseApy()`, `priceImpactBps(amountUsdc: number)`. Results surface through extended `/api/strategies` route which emits the AWY composition block with live per-leg data.

### ONyc (OnRe) — 35%
- [ ] Write `src/lib/integrations/onyc.ts`
- [ ] Mint address (mainnet + devnet), Kamino reserve ID for collateral market
- [ ] NAV source: Chainlink + Pyth dual oracle feeds read via Kamino reserve metrics API
- [ ] Base APY source: OnRe public dashboard or Kamino supply APY (strip emissions/points)
- [ ] Jupiter route validation: confirm USDC↔ONyc route exists with acceptable depth on Orca / Raydium / Meteora
- [ ] Note regulatory context: OnRe is Bermuda-domiciled, BMA-regulated reinsurer; surface in transparency tab

### PRIME (Figure / Hastra) — 30%
- [ ] Extend existing `src/lib/integrations/kamino.ts` (PRIME already partially wired there per codebase audit)
- [ ] Expose per-leg NAV + APY hooks matching the shared interface
- [ ] Jupiter route validation on Raydium concentrated pools + Kamino Lend
- [ ] Document Chainlink CCIP bridge dependency (Provenance → Solana, live since Dec 2025) as a risk in transparency tab

### syrupUSDC (Maple) — 25%
- [ ] Write `src/lib/integrations/maple.ts`
- [ ] Mint address + Maple program ID
- [ ] APY source: Maple on-chain rate (preferred) or Maple API
- [ ] NAV: syrupUSDC is rebasing → read `convertToAssets(1e6)` equivalent or its on-chain exchange-rate accessor
- [ ] Jupiter route validation: Kamino / Drift / Pendle secondary liquidity
- [ ] Surface zero-loss track record (post-2022 overcollateralization model) in transparency tab

### USDY (Ondo) — 10%
- [ ] Write `src/lib/integrations/ondo.ts`
- [ ] Mint address + Ondo on-chain NAV oracle
- [ ] APY source: Ondo published yield (tracks Fed funds)
- [ ] **MVP path: secondary-market only** via Jupiter (Ondo primary mint has 40–50d lockup; not compatible with on-demand vault semantics)
- [ ] Document primary-lockup + issuer structure (Ondo Global Markets BVI, Reg. S, Fireblocks/Zodia custody) in transparency tab

### Jupiter routing layer (shared)
- [ ] Write `src/lib/integrations/jupiter.ts`
- [ ] Exports: `getQuote(inputMint, outputMint, amount, slippageBps)`, `buildSwapIx(quote, userPubkey)`, `estimateImpactBps(amount, route)`
- [ ] Consumed by: UI preview (deposit/redeem slippage display), keeper rebalance tx builder
- [ ] Cache quotes 10s server-side to avoid Jupiter rate-limit under load

### Strategies route extension
- [ ] Extend `src/app/api/strategies/route.ts` to emit an `awy` block containing `{ composition: [...], blendedBaseApy, legDrift, lastRebalance, nextRebalance }` for the frontend detail page
- [ ] Add `fdnAWY` entry to `FOUNDATION_VAULTS` in `src/lib/vaults.ts` (protocol type union extended to include `"awy"`; status `coming_soon` until program ships)
- [ ] Add `/public/partners/awy.png` logo and wire in `PROTOCOL_LOGO` map in `src/app/page.tsx`

---

## Keepers (rewritten for AWY basket)

All four keeper packages are currently stubbed (see `keepers/{nav,batch,queue,monitor}/` — each ~15–20 LOC scaffolds). Rewrite scope below replaces Week-1 GAIB-flavored plan.

### NAV Keeper (every 6h at 00/06/12/18 UTC)
- [ ] Pull 4 per-leg NAVs in parallel (ONyc via Kamino reserve / PRIME via Kamino PRIME market / syrupUSDC via Maple rate / USDY via Ondo oracle)
- [ ] Submit `[u64; 4]` array to extended `update_nav` ix with operator signature
- [ ] Per-leg fallback: if any feed >12h stale, keeper skips that cycle and pages operator (cannot feed stale leg into basket NAV per A5)
- [ ] Alert if basket NAV gap >12h; program auto-blocks at 26h

### Rebalance Keeper (daily 13:00 UTC drift check + quarterly schedule)
- [ ] Compute current weights from per-leg balances × per-leg NAV
- [ ] If any leg drifts >3% from target OR `now >= last_rebalance + 90d`: call `rebalance(target_weights_bps)`
- [ ] Idempotent — re-runs on transient failure must not double-swap
- [ ] Logs: pre/post weights, Jupiter quote IDs, realized slippage per leg

### Redemption Keeper (on-demand, triggered by `request_redeem` events)
- [ ] Watches `RedeemRequested` events
- [ ] For each Pending request: builds 4 Jupiter unwind quotes proportional to per-leg holdings → calls `process_withdrawals(request_id)`
- [ ] SLA: 15 min target, 1h max
- [ ] On buffer sufficiency: routes directly via `redeem` instead (faster path)

### Monitor (real-time, generic — extend existing alerts)
- [ ] Per-leg NAV staleness (warn 8h, page 12h, program auto-block 26h)
- [ ] Per-leg slippage spike (any swap > 50 bps realized)
- [ ] Weight drift >5% (rebalance trigger + alert)
- [ ] Jupiter route failure (pages operator; may indicate liquidity event)
- [ ] Buffer low (<8%) / critical (<5%)
- [ ] TVL drop >15% / 1h
- [ ] Invariant violation (auto-pause trigger — already wired in program, monitor pages PagerDuty)
- [ ] Operator hot wallet: rate-limited, can only `update_nav` / `drain_managed` / `process_withdrawals` / `rebalance`

---

## Frontend (foundation-app)

### AWY highlight — shipped
- [x] `AwyHighlight` component in `src/app/page.tsx` — flagship section on landing (pre-connect) and on connected vault grid (above filter); 4-leg composition grid, blended APY, Coming Soon pill, infra-card glass treatment

### When program ships (Week 2)
- [ ] Add `fdnAWY` entry to `FOUNDATION_VAULTS` in `src/lib/vaults.ts` with `status: "coming_soon"` → flip to `"live"` on mainnet deploy
- [ ] Extend `FoundationVault.protocol` type union to accept `"awy"`
- [ ] Add `/public/partners/awy.png` logo; wire into `PROTOCOL_LOGO` map
- [ ] AWY-aware strategy detail page (`src/app/strategy/[id]/page.tsx`) — reuses existing Overview / Performance / Strategy / Transparency / Risks tab shell, adds a **Composition** tab that renders:
  - Live 4-leg breakdown (weight, NAV, APY, drift badge)
  - Rebalance countdown (`last_rebalance + 90d - now`)
  - Per-leg drift drift indicator (green <1%, amber 1–3%, red >3%)
- [ ] Deposit form: preview card shows per-leg USDC split + 4 Jupiter quotes + total estimated slippage before user confirms
- [ ] Redeem form: mirrors deposit preview for the unwind path (shows per-leg return USDC)
- [ ] Keep the `Coming Soon` pill visible until mainnet deploy is live

---

## Oracles & NAV (AWY-aware)

- [ ] Per-leg primary feeds:
  - ONyc → Chainlink + Pyth dual via Kamino reserve
  - PRIME → Figure NAV via Chainlink CCIP bridge
  - syrupUSDC → Maple on-chain rate
  - USDY → Ondo on-chain NAV oracle
- [ ] Fallback: operator submission with **tighter** bounds (±2% up / -1% down) if any single leg feed stale >12h
- [ ] Global: 70/30 TWAP smoothing, ±5%/-2% basket-level bounds, 26h staleness cap, NAV floor circuit breaker
- [ ] A3 sanity gate: per-leg NAV delta itself must pass `check_nav_bounds` — no leg can move basket NAV beyond its own safe range

---

## Token-2022 Share Mints
- [x] Extensions enabled for shipped vaults: MetadataPointer, TransferHook (`fdnSMOKE` live)
- [x] Extensions explicitly NOT used: Permanent Delegate, Confidential Transfers, Non-Transferable, Transfer Fee, Default Account State, Freeze Authority
- [ ] `awyUSD` mint on AWY basket deploy (same extensions + MetadataPointer wired to NAV/fees/operator display)
- [ ] Metadata account populated for `awyUSD` with name, symbol, logo URI

---

## Admin & Governance (Squads 3-of-5)
- [ ] Squads v4 multisig 3-of-5 deployed on Solana mainnet
- [ ] Signers: Vivek, Eugene, David, Advisor 1, Advisor 2 — all Ledger hardware
- [ ] 48h timelock on: upgrade, change admin/operator, fee params, buffer params, deposit_cap, pause_authorities, **basket_weights_bps changes >5%**
- [ ] No timelock: `pause` (any guardian), `unpause` (Squads only), `rebalance` within ±5% of target weights
- [ ] Role separation in program: admin vs operator vs 3 pause guardians
- [ ] Two-person rule policy doc for signers (no signer approves own tx)
- [ ] Upgrade flow doc: PR → audit diff → Squads tx → 48h → execute → post-upgrade invariant check

---

## Testing

### Unit (shipped + extensions)
- [x] `math.rs` round-trip, inflation attack, bounds (10 tests green)
- [x] `rate_limit.rs` epoch cap + auto-advance
- [x] `invariants.rs` all three invariants
- [ ] Basket weight validation (sum == 10_000)
- [ ] Per-leg NAV aggregation golden values
- [ ] Rebalance drift math: computed-weights vs target-weights tolerance
- [ ] Jupiter slippage post-check rejection on adversarial pre-quote

### Integration
- [ ] `deposit_basket` → 4 Jupiter swaps (devnet-mocked) → mint `awyUSD` → `redeem_basket` → verify USDC returned within rounding
- [ ] `rebalance` from `[3500,3000,2500,1000]` to `[3000,3000,3000,1000]`; verify post-tx holdings match new weights within slippage band
- [ ] Per-leg NAV feed stale → `update_nav` blocks with `PerLegNavStale`
- [ ] Weight-change >5% without timelock → `update_nav`/rebalance rejected
- [ ] Invariant violation simulation → auto-pause emits `InvariantViolation`
- [ ] Lockup enforcement: deposit → transfer attempt within 24h → transfer hook rejects
- [ ] Queue mode: `request_redeem` → `process_withdrawals` → `claim_redeem` full cycle on basket vault

### Property / Fuzz
- [ ] Property: `convertToShares(convertToAssets(s)) ≈ s` within rounding across basket
- [ ] Fuzz: weight arrays summing to 10_000 with random distributions (including corner cases `[10000,0,0,0]` and `[2500,2500,2500,2500]`)
- [ ] Fuzz: per-leg NAV ranges 1 wei ↔ max u64 with bounded slippage

### Cross-system E2E
- [ ] Devnet smoke extension: all shipped ixs + `deposit_basket` + `redeem_basket` + `rebalance` + `update_nav` with 4-leg array
- [ ] Load test on devnet: 100 concurrent deposits into AWY basket

---

## Audits
- [ ] Phase 1 — Neodyme office hours (Week 1, free; AWY basket scope)
- [ ] Phase 2 — OtterSec compressed review (Week 2, $3–5K) — scope MUST include basket ixs + Jupiter CPI surface + transfer hook
- [ ] Phase 3 — Immunefi bug bounty ($50K–$250K tiers) live at AWY mainnet launch
- [ ] Phase 4 — Full system audit Trail of Bits or Zellic at TVL >$1M ($30–50K)
- [ ] Phase 5 — Quarterly reassessments ($5–10K each)

---

## Monorepo scaffolding (shipped)
- [x] `kdo.toml` updated for polyglot (web / programs / contracts / keepers / sdk)
- [x] `programs/` — Anchor workspace with skeletons for `fdn_vault_compute` + `fdn_transfer_hook`
- [x] `contracts/` — Foundry workspace stub for `FdnSpcVault.sol` (backlog — GAIB-only)
- [x] `keepers/` — TS package stubs for nav / batch / queue / monitor
- [x] `sdk/` — shared TS client library stub
- [x] `tests-integration/` — cross-chain E2E harness directory
- [x] Root bun workspace wired (`workspaces: [sdk, keepers/*, tests-integration]`)
- [x] Dependency versions pinned (= exact) for supply-chain determinism
- [x] Workspace clippy lints (`arithmetic_side_effects`, `unwrap/expect/indexing/panic` denied)
- [x] `dev` + `release` profiles: `overflow-checks = true`
- [ ] `anchor keys sync` on first AWY devnet deploy — pin real program IDs per cluster

### Instruction Accounts contexts (shipped)
All 11 ix split into `src/instructions/{name}.rs` with proper Anchor `Accounts` validation:
- [x] `initialize`, `pause`, `unpause`, `deposit`, `redeem`, `request_redeem`, `process_withdrawals`, `claim_redeem`, `update_nav`, `harvest_fees`, `drain_managed`
- [x] `VaultState::SPACE` / `ShareLockup::SPACE` / `RedeemRequest::SPACE` — hand-computed on-chain size constants
- [x] `init-if-needed` scoped to `fdn_vault_compute` crate only (safety note in Cargo.toml: ShareLockup is per-user-seeded, no cross-user attack vector)

### Core vault modules (shipped)
- [x] `math.rs` — `assets_to_shares` / `shares_to_assets` / `compute_nav_per_share` with virtual offset 1e6/1e6, `apply_twap` (70/30), `check_nav_bounds` (+5%/-2%), `check_nav_floor`, fee helpers, `split_deposit_to_buffer`. All u128-intermediate, checked, round-down. 10 unit tests.
- [x] `invariants.rs` — `check_all` (I1 supply, I2 asset-backing, I3 NAV floor) + `enforce` helper that pauses + emits on violation
- [x] `access.rs` — `require_admin` / `require_operator` / `require_pause_guardian` / `require_not_paused`
- [x] `rate_limit.rs` — `maybe_advance_epoch` + `consume` with unit tests (epoch cap 10%, auto-advance after 24h, rejects over-cap)
- [x] `state.rs` — `VaultState` / `ShareLockup` / `RedeemRequest` layouts
- [x] `events.rs` — all 13 shipped events
- [x] `errors.rs` — 21 shipped error codes
- [x] `constants.rs` — all ADR-004 default params

---

## Milestones — AWY Launch Plan (3-week target)

### Week 1 — Program basket extensions
- [ ] VaultState basket fields + `SPACE` update; `anchor build` green
- [ ] `deposit_basket`, `redeem_basket`, `rebalance` handlers with invariant enforcement
- [ ] Jupiter CPI helper with program-ID whitelist + post-swap balance-delta check
- [ ] `update_nav` accepts `[u64; 4]` with per-leg bounds check
- [ ] New errors + events; unit tests all green
- [ ] Devnet redeploy of `fdn_vault_compute` with `anchor keys sync`; `fdnAWY` vault initialized with 4 devnet-mock underlyings
- [ ] Smoke: `deposit_basket(100 USDC)` produces per-leg holdings matching weights ±50 bps slippage

### Week 2 — Integrations, keepers, frontend detail page
- [ ] 4 TS integration clients (`onyc.ts`, extend `kamino.ts` for PRIME, `maple.ts`, `ondo.ts`) + shared `jupiter.ts`
- [ ] Extend `/api/strategies` route to emit AWY composition block
- [ ] Add `fdnAWY` to `FOUNDATION_VAULTS` (status `coming_soon`); protocol union widened; logo added
- [ ] AWY detail page with **Composition** tab + deposit/redeem previews
- [ ] NAV Keeper, Rebalance Keeper, Redemption Keeper implementations (replaces current stubs)
- [ ] Monitor extended with AWY alerts
- [ ] Devnet E2E: browser → connect → `deposit_basket` → UI reads live per-leg balances → `redeem_basket` → receipt

### Week 3 — Audit, mainnet beta
- [ ] OtterSec findings addressed; re-run full test suite; Neodyme follow-up closed
- [ ] Devnet load test: 100 concurrent `deposit_basket`, rebalance cycle, invariant stress
- [ ] Mainnet deploy: `fdn_vault_compute` (upgradeable behind Squads 48h timelock), `fdn_transfer_hook` (immutable after deploy), `fdnAWY` vault with `awyUSD` mint
- [ ] Squads 3-of-5 wired as upgrade authority; pause guardians verified separate from signers (S8)
- [ ] Initialize with $10K seed, $50K deposit cap
- [ ] 4 keepers live on production infra (dedicated server, not laptop)
- [ ] PagerDuty / Slack alerts wired; transparency page live
- [ ] 72h continuous watch (NAV stable, per-leg drift bounded, no invariant flags)
- [ ] Ramp cap: $50K → $250K after clean watch; then $1M at Week 4–6 on sustained stability
- [ ] Immunefi bug bounty page live at launch ($50K–$250K tiers)
- [ ] Colosseum submission with live mainnet metrics
- [ ] Investor update broadcast; pre-seed close

### Exit criteria (end of Week 3)
- AWY vault live on Solana mainnet with ≥ $250K TVL cap
- All 3 base invariants + 5 AWY-specific checks enforced on every state-changing ix
- OtterSec review closed, zero critical findings open
- 4 keepers running on production infra
- Frontend deposit/redeem/composition UX live at production URL
- Per-leg NAV feeds stable for 72h with zero stall events

### External dependencies (AWY-specific)
- [ ] Jupiter swap reliability on all 4 pairs (USDC↔ONyc, USDC↔PRIME, USDC↔syrupUSDC, USDC↔USDY) — monitor route depth weekly
- [ ] Per-leg oracle feeds (Kamino reserves for ONyc/PRIME, Maple rate for syrupUSDC, Ondo NAV oracle for USDY)
- [ ] Secondary-market liquidity for USDY on Solana (primary mint lockup 40–50d means MVP is secondary-only)

---

## Post-MVP — UX & distribution enablers

### Circle User-Controlled Wallets (email / social / PIN login) — post-MVP
**Why:** removes Phantom/Solflare friction that blocks SEA retail onboarding (ADR-003 distribution thesis). Email/Google/Apple/PIN → MPC-backed Solana wallet → deposit USDC without touching seed phrases. Single biggest retail UX unlock.

**Stack:**
- Server SDK: `@circle-fin/user-controlled-wallets` — user/wallet/transaction/webhook management
- Client SDK: `@circle-fin/w3s-pw-web-sdk` — login flows, challenge execution, theme/localization
- Solana support confirmed: `listWallets` accepts `SOL`, `signTransaction` takes base64-encoded tx
- Auth: PIN (no console setup), Email OTP (console config), Social (Google/Apple/Facebook — console config)

**Integration points (future session):**
- [ ] Add `/auth` route to Next.js app with Circle login UI
- [ ] Server route: `POST /api/circle/user` — create user + issue `userToken` (JWT, 60min)
- [ ] Create SOL wallet via `createUserPinWithWallets({ blockchains: ['SOL'] })` (PIN for v0; add email/social later)
- [ ] On deposit: build the Anchor `deposit_basket` tx client-side, encode base64, pass to `signTransaction` → execute via `w3s-pw-web-sdk`
- [ ] Webhook: subscribe to transaction notifications → update Supabase user state
- [ ] Fallback: keep Phantom/Solflare wallet adapter as alternate flow (power users keep direct wallets)

**Deferred:** Developer-Controlled Wallets for keeper hot wallets — the `.keys_vaults/` JSON pattern works fine for v0; revisit once we're scaling keeper infra or have multiple operator keys to rotate.

### Institutional follow-on vaults (90-day horizon)
- [ ] SPC structure for KYC-gated institutional assets (Apollo ACRED, Hamilton Lane SCOPE, Fasanara mF-ONE) via Securitize
- [ ] Foundation KYCs once at institutional level; issues permissionless vault token against ring-fenced holdings
- [ ] First institutional-tier vault candidate: `fdnACRED` (9–12% APY target, Apollo private credit)
- [ ] SAS attestation pattern revisited for tier gating (optional, not MVP)

---

## Backlog — GAIB / Ethereum SPC / Cross-Chain (paused 2026-04-22)

> **Status:** Paused 2026-04-22. AWY does not depend on any of this work. Preserved for fdnGAIB / USD.AI follow-on vaults once AWY is live and stable. If GAIB whitelist closes or USD.AI goes live, revisit this section to wire the existing single-asset program to an Ethereum SPC.

### GAIB launch — original Week 1/2 plan
- [ ] Write `FdnSpcVault.sol` (~250 lines) with pre-committed `EMERGENCY_RECIPIENT` constant
- [ ] Foundry test suite (subscribe/unstake/bridge paths)
- [ ] Deploy to Sepolia; Gnosis Safe 3-of-5 set as admin
- [!] GAIB whitelist confirmation in writing (Eugene → Ramon) — **hard blocker**
- [ ] CCTP V2 integration via `@circlefin/cctp-sdk` (burn on Solana, mint on ETH, reverse path)
- [ ] LayerZero V2 peer config (Solana ↔ Sepolia) for operational messaging only
- [ ] NAV keeper (Pyth pull primary, `convertToAssets` fallback) — cron every 6h
- [ ] Batch keeper (daily 1PM UTC drain → CCTP burn → subscribeToSAID)
- [ ] Queue keeper (on-demand unstake → CCTP bridge-back → process_withdrawals)
- [ ] Titan mint/redeem adapter wired
- [ ] P0 devnet liquidation dry-run — required pre-mainnet
- [ ] Pyth sAID/USD feed request submitted to contributors

### Ethereum: `FdnSpcVault.sol` (ADR-004 §Ethereum SPC Contract)
- [ ] `subscribeToSAID(uint256)` — approve GAIB mint, mint AID, stake to sAID (operator only)
- [ ] `unstakeAndRedeem(uint256)` — unstake sAID → AID → USDC via GAIB (operator only)
- [ ] `bridgeUsdcToSolana(uint256)` — CCTP V2 primary, Stargate V2 fallback (operator only)
- [ ] `lzReceive(Origin, bytes)` — OFTReceiver; validates source chain+sender
- [ ] `emergencyWithdraw()` — Gnosis Safe 3-of-5 only
- [ ] Reentrancy guard on all entrypoints
- [ ] No proxy — immutable contract
- [ ] Operator whitelist: GAIB mint, sAID, CCTP TokenMessenger, Stargate, LZ Endpoint
- [ ] Gnosis Safe 3-of-5 deployed; hardware wallet signers
- [ ] SPC whitelisted by GAIB mint contract (blocker — Eugene/Ramon)

### Cross-Chain Bridge (ADR-004 §Cross-Chain Bridge Design)
- [ ] CCTP V2 Solana → Ethereum flow (burn on TokenMessenger → attestation → mint on Ethereum)
- [ ] CCTP V2 Ethereum → Solana flow (SPC `depositForBurnWithCaller` → attestation → mint to buffer)
- [ ] Stargate V2 fallback path (triggered on >5min Circle outage or CCTP pause)
- [ ] Keeper health check: monitors Circle attestation API and Stargate pool utilization
- [ ] LayerZero V2 operational messaging:
  - [ ] `MSG_DEPLOY_USDC`, `MSG_REDEEM_REQUEST`, `MSG_EMERGENCY` (Solana→ETH)
  - [ ] `MSG_NAV_UPDATE`, `MSG_BUFFER_REFILL` (ETH→Solana)
- [ ] DVN set: LayerZero Labs + Google Cloud (2 DVNs for v0; upgrade to 3 at $1M TVL)

### Institutional Verification: SAS (ADR-004 §Institutional Verification) — deferred
- [ ] Register schema `fdn:institutional-lp` (entity_name, jurisdiction, kyb_provider, verification_date, expiry, tier)
- [ ] Register schema `fdn:kyb-complete` (entity_name, provider, verification_hash, verified_at, expires_at)
- [ ] Foundation issuer key (compliance operator; separate from vault operator)
- [ ] Vault program: optional `load_attestation` + `require!(valid && !expired && !revoked)` in `deposit`
- [ ] SDK integration for issuance/renewal/revocation (`@nicetransition/sas-lib`)
- [ ] First institutional-tier vault: `fdnGAIB-Institutional` or `fdnACRED-Institutional` — post-AWY

### GAIB open dependencies (external blockers)
- [!] GAIB ships sAID OFT on Solana (ADR-003 §2.5) — if slips past Week 3, pivot to USD.AI
- [!] GAIB whitelists Foundation SPC address on mint contract — owner: Eugene
- [!] Pyth contributors add sAID/USD feed — fallback to operator-only with tighter bounds if unavailable
- [!] Squads v4 production readiness — fall back to v3 same 3-of-5 if needed
- [!] P0 listing agreement — if slips past Week 6, list on Kamino/Drift as interim loop venue

### Revisit triggers (ADR-004 §Consequences)
- GAIB sAID-on-Solana slips past Week 3 → pivot first GAIB vault to USD.AI
- CCTP V2 reliability issues first 30 days → promote Stargate V2 to primary temporarily
- TVL >$10M within 30 days → accelerate full Trail of Bits audit
- Transfer hook audit flags unacceptable reentrancy → switch to in-program lockup
- SAS adoption low → evaluate Civic Pass frontend over SAS backend
