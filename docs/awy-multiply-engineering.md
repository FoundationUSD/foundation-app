# AWY Multiply through Squads — engineering plan

Status as of 2026-05-09 — **coming_soon**, not live.

## What's already done

- Two leveraged AWY vaults provisioned on Solana mainnet:
  - **AWY 2x** — multisig `8Dh8y3rvVBEd13N3Wg6g32mAj1Tn2xX4wc2PdvvNpcbg`, vault PDA `Aeao3gqixUqoHf6sK8NtL28vixYAzV9z8NueAr8PCpHs`, mint `xDrr8srFUzMNrvcnwAzrgpNxFPGogHtzmPF53RDF6gg` (awy2xUSD)
  - **AWY 3x** — multisig `EidH2fD7gkwT4BFG4hgwK9XzS7LDi38jUir8yV3oBijS`, vault PDA `ErBcSZDpKhGTt8sSPFQCDb91hcFBe8gwSSYzUkLnyxfq`, mint `Fd4wjhmbUoSjtKPScY8yZQfXPNkgugwQxXbjotr8iFVX` (awy3xUSD)
- Token-2022 InterestBearing initialized at 1400 bps (2x) and 2100 bps (3x). Authority is the vault PDA.
- `FoundationVault.leverage` field added; `FOUNDATION_VAULTS` registers `fdn-awy-2x` and `fdn-awy-3x` with `status: "coming_soon"`.
- `VaultName` union extended to `"awy2x" | "awy3x"`. `vaultIdToName` resolves both. `getVaultAddresses()` reads new env vars.
- `setup-vault.ts` accepts `awy2x` / `awy3x`.

## What blocks `live`

Kamino Multiply uses **flash loans** that must execute, swap, deposit collateral, borrow against collateral, and repay the flash — all in a single Solana transaction. The klend SDK function is `getDepositWithLeverageIxs` (in `@kamino-finance/klend-sdk/dist/leverage/operations.d.ts`).

That function requires a `TransactionSigner` from `@solana/kit` (Solana's modern web3.2 API). Our existing Squads pattern is web3.js-based and the vault PDA isn't a `Signer` at all — it's a program-derived address whose authority is the Squads multisig, executed via `vaultTransactionExecute` CPI.

So three integration tasks stack up before this can ship:

### 1. Kit-compatible Squads signer adapter

Build a `TransactionSigner` adapter that:
- Accepts the Squads vault name and a deferred ix list
- Implements `signTransactions` by *not actually signing* — instead, pulls the inner ixs out of the kit transaction, wraps them in a Squads `vaultTransactionCreate / proposalCreate / proposalApprove / vaultTransactionExecute` flow, and returns the executed-tx signature
- The vault PDA is the "owner" the SDK passes everywhere; the actual on-chain signer remains the multisig authority

This is the gnarly bit. The SDK assumes it's building a tx the wallet will sign and submit directly. Squads inserts a propose+execute layer underneath, which means the *outer* tx the user/admin sends is a Squads execute, not the Kamino multiply tx.

### 2. Flash-loan reentrancy through Squads CPI

Klend flash loans require `flash_borrow` and `flash_repay` instructions in the same tx. When wrapped in Squads CPI, the flash loan's reentrancy check needs to see the vault PDA as the borrower throughout. Squads' `vaultTransactionExecute` invokes the inner ixs via `invoke_signed` from the vault PDA, so on paper this works, but it must be verified on-chain.

### 3. Tx-size + account-count budget

A flash-loan multiply tx already pushes the 1232-byte limit. Wrapping the entire ix list inside a Squads vault transaction nearly doubles size (each account in the inner message becomes a full 32-byte pubkey in the executable buffer). Two compounding mitigations:
- **Address Lookup Tables**: Kamino's API returns ALTs for klend ixs (`deserializeTxInstructions` in `deploy-capital.ts` already handles this). Need to pass them through `executeVaultTransaction`'s `addressLookupTableAccounts` param.
- **Split the flash-loan loop into smaller chunks** if a single multiply tx still overflows. Flash loans cannot be split, so if it overflows we have to drop to the iterated-loop approach for v1.

## Likely v1 fallback if (1)–(3) don't all pan out

Iterated klend `/ktx/klend/deposit` + `/ktx/klend/borrow` loop:

- Round 1: deposit USDC → borrow USDC × LTV
- Round 2: deposit borrowed → borrow more
- ... 4–5 rounds converge to ~1.94x at 50% LTV, ~2.71x at 67% LTV
- Each round is one Squads tx (verified `/ktx/klend/borrow` exists and returns structured errors when called against the `Aeao3gq...` vault PDA — see `kamino_endpoints_probed` log in this branch)

This is real on-chain leverage, real obligation, real liquidation. Higher tx fee per deposit (~10 Squads txs at ~$0.05 each = ~$0.50) but it ships without flash-loan/Squads compatibility surgery.

If the proper Multiply integration is blocked for >1 week, fall back to iterated-loop for v1.

## Cron rate update

When a tier becomes live, the cron `update-rate` needs to compute the levered net APY from on-chain obligation state:
- Read PRIME USDC supply APY (already in `getAwyData()`)
- Read PRIME stable borrow APY for the cheapest stable (already in `pickCheapestBorrow()`)
- Read the obligation's `deposited_value`, `borrowed_value`, and infer current LTV
- Net APY = unlevered_blend + (supply_apy − borrow_apy) × leverage_on_prime_slice × prime_weight
- Push to `awy2xUSD` / `awy3xUSD` mints via Token-2022 `update_rate_authority`

## UI

Until live: home grid + AWY page show three product cards (AWY Base / AWY 2x / AWY 3x). The 2x/3x cards show the target APY with a "Coming soon" badge and a waitlist signup. Once live, the slider on `/awy` is removed and replaced with a tier picker that routes deposits to the selected vault.

## Test plan when ready

1. Devnet first: deploy small USDC into AWY 2x. Verify the multiply position opens with collateral_value ≈ 2× deposit, debt_value ≈ 1× deposit.
2. Verify the obligation health factor stays well above 1.0 over the next 24h with live PRIME borrow rate fluctuation.
3. Withdraw small amount; verify position partially unwinds proportionally.
4. Close position fully; verify clean obligation closure and USDC return.
5. Repeat for AWY 3x at 67% LTV.
6. Mainnet rollout with deposit cap (start at $1k per user, $10k vault cap) for the first week.
