# Foundation Ethereum Contracts

Foundry workspace for the Cayman SPC vault on Ethereum mainnet. Spec: [`ADR-004`](../../dataroom/solana/ADR-004-vault-architecture.md) §Ethereum SPC Contract.

## Contracts

- **`FdnSpcVault.sol`** (~250 lines, Solidity 0.8.24) — Gnosis Safe 3-of-5 admin. Holds AID/sAID. Implements OFTReceiver for LayerZero V2 operational messages. Bridges USDC via CCTP V2 primary, Stargate V2 fallback.

## Build

```bash
cd contracts && forge build
```

## Test

```bash
cd contracts && forge test
```

## Deploy (Sepolia)

```bash
forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC --broadcast
```

## Access control

- `admin` — Gnosis Safe 3-of-5 (hardware wallets: Vivek, Eugene, David, Advisor 1, Advisor 2)
- `operator` — hot wallet; limited to whitelisted targets (GAIB mint, sAID, CCTP TokenMessenger, Stargate, LZ Endpoint)
- `emergencyWithdraw` — admin only

## Security

- No upgradeable proxy — immutable. Redeployment + migration if changes needed.
- Reentrancy guard on every entrypoint.
- OFTReceiver validates source chain + sender before accepting inbound LZ messages.
- Critical ask: GAIB whitelists this contract on their mint contract (owner: Eugene).
