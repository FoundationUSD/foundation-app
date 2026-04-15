# Foundation Vault Infrastructure — Execution Tracker

**Source of truth:** `../dataroom/solana/ADR-004-vault-architecture.md` (engineering blueprint) and `../dataroom/solana/ADR-003-compute-rwa-solana.md` (scope and rationale).
**First instance:** `fdnGAIB` wrapping GAIB's sAID.
**Target:** $30M+ TVL, institutional-grade, Colosseum submission Week 6.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Security Review — 2026-04-14

Applied during scaffolding pass. Every finding below links to a mitigation or an open TODO.

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| S1 | `init-if-needed` Anchor feature enables re-initialization attacks when seeds are reused | high | [x] Removed from workspace deps; must be enabled per-ix with audit note if genuinely needed |
| S2 | Placeholder program IDs in `declare_id!` and Anchor.toml are not real keypairs | medium | [ ] Run `anchor keys sync` on first devnet deploy; pin real IDs in Anchor.toml per cluster |
| S3 | `high_water_mark` initialized to 0 triggers false perf fee on first NAV update | high | [ ] Initialize to `NAV_FLOOR` (1_000_000) in `initialize` ix |
| S4 | Rate-limit epoch does not auto-advance — `redeemed_this_epoch` would grow unbounded | high | [x] `rate_limit::maybe_advance_epoch` rolls epoch before every redeem; unit-tested |
| S5 | SAS `attestation_schema/issuer` must only be read when `requires_attestation = true` | medium | [ ] Guard clause in `deposit` — only load SAS account when flag set |
| S6 | Events emitting `Vec<u64>` are unbounded — could OOM the validator log | low | [ ] Enforce `MAX_WITHDRAWALS_PER_BATCH = 10` before `emit!` in `process_withdrawals` |
| S7 | No workspace-wide clippy lints; silent math bugs possible | medium | [x] Added `arithmetic_side_effects = deny`, `unwrap/expect/indexing/panic = deny` to workspace |
| S8 | Pause authorities must be **separate keys from Squads 3-of-5 signers** — overlap collapses defense-in-depth | high | [ ] Document in ops runbook; verify signer key fingerprints before mainnet initialize |
| S9 | `.env.local` at repo root holds vault secrets; keepers must not inherit them | high | [ ] Create per-keeper `.env` with minimum-privilege hot-wallet keys; never mount repo root env into keeper containers |
| S10 | `emergencyWithdraw` destination must be pre-committed on deploy (Bybit-style UI injection defense) | high | [ ] Hardcode `immutable address EMERGENCY_RECIPIENT` in SPC constructor; no runtime override |
| S11 | Share math: u128 intermediates, checked ops, round-down toward vault | critical | [x] `math::assets_to_shares`, `shares_to_assets`, `compute_nav_per_share` with 10 unit tests covering inflation attack, round-trip, bounds |
| S12 | Transfer hook `execute` writes dest lockup — needs writable PDA in `ExtraAccountMetaList` | critical | [ ] Write `initialize_extra_account_meta_list` with source+dest `ShareLockup` PDA metas (dest writable) |
| S13 | Cargo profiles: `dev` lacked `overflow-checks` → tests could pass with silent overflow | medium | [x] `overflow-checks = true` on both `dev` and `release` profiles |
| S14 | Dependency versions not pinned — supply-chain drift risk (see `@solana/web3.js` CVE-2024-54134) | medium | [x] All workspace deps pinned with `=` exact version |
| S15 | No `InvariantViolation` auto-pause helper — every ix would re-implement it inconsistently | high | [x] `invariants::enforce` pauses in-place, emits event, returns mapped error |

### Security gates still open (tracked below in component sections)
- Formal OtterSec review of `fdn_transfer_hook` reentrancy surface (Week 4)
- Neodyme office-hours review of full vault program (Week 1)
- Fuzz harness for share math with 1-wei ↔ max-u64 edge cases (Week 4)
- Immunefi bug bounty program ($50K–$250K) live at launch
- Signer-key fingerprint verification procedure documented for Squads 3-of-5

---

## Milestones — Compressed 2-Week Plan (supersedes ADR-003 §10)

