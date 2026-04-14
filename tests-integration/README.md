# Integration tests

Cross-chain E2E suite. Spec: [`ADR-004`](../../dataroom/solana/ADR-004-vault-architecture.md) §Testing.

Targets:

- Solana devnet + Sepolia.
- Full deposit → drain_managed → CCTP V2 burn/mint → subscribeToSAID → NAV update → redeem path.
- Queue-mode cycle: request_redeem → unstakeAndRedeem → CCTP back → process_withdrawals → claim_redeem.
- Inflation-attack simulation (proves 1e6 virtual offset makes it unprofitable).
- NAV manipulation attempt (confirms TWAP + bounds reject).
- Transfer hook lockup enforcement across user-to-user transfers.
- Invariant violation → auto-pause.
