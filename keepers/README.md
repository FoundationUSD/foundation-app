# Foundation Keepers

Off-chain services that drive the vault. Spec: [`ADR-004`](../../dataroom/solana/ADR-004-vault-architecture.md) §Keeper Infrastructure.

| Keeper | Cadence | Responsibility |
|--------|---------|----------------|
| `nav-keeper` | every 6h (00/06/12/18 UTC) | Pull Pyth price, fall back to sAID.convertToAssets on ETH, submit `update_nav` |
| `batch-keeper` | daily 1PM UTC | `drain_managed` → CCTP V2 burn → ETH mint → `subscribeToSAID` |
| `queue-keeper` | on-demand (queue_mode=true or pending requests) | `unstakeAndRedeem` → CCTP bridge-back → `process_withdrawals` |
| `monitor` | real-time | Buffer health, NAV staleness, TVL drops, invariant violations |

## Operator permissions (shared hot wallet)

Bounded per ADR-004 §Role Separation:

- Allowed: `update_nav`, `drain_managed`, `process_withdrawals`
- Denied: change parameters, upgrade program, withdraw fees, pause/unpause, change admin, mint shares

If the hot wallet is compromised, the blast radius is: send bounded NAV updates (TWAP clamps them), move managed USDC that was going to ETH anyway, and fulfill queued redemption requests to their declared recipients. No fund drain.

## Run locally

```bash
# from repo root:
kdo run dev -p nav-keeper
kdo run dev -p batch-keeper
kdo run dev -p queue-keeper
kdo run dev -p monitor
```