**Compression rationale:** ADR-003 spec'd 6 weeks. We're doing 2. This requires:
- Parallel tracks (contracts + keepers + frontend run concurrently, not sequentially)
- Neodyme office hours scheduled in parallel with build — not after
- OtterSec compressed scope (vault + hook only, ~3-day turnaround) instead of full-system review
- Tighter post-deploy watch (24h instead of 72h) before first cap ramp
- GAIB whitelist + Pyth feed must close by end of Week 1 or Week 2 slips
- SAS gating deferred (post-MVP); institutional tier lands after launch
- Stargate V2 fallback deferred; CCTP V2 only at launch (accept Circle single-point-of-failure for v0)

**Risk:** If any external blocker (GAIB whitelist, Pyth feed, P0 listing) doesn't close in Week 1, Week 2 mainnet slips by that duration.

---

### Week 1 — Build everything in parallel (Days 1–7)

**Track A — Solana programs (Days 1–4)**
- [x] `initialize` ix — **fully implemented**: VaultState init + Token-2022 share mint creation via `create_share_mint` helper (MetadataPointer + TransferHook extensions), HWM=NAV_FLOOR, virtual offset locked, constraint binds `transfer_hook_program` to the canonical `FDN_TRANSFER_HOOK_PROGRAM_ID`
- [x] `initialize_token_accounts` ix — **new second-phase ix**: creates `buffer_usdc` (SPL Token USDC, PDA-owned), `managed_usdc` (SPL Token USDC, PDA-owned), `fee_treasury` (Token-2022 share account, PDA-owned). Idempotent via `TokenAccountsAlreadySet` guard.
- [x] Token-2022 share mint creation helper (`src/token.rs`) — system allocate → MetadataPointer init → TransferHook init → initialize_mint2 with PDA signer; MintAuthority=vault_authority PDA, FreezeAuthority=None
- [x] `pause` + `unpause` — fully implemented with access control, events, idempotent pause
- [x] `deposit` ix — **fully wired**: SAS guard + virtual-offset math + buffer/managed split + SPL USDC transfers + Token-2022 `mint_to` with vault_authority PDA signer + lockup refresh + invariant enforcement at end
- [x] `redeem` ix — **fully wired**: not-paused + queue-mode + lockup check + `rate_limit::consume` + buffer sufficiency + Token-2022 burn + SPL USDC transfer with PDA signer + nav recompute + invariant enforcement
- [x] `fdn_transfer_hook::execute` — **fully wired via Anchor `fallback` dispatch**: unpacks Token-2022 interface-compliant discriminator, reads source `ShareLockup` by offset (avoids circular dep), enforces `now >= locked_until`. ~100 LOC total.
- [x] `fdn_transfer_hook::initialize_extra_account_meta_list` — declares 1 extra: source lockup PDA derived via `[b"share_lockup", vault_literal, owner_key]` seeds. Vault pubkey baked in as Seed::Literal at init time.
- [x] `request_redeem` — **fully wired**: lockup check + Token-2022 `transfer_checked` (redeemer→redeem_escrow, hook fires) + RedeemRequest PDA init with monotonic request_id + `next_request_id` increment
- [x] `process_withdrawals` — **fully wired**: operator gate + status Pending check + `shares_to_assets` + buffer sufficiency + Token-2022 burn from escrow (PDA signs) + SPL USDC transfer buffer→pending_claims (PDA signs) + mark Claimable + NAV recompute + invariants. Note: v0 processes 1 req/ix (keeper batches client-side; simpler to audit)
- [x] `claim_redeem` — **fully wired**: status Claimable check + SPL USDC transfer pending_claims→redeemer (PDA signs) + mark Completed (idempotent)
- [x] `harvest_fees` — **fully wired**: `compute_management_fee_shares` + `compute_performance_fee_shares` + Token-2022 `mint_to` fee_treasury (PDA signs) + HWM update on upward NAV only + `last_fee_harvest` timestamp
- [x] `drain_managed` — **fully wired**: operator gate + not-paused + amount-sufficiency + SPL USDC transfer managed→destination (PDA signs) + event. total_assets NOT decremented (funds still Foundation-owned post-bridge)
- [x] `initialize_token_accounts` — **extended** to create `redeem_escrow` (Token-2022 share) + `pending_claims_usdc` (SPL USDC) PDAs; 5 accounts total per one tx
- [x] VaultState — added `redeem_escrow`, `pending_claims_usdc`, `redeem_escrow_bump`, `pending_claims_bump` fields; SPACE updated
- [x] `update_nav` — **fully wired, operator-only path**: operator gate + non-empty oracle_proof + 26h staleness cap + `check_nav_bounds` (±5%/-2% TWAP) + inline fee harvest using PRE-update NAV (HWM compared against old price, not new) + `apply_twap` (70/30) + `check_nav_floor` auto-pause w/ `InvariantViolation` event + commit. `oracle_source = 1` (operator). **Pyth cross-check deferred** to v1 when `pyth-solana-receiver-sdk` gets Anchor 0.31 compat — wire shape stable (oracle_proof arg accepted, v1 will verify signature + confidence ≤0.5% + staleness ≤60s without accounts-context change)
- [ ] Destination lockup propagation in transfer hook (v1 — v0 enforces source-only, which blocks the primary "deposit → transfer → redeem" arb)
- [ ] Account-level CPI Guard + Immutable Owner helpers for user-created share token accounts (not mint-level extensions; applied when user creates their share ATA)
- [ ] 50+ Anchor tests + fuzz harness on math (1 wei → max u64) — 17 unit tests green today
- [x] Devnet keypairs generated (`2PLMStk5...`, `3hBtJLsk...`, deployer `ABQADtDr...`)
- [x] **Devnet deployment live + smoke test passed** (2026-04-15):
  - `fdn_vault_compute` → `2PLMStk5P2GNKMH3ciK7N62wifwZZL9fmjcef4S7Ezop` (upgraded with Box-heap fix for stack frame overflow)
  - `fdn_transfer_hook` → `3hBtJLskNbhbdzjA8imqiR9uaWMKrvUEiwseenAwgCTs`
  - Mock USDC mint: `9dsc8YzHtcEMVPRiKeVj3BXcFgUBeHkm7MYRGrEJ6HSg` (SPL Token legacy, 6 decimals)
  - Smoke vault `fdnSMOKE`: `5XXkck1uRmz2QUYg3Ta69ptS7tZa1fo1dbeY33RpANSc`
  - Share mint PDA: `2L44XLVE8d6eH2m3tUz8keYotft88K5T2zyVzBbP5tmp` (Token-2022 w/ MetadataPointer + TransferHook)
