use anchor_lang::prelude::*;

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub asset_symbol: [u8; 16],
    pub admin: Pubkey,
    pub operator: Pubkey,
    pub share_mint: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct Deposit {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub shares: u64,
    pub nav_per_share: u64,
    pub locked_until: i64,
    pub timestamp: i64,
}

#[event]
pub struct Redeem {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub shares: u64,
    pub amount: u64,
    pub nav_per_share: u64,
    pub timestamp: i64,
}

#[event]
pub struct RedeemRequested {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub request_id: u64,
    pub shares: u64,
    pub timestamp: i64,
}

#[event]
pub struct WithdrawalsProcessed {
    pub vault: Pubkey,
    pub request_ids: Vec<u64>,
    pub total_filled: u64,
    pub timestamp: i64,
}

#[event]
pub struct RedeemClaimed {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub request_id: u64,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct NavUpdated {
    pub vault: Pubkey,
    pub old_nav: u64,
    pub new_nav: u64,
    pub nav_twap: u64,
    pub oracle_source: u8, // 0=Pyth, 1=Operator
    pub timestamp: i64,
}

#[event]
pub struct FeesHarvested {
    pub vault: Pubkey,
    pub mgmt_fee_shares: u64,
    pub perf_fee_shares: u64,
    pub high_water_mark: u64,
    pub timestamp: i64,
}

#[event]
pub struct ManagedDrained {
    pub vault: Pubkey,
    pub amount: u64,
    pub destination: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct Paused {
    pub vault: Pubkey,
    pub guardian: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct Unpaused {
    pub vault: Pubkey,
    pub admin: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct InvariantViolation {
    pub vault: Pubkey,
    pub invariant: u8, // 1=Supply, 2=AssetBacking, 3=SharePrice
    pub timestamp: i64,
}
