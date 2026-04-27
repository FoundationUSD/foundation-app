use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Instruction not yet implemented")]
    NotImplemented,
    #[msg("Vault is paused")]
    VaultPaused,
    #[msg("Deposit cap exceeded")]
    DepositCapExceeded,
    #[msg("Buffer insufficient for instant redeem — use request_redeem")]
    BufferInsufficient,
    #[msg("Share lockup is still active (24h)")]
    LockupActive,
    #[msg("Redemption rate limit exceeded for this epoch")]
    RateLimitExceeded,
    #[msg("NAV stale — operator must update before ops resume")]
    NavStale,
    #[msg("NAV out of bounds (±5%/-2% TWAP)")]
    NavOutOfBounds,
    #[msg("NAV below $1 floor — circuit breaker engaged")]
    NavBelowFloor,
    #[msg("Pyth oracle proof invalid or confidence too wide")]
    PythInvalid,
    #[msg("Supply consistency invariant violated")]
    InvariantSupply,
    #[msg("Asset backing invariant violated")]
    InvariantAssetBacking,
    #[msg("Share price floor invariant violated")]
    InvariantSharePrice,
    #[msg("Unauthorized: admin only")]
    UnauthorizedAdmin,
    #[msg("Unauthorized: operator only")]
    UnauthorizedOperator,
    #[msg("Unauthorized: pause guardian only")]
    UnauthorizedGuardian,
    #[msg("SAS attestation missing, expired, or revoked")]
    SasAttestationInvalid,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Batch exceeds max withdrawals per tx")]
    BatchTooLarge,
    #[msg("Redeem request not in Claimable state")]
    RequestNotClaimable,
    #[msg("Queue mode active — use request_redeem")]
    QueueModeActive,
    #[msg("Transfer hook program mismatch — not the canonical fdn_transfer_hook")]
    TransferHookMismatch,
    #[msg("Share mint already initialized on this vault")]
    ShareMintAlreadySet,
    #[msg("Vault token accounts already initialized")]
    TokenAccountsAlreadySet,
    #[msg("has_one constraint violated — account ownership mismatch")]
    AccountMismatch,
    // ── AWY basket errors ─────────────────────────────────────────────────────
    #[msg("Basket weights invalid — must sum to 10_000 bps")]
    BasketWeightsInvalid,
    #[msg("Basket leg mint does not match vault.basket_underlyings[i]")]
    BasketUnderlyingMismatch,
    #[msg("Basket mode not enabled on this vault")]
    BasketNotEnabled,
    #[msg("Basket mode already enabled — re-enable not permitted")]
    BasketAlreadyEnabled,
    #[msg("Rebalance attempted before interval elapsed and no leg drifted >3%")]
    RebalanceTooSoon,
    #[msg("Jupiter program ID does not match the pinned canonical address")]
    JupiterProgramIdMismatch,
    #[msg("Jupiter swap exceeded max slippage budget (post-swap delta check)")]
    JupiterSlippageExceeded,
    #[msg("Per-leg NAV feed stale — basket NAV update blocked")]
    PerLegNavStale,
    #[msg("Per-leg NAV out of bounds (±5% / -2% vs leg TWAP)")]
    PerLegNavOutOfBounds,
    #[msg("Rebalance would drain a non-zero-weighted leg to zero")]
    RebalanceLegEmpty,
    #[msg("Weight delta exceeds 5% per leg without 48h timelock elapsed")]
    WeightDeltaTimelocked,
}