- [x] **Ixs verified on devnet:** `initialize`, `initialize_token_accounts`, `deposit`, `pause`, `unpause`
- [x] **On-chain invariants verified:** `nav_per_share = 1_000_000` ($1.00), `high_water_mark = 1_000_000` (S3 fix confirmed), `virtual_assets = virtual_shares = 1_000_000` (inflation protection)
- [x] **Deposit flow verified end-to-end (devnet tx `4gDgbRUHcs7S...`):**
  - 50 USDC deposit → exactly 50M shares minted (first-depositor 1:1 with virtual offset)
  - Buffer split: 7.5 USDC to buffer (15%) + 42.5 USDC to managed (85%) — matches `BUFFER_TARGET_BPS` exactly
  - NAV held at $1.00, lockup set to `now + 86399s` (~24h)
  - total_assets = total_supply = 50M (invariant preserved)
- [x] **Negative paths verified on live devnet:**
  - Redeem during 24h lockup → **blocked** with `LockupActive` (arb shield enforced)
  - Deposit while vault paused → **blocked** with `VaultPaused` (pause gate enforced)
- [x] Devnet SECURITY FINDING FIXED (second round): stack frame overflow also hit `deposit` — applied `Box<>` preemptively to ALL heavy handlers (`deposit`, `redeem`, `request_redeem`, `process_withdrawals`, `claim_redeem`, `harvest_fees`, `drain_managed`, `update_nav`). Auditor note added in-code.
- [x] Smoke test script with idempotent re-runs: `tests-integration/scripts/devnet-smoke.ts` (`bun run tests-integration/scripts/devnet-smoke.ts`)
- [ ] Extend smoke: transfer hook `initialize_extra_account_meta_list`, redeem after 24h wait, request_redeem + process_withdrawals + claim_redeem queue cycle, harvest_fees, drain_managed, update_nav

