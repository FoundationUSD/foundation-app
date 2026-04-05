# Foundation — TODO

Last updated: 2026-04-05

---

## Done

- [x] Squads multisig infrastructure (propose → approve → execute)
- [x] Token-2022 interest-bearing receipt tokens (soloUSD, kmnoUSD, oroUSD, driftUSD)
- [x] Deposit API — verifies on-chain USDC transfer, mints receipt tokens
- [x] Withdraw API — verifies burn tx, transfers USDC back
- [x] Cron: sync-state — monitors vault USDC balances, token supply, backing ratio
- [x] Cron: update-rate — fetches APY, updates Token-2022 interest rate via Squads
- [x] 0.005 SOL protocol fee on every deposit/withdraw (sent to vault authority)
- [x] Squads rentCollector set on all 3 multisigs (solomon, kamino, oro)
- [x] Rent reclaim working — reclaimed 0.134 SOL from 32 past transactions
- [x] Rent reclaim fix in squads.ts — added delay + error logging
- [x] Text visibility fix — muted-foreground #4d5e74 → #8a9bb5, removed opacity modifiers
- [x] Token naming — soloUSD, kmnoUSD, oroUSD, driftUSD
- [x] NEXT_PUBLIC build args in Dockerfile + fly.toml for prod deployment
- [x] Eugene's stuck 100 USDC deposit minted (wallet: 26Uzc...)
- [x] Wallet 2's stuck 0.1 USDC deposit minted (wallet: 3Mp5A...)
- [x] Kamino integration — `buildKaminoDepositTx()` and `buildKaminoWithdrawTx()` built (NOT wired)
- [x] Solomon integration — read-only helpers (exchange rate, share math, PDA derivation)
- [x] Drift integration — vault data fetching, APY parsing, deposit tx building (NOT wired)

---

## P0 — Capital Deployment

USDC sits idle in vaults after deposit. Must auto-deploy into protocols.

### Solomon (soloUSD)
- [ ] Jupiter swap: USDC → USDv after deposit
  - `@jup-ag/api` in package.json, never imported
  - Build swap tx, execute via Squads, 0.5% max slippage
- [ ] Stake USDv → sUSDV via Solomon program
  - solomon.ts has read helpers, needs `buildStakeTx()`
  - Program: `HSnn7bDvkZSEwujZDPtUcdo9KL7Conycgmy8m6mBFD5`
- [ ] Unstake sUSDV → USDv → USDC on withdrawal
  - 7-day cooldown — track and show to user
  - Jupiter swap USDv → USDC after cooldown
- [ ] Wire into `/api/deposit`: mint soloUSD → deploy USDC → USDv → sUSDV

### Kamino (kmnoUSD)
- [ ] Call `buildKaminoDepositTx()` after mint — function EXISTS, never called
  - Execute built tx via Squads
  - Market: `CqAoLuqWtavaVE8deBjMKe8ZfSt9ghR6Vb8nfsyabyHA`
- [ ] Call `buildKaminoWithdrawTx()` on burn — function EXISTS, never called
- [ ] Wire into `/api/deposit` and `/api/withdraw`

### Oro (oroUSD)
- [ ] GRAIL API integration — nothing exists
  - No SDK, no API, no tx building
  - Need: USDC → $GOLD purchase via GRAIL
  - Need: $GOLD staking for leasing yield (Monetary Metals)
- [ ] Fix gold price feed — hitting DEVNET endpoint, broken on mainnet
- [ ] Withdrawal: unstake $GOLD → sell → USDC
- [ ] Mark vault as "coming_soon" until integration is complete — currently "live" with zero functionality

### Drift (driftUSD)
- [ ] Already "coming_soon", lower priority
- [ ] `/api/drift/deposit/route.ts` builds unsigned txs, never executes them
- [ ] No withdrawal/redemption logic
- [ ] Verify Gauntlet RWA vault addresses before launch

---

## P1 — Post-Deposit Verification

Currently mints receipt tokens immediately on USDC arrival. Should only confirm after capital is deployed.

- [ ] Add "pending" deposit state — user sees "deploying capital..."
- [ ] Mint receipt tokens only after protocol deployment confirms
- [ ] Solomon: verify sUSDV position before confirming
- [ ] Kamino: verify USDC in Kamino reserve before confirming
- [ ] Oro: verify $GOLD purchase before confirming
- [ ] Retry queue if deployment fails (max 3 attempts, alert team)

---

## P2 — Position Monitoring

No vault tracks whether protocol positions match minted supply.

- [ ] Cron job: compare minted supply vs actual protocol position vs idle USDC
- [ ] Alert if minted supply > position value (undercollateralized)
- [ ] Alert if USDC idle in vault > 10 min
- [ ] Internal dashboard for vault health

---

## P3 — Rate Accuracy

- [ ] Solomon APY hardcoded `12.5` — fetch live from Solomon API
- [ ] Oro APY hardcoded `3.5` — need live feed from GRAIL
- [ ] Kamino APY fetch works but rate update tx sometimes fails silently
- [ ] Token-2022 interest rate should match actual earned yield, not target

---

## Current State

| Vault   | Token    | Status      | USDC in Vault | Deployed | Real Yield | Integration |
|---------|----------|-------------|---------------|----------|------------|-------------|
| Solomon | soloUSD  | live        | 100 USDC      | 0 (idle) | NO         | Read-only   |
| Kamino  | kmnoUSD  | live        | 0             | 0        | NO         | Tx builders exist, not wired |
| Oro     | oroUSD   | live (bad)  | 0             | 0        | NO         | Nothing built |
| Drift   | driftUSD | coming_soon | N/A           | N/A      | NO         | Read + deposit tx builder |

Authority: `4J9mszyDLi4js4rh8Hq5spNaLCNt4fRozr781zcVBYgv` — ~0.057 SOL
