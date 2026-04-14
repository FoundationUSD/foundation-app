# @foundation/sdk

TypeScript client for Foundation vaults. Shared between the Next.js app, keepers, and integration tests. Spec: [`ADR-004`](../../dataroom/solana/ADR-004-vault-architecture.md).

## Surface

- Vault instruction builders (`deposit`, `redeem`, `requestRedeem`, `claimRedeem`, `updateNav`, etc.)
- PDA derivation helpers (`VaultState`, `ShareLockup`, `RedeemRequest`, `FeeTreasury`)
- NAV math (virtual-offset share conversion, TWAP application, bounds check)
- CCTP V2 helpers (burn on source, poll attestation, mint on destination)
- SAS helpers (issue / verify / revoke institutional attestations)
- LayerZero V2 message encoders (`MSG_DEPLOY_USDC`, `MSG_REDEEM_REQUEST`, etc.)
- Typed event decoders

## Build

```bash
cd sdk && bun run build
```
