// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

/// @title FdnSpcVault
/// @notice Foundation Cayman SPC vault — holds AID/sAID, bridges USDC to Solana,
///         receives LayerZero V2 operational messages from the Solana vault program.
/// @dev Spec: dataroom/solana/ADR-004-vault-architecture.md §Ethereum SPC Contract
///      Immutable contract. Gnosis Safe 3-of-5 admin. Operator hot wallet with
///      whitelisted-target-only spending permissions.
contract FdnSpcVault {
    // TODO(ADR-004): implement
    //   - subscribeToSAID(uint256) — approve GAIB mint, mint AID, stake to sAID
    //   - unstakeAndRedeem(uint256) — unstake sAID → AID → USDC via GAIB
    //   - bridgeUsdcToSolana(uint256) — CCTP V2 primary, Stargate V2 fallback
    //   - lzReceive(Origin, bytes) — OFTReceiver; validate source + sender
    //   - emergencyWithdraw() — admin only
    //
    // Security:
    //   - ReentrancyGuard on all entrypoints
    //   - Operator target whitelist: GAIB mint, sAID, CCTP TokenMessenger, Stargate, LZ Endpoint
    //   - No proxy — immutable
}