**Track B — Ethereum SPC (Days 1–3)**
- [ ] Write `FdnSpcVault.sol` (~250 lines) with pre-committed `EMERGENCY_RECIPIENT` constant
- [ ] Foundry test suite (subscribe/unstake/bridge paths)
- [ ] Deploy to Sepolia; Gnosis Safe 3-of-5 set as admin
- [ ] GAIB whitelist confirmation in writing (Eugene → Ramon) — **hard blocker for Week 2**

**Track C — Cross-chain + Keepers (Days 3–6)**
- [ ] CCTP V2 integration via `@circlefin/cctp-sdk` (burn on Solana, mint on ETH, reverse path)
- [ ] LayerZero V2 peer config (Solana ↔ Sepolia) for operational messaging only
- [ ] NAV keeper (Pyth pull primary, `convertToAssets` fallback) — cron every 6h
- [ ] Batch keeper (daily 1PM UTC drain → CCTP burn → subscribeToSAID)
- [ ] Queue keeper (on-demand unstake → CCTP bridge-back → process_withdrawals)
- [ ] Monitor with all alerts from ADR-004 alert table

**Track D — Frontend + P0 (Days 4–7)**
- [ ] Extend existing aggregator UI to show fdnGAIB (deposit, redeem, queue status, 24h lockup countdown)
- [ ] Queue-mode disclosure in redeem UX
- [ ] Titan mint/redeem adapter wired
- [ ] P0 devnet liquidation dry-run — required pre-mainnet

**Track E — Security (parallel, Days 1–7)**
- [ ] Neodyme office hours scheduled for Day 3–4 (free; feedback informs Days 5–7)
- [ ] OtterSec compressed-scope engagement booked for Day 5–7 (vault + hook only, $3–5K)
- [ ] Pyth sAID/USD feed request submitted to contributors Day 1

### Week 2 — Test, audit-fix, ship mainnet (Days 8–14)

**Days 8–9 — Audit-fix + load test**
- [ ] OtterSec findings addressed; re-run full test suite
- [ ] Neodyme follow-up items closed
- [ ] Devnet load test: 100 concurrent deposits, queue-mode cycle, invariant stress
- [ ] Cross-chain E2E on devnet+Sepolia end-to-end proven green

**Days 10–11 — Mainnet beta**
- [ ] Deploy vault + hook + SPC immutable (hook upgrade-auth revoked in same tx)
- [ ] Squads 3-of-5 wired as vault upgrade authority with 48h timelock
- [ ] Pause guardians verified as keys **separate from Squads signers**
- [ ] Initialize fdnGAIB with $10K seed, deposit cap $10K
- [ ] All 4 keepers live on production infra (dedicated server, not laptop)
- [ ] Monitor + alerting wired to PagerDuty / Slack

