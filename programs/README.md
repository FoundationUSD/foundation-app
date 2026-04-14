# Foundation Solana Programs

Anchor workspace for on-chain vault infrastructure. Spec: [`ADR-004`](../../dataroom/solana/ADR-004-vault-architecture.md).

## Programs

- **`fdn_vault_compute`** — core vault (9 instructions + pause/unpause). Multi-instance via VaultState PDAs keyed by `asset_symbol`.
- **`fdn_transfer_hook`** — Token-2022 transfer hook enforcing the 24h anti-arb lockup. Minimal (~80 lines), immutable on deploy.

## Build

```bash
# from repo root:
kdo run build -p fdn_vault_compute
kdo run build -p fdn_transfer_hook

# or directly inside this dir:
cd programs && anchor build
```

## Test

```bash
cd programs && anchor test
```

## Deploy (devnet)

```bash
kdo run deploy-devnet
```

After first devnet deploy, pin the program IDs in `Anchor.toml` and `declare_id!()` macros.

## Invariants

Checked on every state-changing instruction (see ADR-004 §Invariants):

1. `total_supply == share_mint.supply`
2. `buffer_usdc.balance + managed_usdc.balance <= total_assets`
3. `nav_per_share >= 1_000_000` (auto-pause on violation)

## Security

- Virtual offset (1e6/1e6) on all share math
- Role separation: admin (Squads 3-of-5) / operator (hot) / pause guardians (3)
- 48h timelock on parameter changes and program upgrades
- Transfer hook: read-only accounts, zero external CPI, immutable
- Token-2022 extensions used: CPI Guard, MetadataPointer, Immutable Owner, Transfer Hook
- Extensions explicitly excluded: Permanent Delegate, Confidential Transfers, Non-Transferable, Transfer Fee, Default Account State
