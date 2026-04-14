//! Instruction handlers.
//!
//! Each submodule exposes:
//!   - `Xxx` Accounts context
//!   - `handler(ctx, ...)` — called as `instructions::xxx::handler(ctx, ...)` from lib.rs
//!
//! We glob-re-export each submodule so Anchor's `#[program]` macro can find the
//! `__client_accounts_*` and `__cpi_client_accounts_*` helper modules at crate root
//! (required by the macro expansion). The `handler` name collides across modules and
//! produces an `ambiguous_glob_reexports` warning — that warning is intentional and
//! safe because we always call handlers via fully-qualified path
//! (`instructions::initialize::handler`), never the bare `handler`.

pub mod claim_redeem;
pub mod deposit;
pub mod drain_managed;
pub mod harvest_fees;
pub mod initialize;
pub mod initialize_token_accounts;
pub mod pause;
pub mod process_withdrawals;
pub mod redeem;
pub mod request_redeem;
pub mod unpause;
pub mod update_nav;

#[allow(ambiguous_glob_reexports)]
pub use claim_redeem::*;
#[allow(ambiguous_glob_reexports)]
pub use deposit::*;
#[allow(ambiguous_glob_reexports)]
pub use drain_managed::*;
#[allow(ambiguous_glob_reexports)]
pub use harvest_fees::*;
#[allow(ambiguous_glob_reexports)]
pub use initialize::*;
#[allow(ambiguous_glob_reexports)]
pub use initialize_token_accounts::*;
#[allow(ambiguous_glob_reexports)]
pub use pause::*;
#[allow(ambiguous_glob_reexports)]
pub use process_withdrawals::*;
#[allow(ambiguous_glob_reexports)]
pub use redeem::*;
#[allow(ambiguous_glob_reexports)]
pub use request_redeem::*;
#[allow(ambiguous_glob_reexports)]
pub use unpause::*;
#[allow(ambiguous_glob_reexports)]
pub use update_nav::*;
