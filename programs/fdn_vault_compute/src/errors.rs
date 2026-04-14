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
}