**Day 12 — Clean-ops watch**
- [ ] 24h continuous observation (reduced from ADR's 72h) — NAV stable, buffer healthy, no invariant flags
- [ ] Ramp deposit cap to $50K if clean

**Days 13–14 — Ship + pitch**
- [ ] Ramp deposit cap to $100K
- [ ] Submit to Colosseum hackathon with live mainnet metrics
- [ ] Immunefi bug bounty page goes live ($50K–$250K tiers)
- [ ] Investor update broadcast
- [ ] Eugene opens USD.AI conversation using live product as proof

### Exit criteria (end of Week 2)

- fdnGAIB vault live on Solana mainnet with >= $100K TVL cap
- All 3 invariants checked on every ix, auto-pause proven on devnet
- OtterSec review closed out, no critical findings open
- 4 keepers running on production infra
- Frontend deposit/redeem/queue UX live at production URL
- Colosseum submission complete

---

## Solana: `fdn_vault_compute` (ADR-004 §Solana Vault Program)

### State design
- [ ] `VaultState` PDA — seeds `[b"vault", asset_symbol]`
  - [ ] Identity (admin, operator, asset_symbol, underlying_kind)
  - [ ] Token refs (usdc_mint, share_mint, buffer_usdc, managed_usdc)
  - [ ] NAV state (total_assets, total_supply, nav_per_share, last_nav_update, nav_twap)
  - [ ] Virtual offset (virtual_assets=1e6, virtual_shares=1e6 — immutable)
  - [ ] Buffer params (buffer_target_bps=1500, buffer_minimum_bps=500, queue_mode)
  - [ ] Security (share_lockup_seconds=86400, max_redeem_per_epoch_bps=1000, epoch_start, redeemed_this_epoch, paused, pause_authorities[3], deposit_cap)
  - [ ] Fee state (management_fee_bps=50, performance_fee_bps=1000, high_water_mark, fee_treasury, last_fee_harvest, pending_mgmt_fee, pending_perf_fee)
  - [ ] Upgrade governance (upgrade_authority=Squads, timelock_seconds=172800)
  - [ ] SAS fields (requires_attestation, attestation_schema, attestation_issuer)
  - [ ] PDA bumps
- [ ] `ShareLockup` PDA — seeds `[b"share_lockup", vault, user]`
- [ ] `RedeemRequest` PDA — seeds `[b"redeem_request", vault, user, request_id]`
- [ ] `FeeTreasury` PDA — seeds `[b"fee_treasury", vault]`

### Instructions (9)
- [ ] `initialize(params)` — admin only; creates VaultState, ShareMint (Token-2022 with CPI Guard + MetadataPointer + Immutable Owner + TransferHook), buffer/managed accounts. Sets virtual offset. Emits `VaultInitialized`.
- [ ] `deposit(amount)` — user pays USDC, receives shares via virtual-offset formula. Splits to buffer (up to target) and managed. Updates ShareLockup to `now + 86400`. Enforces deposit_cap. Runs 3 invariants. Emits `Deposit`. Optional SAS check if `requires_attestation`.
- [ ] `redeem(shares)` — burn shares, transfer USDC from buffer. Reverts on insufficient buffer / active lockup / rate-limit / paused. Emits `Redeem`.
- [ ] `request_redeem(shares)` — escrow shares, create RedeemRequest. Used when queue_mode or buffer insufficient. Emits `RedeemRequested`.
- [ ] `process_withdrawals(request_ids)` — operator only; burn locked shares, fulfill USDC up to 10/tx. Emits `WithdrawalsProcessed`.
- [ ] `claim_redeem(request_id)` — user claims USDC from Claimable request. Emits `RedeemClaimed`.
- [ ] `update_nav(new_nav, oracle_proof)` — operator only; validates Pyth proof ±1%, applies TWAP 70/30, enforces ±5%/-2% bounds, ≤26h staleness, harvests fees first. Emits `NavUpdated`.
- [ ] `harvest_fees()` — accrue mgmt (0.5% annual pro-rata) + perf (10% above HWM) as minted shares to FeeTreasury. Emits `FeesHarvested`.
- [ ] `drain_managed(amount)` — operator only; moves USDC from managed to bridge. Emits `ManagedDrained`.
- [ ] `pause()` — any of 3 guardians; immediate.
- [ ] `unpause()` — admin (Squads) only.

### Invariants (enforced every state-changing ix)
- [ ] I1: `total_supply == share_mint.supply`
- [ ] I2: `buffer_usdc.balance + managed_usdc.balance <= total_assets`
- [ ] I3: `nav_per_share >= 1_000_000` (auto-pause circuit breaker on violation)
- [ ] Violation → `paused = true` + emit `InvariantViolation`

### Events (for keeper/monitor)
- [ ] `VaultInitialized`, `Deposit`, `Redeem`, `RedeemRequested`, `WithdrawalsProcessed`, `RedeemClaimed`, `NavUpdated`, `FeesHarvested`, `ManagedDrained`, `Paused`, `Unpaused`, `InvariantViolation`, `UpgradePending`

---

## Solana: `fdn_transfer_hook` (ADR-004 §Transfer Hook Architecture)
- [ ] Minimal ~80 line Anchor program
- [ ] Loads source `ShareLockup`, rejects if `locked_until > clock.unix_timestamp`
- [ ] Destination inherits `max(dest.locked_until, src.locked_until)`
- [ ] Read-only accounts (Token-2022 enforced)
- [ ] Zero external CPI calls; no callbacks
- [ ] Deploy + immediately revoke upgrade authority (immutable)
- [ ] Formal reentrancy audit (OtterSec / Neodyme)

---

## Token-2022 Share Mint (ADR-004 §Token-2022 Share Token Design)
- [ ] Extensions enabled: CPI Guard, MetadataPointer, Immutable Owner, Transfer Hook
- [ ] Extensions explicitly NOT used: Permanent Delegate, Confidential Transfers, Non-Transferable, Transfer Fee, Default Account State
- [ ] Metadata account wired to `MetadataPointer` (NAV, fees, operator displayed)

---

## Oracle (ADR-004 §Oracle Architecture)
- [ ] Primary: Pyth pull oracle — request sAID/USD feed from Pyth contributors
- [ ] Validate: signature, confidence ≤0.5%, staleness ≤60s
- [ ] Fallback: operator submits NAV (reads `sAID.convertToAssets(1e18)` on Ethereum)
- [ ] TWAP smoothing: `smoothed = 0.7*prev + 0.3*new`
- [ ] Bounds: upper `TWAP * 1.05`, lower `TWAP * 0.98`
- [ ] Staleness cap: 26h → auto-block ops
- [ ] Circuit breaker: `nav_per_share < 1e6` → auto-pause

---

## Ethereum: `FdnSpcVault.sol` (ADR-004 §Ethereum SPC Contract)
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

---

## Cross-Chain Bridge (ADR-004 §Cross-Chain Bridge Design)
- [ ] CCTP V2 Solana → Ethereum flow (burn on TokenMessenger → attestation → mint on Ethereum)
- [ ] CCTP V2 Ethereum → Solana flow (SPC `depositForBurnWithCaller` → attestation → mint to buffer)
- [ ] Stargate V2 fallback path (triggered on >5min Circle outage or CCTP pause)
- [ ] Keeper health check: monitors Circle attestation API and Stargate pool utilization
- [ ] LayerZero V2 operational messaging:
  - [ ] `MSG_DEPLOY_USDC`, `MSG_REDEEM_REQUEST`, `MSG_EMERGENCY` (Solana→ETH)
  - [ ] `MSG_NAV_UPDATE`, `MSG_BUFFER_REFILL` (ETH→Solana)
- [ ] DVN set: LayerZero Labs + Google Cloud (2 DVNs for v0; upgrade to 3 at $1M TVL)

---

## Institutional Verification: SAS (ADR-004 §Institutional Verification)
- [ ] Register schema `fdn:institutional-lp` (entity_name, jurisdiction, kyb_provider, verification_date, expiry, tier)
- [ ] Register schema `fdn:kyb-complete` (entity_name, provider, verification_hash, verified_at, expires_at)
- [ ] Foundation issuer key (compliance operator; separate from vault operator)
- [ ] Vault program: optional `load_attestation` + `require!(valid && !expired && !revoked)` in `deposit`
- [ ] SDK integration for issuance/renewal/revocation (`@nicetransition/sas-lib`)
- [ ] First institutional-tier vault: `fdnGAIB-Institutional` (higher caps, lower fees, `requires_attestation = true`) — post-MVP

---

## Admin & Governance (ADR-004 §Admin and Governance)
- [ ] Squads v4 multisig 3-of-5 deployed on Solana mainnet
- [ ] Signers: Vivek, Eugene, David, Advisor 1, Advisor 2 — all Ledger hardware
- [ ] 48h timelock on: upgrade, change admin/operator, fee params, buffer params, deposit_cap, pause_authorities
- [ ] No timelock: `pause` (any guardian), `unpause` (Squads only)
- [ ] Role separation wired in program: admin vs operator vs 3 pause guardians
- [ ] Two-person rule policy doc for signers (no signer approves own tx)
- [ ] Upgrade flow doc: PR → audit diff → Squads tx → 48h → execute → post-upgrade invariant check

---

## Keeper Infrastructure (ADR-004 §Keeper Infrastructure)
- [ ] **NAV Keeper** (every 6h at 00/06/12/18 UTC)
  - [ ] Pyth pull → submit → program validates
  - [ ] Fallback: read `sAID.convertToAssets(1e18)` on ETH
  - [ ] Alert if >12h gap; program auto-blocks at 26h
- [ ] **Batch Keeper** (daily 1PM UTC)
  - [ ] `drain_managed` → CCTP V2 burn → ETH mint → `subscribeToSAID`
- [ ] **Queue Keeper** (on-demand when queue_mode active)
  - [ ] `unstakeAndRedeem` → CCTP bridge-back → `process_withdrawals`
  - [ ] SLA target 15min, max 1h
- [ ] **Monitor** (real-time)
  - [ ] Buffer low (<8%) / critical (<5%)
  - [ ] NAV stale (13h) / blocked (26h)
  - [ ] TVL drop >15%/1h
  - [ ] Large redemption >5% TVL
  - [ ] Invariant violation (auto-pause trigger)
  - [ ] Upgrade timelock countdown (public event)
- [ ] Operator hot wallet: rate-limited, can only NAV/drain/process

---

## Testing (ADR-004 §Audit Plan)
- [ ] Unit tests: share math with virtual offset (golden values)
- [ ] Property tests: `convertToShares(convertToAssets(s)) ≈ s` within rounding
- [ ] Fuzz: extreme values (1 wei ↔ max u64) on all share math
- [ ] Integration: deposit → lockup → redeem happy path
- [ ] Integration: queue mode full cycle (request → bridge → process → claim)
- [ ] Integration: inflation attack simulation (proves unprofitable with 1e6 offset)
- [ ] Integration: NAV manipulation attempt (TWAP + bounds reject)
- [ ] Integration: transfer hook lockup enforcement
- [ ] Integration: invariant violation → auto-pause
- [ ] Cross-chain E2E on devnet+Sepolia: deposit Solana → subscribe ETH → NAV update → redeem

---

## Audits (ADR-004 §Audit Plan)
- [ ] Phase 1 — Neodyme office hours (Week 1, free)
- [ ] Phase 2 — OtterSec code review (Week 2, $3–5K)
- [ ] Phase 3 — Immunefi bug bounty (launch+1, $50K–$250K rewards)
- [ ] Phase 4 — Full system audit Trail of Bits or Zellic at TVL >$1M ($30–50K)
- [ ] Phase 5 — Quarterly reassessments ($5–10K each)

---

## Monorepo scaffolding (this session)
- [x] `kdo.toml` updated for polyglot (web / programs / contracts / keepers / sdk)
- [x] `programs/` — Anchor workspace with skeletons for `fdn_vault_compute` + `fdn_transfer_hook`
- [x] `contracts/` — Foundry workspace stub for `FdnSpcVault.sol`
- [x] `keepers/` — TS package stubs for nav / batch / queue / monitor
- [x] `sdk/` — shared TS client library stub
- [x] `tests-integration/` — cross-chain E2E harness directory
- [x] Root bun workspace wired (`workspaces: [sdk, keepers/*, tests-integration]`)
- [x] Dependency versions pinned (= exact) for supply-chain determinism
- [x] Workspace clippy lints (`arithmetic_side_effects`, `unwrap/expect/indexing/panic` denied)
- [x] `dev` + `release` profiles: `overflow-checks = true`
- [ ] `anchor keys sync` on first devnet deploy — pin real program IDs per cluster

## Instruction Accounts contexts (implemented this session)
All 11 ix split into `src/instructions/{name}.rs` with proper Anchor `Accounts` validation:
- [x] `initialize` — full handler + Accounts with `init` one-shot-per-asset_symbol via seeds
- [x] `pause` — full handler + `require_pause_guardian` check; idempotent
- [x] `unpause` — full handler + `require_admin` check
- [x] `deposit` — Accounts w/ `init_if_needed` ShareLockup; handler stubbed with ADR-cited TODO steps
- [x] `redeem` — Accounts w/ ShareLockup validation; handler stubbed
- [x] `request_redeem` — Accounts w/ monotonic-counter-seeded RedeemRequest; handler stubbed
- [x] `process_withdrawals` — Accounts + operator gate + batch cap enforced; handler stubbed
- [x] `claim_redeem` — Accounts w/ `has_one` user check; handler stubbed
- [x] `update_nav` — Accounts + operator gate; handler stubbed pending Pyth 0.31 compat
- [x] `harvest_fees` — Accounts (permissionless caller); handler stubbed
- [x] `drain_managed` — Accounts + operator gate; handler stubbed
- [x] `VaultState::SPACE` / `ShareLockup::SPACE` / `RedeemRequest::SPACE` — hand-computed on-chain size constants
- [x] `init-if-needed` scoped to `fdn_vault_compute` crate only (safety note in Cargo.toml: ShareLockup is per-user-seeded, no cross-user attack vector)

## Core vault modules (implemented earlier)
- [x] `math.rs` — `assets_to_shares` / `shares_to_assets` / `compute_nav_per_share` with virtual offset 1e6/1e6, `apply_twap` (70/30), `check_nav_bounds` (+5%/-2%), `check_nav_floor`, `compute_management_fee_shares`, `compute_performance_fee_shares`, `split_deposit_to_buffer`. All u128-intermediate, checked, round-down. 10 unit tests.
- [x] `invariants.rs` — `check_all` (I1 supply, I2 asset-backing, I3 NAV floor) + `enforce` helper that pauses + emits on violation
- [x] `access.rs` — `require_admin` / `require_operator` / `require_pause_guardian` / `require_not_paused`
- [x] `rate_limit.rs` — `maybe_advance_epoch` + `consume` with unit tests (epoch cap 10%, auto-advance after 24h, rejects over-cap)
- [x] `state.rs` — `VaultState` / `ShareLockup` / `RedeemRequest` layouts
- [x] `events.rs` — all 13 events
- [x] `errors.rs` — 21 error codes
- [x] `constants.rs` — all ADR-004 default params

## Instructions to implement (Week 1)
Priority order — each must call `invariants::enforce` as the last step before `Ok(())`.
- [ ] `initialize` — create VaultState; set `virtual_assets = virtual_shares = 1_000_000`; set `high_water_mark = NAV_FLOOR`; set `epoch_start = now`; create Token-2022 share mint with extensions; create buffer + managed + fee_treasury PDAs
- [ ] `deposit` — `access::require_not_paused`, optional SAS check (only if `requires_attestation`), `math::assets_to_shares`, `math::split_deposit_to_buffer`, mint shares, update ShareLockup to `now + 86400`, enforce `deposit_cap`, invariants
- [ ] `redeem` — `access::require_not_paused`, lockup check, `rate_limit::consume`, `math::shares_to_assets`, burn shares, transfer from buffer, invariants
- [ ] `request_redeem` — escrow shares to vault, create RedeemRequest, increment `next_request_id`, invariants
- [ ] `process_withdrawals` — `access::require_operator`, cap batch at 10, fulfill + mark Claimable, invariants
- [ ] `claim_redeem` — transfer fill_amount to user, mark Completed
- [ ] `update_nav` — `access::require_operator`, Pyth proof validate (±1% cross-check, confidence ≤0.5%, ≤60s staleness), `math::apply_twap`, `math::check_nav_bounds`, `math::check_nav_floor`, harvest fees, set `last_nav_update`
- [ ] `harvest_fees` — `math::compute_management_fee_shares` + `math::compute_performance_fee_shares`, mint to FeeTreasury PDA, update `high_water_mark`
- [ ] `drain_managed` — `access::require_operator`, move USDC from managed PDA to bridge source account, invariants
- [ ] `pause` — `access::require_pause_guardian`, set `paused = true`, emit
- [ ] `unpause` — `access::require_admin`, re-check all invariants before resuming

---

## Open dependencies (external blockers)
- [!] GAIB ships sAID OFT on Solana (ADR-003 §2.5) — if slips past Week 3, pivot to USD.AI
- [!] GAIB whitelists Foundation SPC address on mint contract — owner: Eugene
- [!] Pyth contributors add sAID/USD feed — fallback to operator-only with tighter bounds if unavailable
- [!] Squads v4 production readiness — fall back to v3 same 3-of-5 if needed
- [!] P0 listing agreement — if slips past Week 6, list on Kamino/Drift as interim loop venue

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
- [ ] On deposit: build the Anchor `deposit` tx client-side, encode base64, pass to `signTransaction` → execute via `w3s-pw-web-sdk`
- [ ] Webhook: subscribe to transaction notifications → update Supabase user state
- [ ] Fallback: keep Phantom/Solflare wallet adapter as alternate flow (power users keep direct wallets)

**Deferred:** Developer-Controlled Wallets for keeper hot wallets — the `.keys_vaults/` JSON pattern works fine for v0; revisit once we're scaling keeper infra or have multiple operator keys to rotate.

---

## Revisit triggers (ADR-004 §Consequences)
- GAIB sAID-on-Solana slips past Week 3 → pivot first vault to USD.AI
- CCTP V2 reliability issues first 30 days → promote Stargate V2 to primary temporarily
- TVL >$10M within 30 days → accelerate full Trail of Bits audit
- Transfer hook audit flags unacceptable reentrancy → switch to in-program lockup
- SAS adoption low → evaluate Civic Pass frontend over SAS backend
