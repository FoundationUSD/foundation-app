-- Squads Grid per-user smart account registry.
--
-- Every Foundation user (post-Grid migration) maps to ONE smart account.
-- The account is a 2-of-2 multisig: Foundation co-signer + user signer.
-- Funds (kPRIME-USDC, ONyc, USDv, sUSDV, awyUSD receipts) live in this
-- account, NOT in shared Foundation vaults.
--
-- A user is uniquely identified by either:
--   - their Solana wallet pubkey (wallet-auth path)
--   - their email + Privy-managed pubkey (email-auth path)
-- Both columns indexed; at least one must be non-null.

CREATE TABLE IF NOT EXISTS sol_user_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  smart_account   TEXT NOT NULL UNIQUE,        -- Squads V4 multisig PDA
  vault_pda       TEXT,                          -- vault PDA derived from smart_account
  user_wallet     TEXT,                          -- non-null for wallet-auth
  user_email      TEXT,                          -- non-null for email-auth
  auth_mode       TEXT NOT NULL CHECK (auth_mode IN ('wallet','email')),
  user_pubkey     TEXT NOT NULL,                 -- the actual signing pubkey on-chain
  setup_fee_paid  NUMERIC,                       -- SOL amount paid at creation
  fee_exempt      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,                   -- non-null when user closed account
  refund_lamports NUMERIC,                       -- SOL returned to user on close
  CONSTRAINT identity_required CHECK (
    user_wallet IS NOT NULL OR user_email IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_user_accounts_wallet ON sol_user_accounts(user_wallet);
CREATE INDEX IF NOT EXISTS idx_user_accounts_email ON sol_user_accounts(user_email);
CREATE INDEX IF NOT EXISTS idx_user_accounts_smart ON sol_user_accounts(smart_account);
CREATE INDEX IF NOT EXISTS idx_user_accounts_open ON sol_user_accounts(created_at) WHERE closed_at IS NULL;

-- Migration tracking: legacy depositors who still need to move funds out of
-- shared Foundation vaults into their personal Grid account before 2026-06-30.
CREATE TABLE IF NOT EXISTS sol_migration_status (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_wallet    TEXT NOT NULL UNIQUE,         -- wallet that deposited to old shared vault
  smart_account    TEXT,                          -- their new Grid account (null until they migrate)
  migrated_at      TIMESTAMPTZ,
  legacy_vaults    TEXT[] NOT NULL,               -- e.g. ['fdn-awy','fdn-solomon']
  notified_at      TIMESTAMPTZ,                   -- last time we showed them the migration popup
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_pending ON sol_migration_status(legacy_wallet) WHERE migrated_at IS NULL;
