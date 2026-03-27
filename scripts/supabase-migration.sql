-- Foundation Protocol — Solana vault tables
-- Run this in Supabase SQL editor
-- Prefixed with sol_ to avoid conflicts with existing EVM vault tables

-- 1. Solana vault registry
CREATE TABLE IF NOT EXISTS sol_vaults (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  underlying TEXT NOT NULL,
  mint_address TEXT NOT NULL,
  vault_authority TEXT NOT NULL,
  rate_bps INT NOT NULL,
  apy NUMERIC NOT NULL,
  total_deposits BIGINT DEFAULT 0,
  tvl_usdc BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. NAV / rate history
CREATE TABLE IF NOT EXISTS sol_nav_history (
  id BIGSERIAL PRIMARY KEY,
  vault_id TEXT REFERENCES sol_vaults(id),
  rate_bps INT NOT NULL,
  apy NUMERIC NOT NULL,
  tvl_usdc BIGINT,
  total_shares BIGINT,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sol_nav_vault_time
  ON sol_nav_history(vault_id, recorded_at DESC);

-- 3. Deposit records
CREATE TABLE IF NOT EXISTS sol_deposits (
  id BIGSERIAL PRIMARY KEY,
  vault_id TEXT REFERENCES sol_vaults(id),
  wallet TEXT NOT NULL,
  usdc_amount BIGINT NOT NULL,
  shares_minted BIGINT NOT NULL,
  deposit_tx TEXT NOT NULL,
  mint_tx TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sol_deposits_wallet
  ON sol_deposits(wallet, created_at DESC);

-- 4. Withdrawal records
CREATE TABLE IF NOT EXISTS sol_withdrawals (
  id BIGSERIAL PRIMARY KEY,
  vault_id TEXT REFERENCES sol_vaults(id),
  wallet TEXT NOT NULL,
  shares_burned BIGINT NOT NULL,
  usdc_returned BIGINT NOT NULL,
  burn_tx TEXT NOT NULL,
  transfer_tx TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sol_withdrawals_wallet
  ON sol_withdrawals(wallet, created_at DESC);

-- 5. External vault cache (Kamino, Drift, Solomon)
CREATE TABLE IF NOT EXISTS sol_external_vaults (
  id TEXT PRIMARY KEY,
  protocol TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  apy NUMERIC,
  tvl_usdc BIGINT,
  vault_address TEXT,
  external_url TEXT,
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE sol_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE sol_nav_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sol_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sol_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sol_external_vaults ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Public read sol_vaults" ON sol_vaults FOR SELECT USING (true);
CREATE POLICY "Public read sol_nav_history" ON sol_nav_history FOR SELECT USING (true);
CREATE POLICY "Public read sol_deposits" ON sol_deposits FOR SELECT USING (true);
CREATE POLICY "Public read sol_withdrawals" ON sol_withdrawals FOR SELECT USING (true);
CREATE POLICY "Public read sol_external_vaults" ON sol_external_vaults FOR SELECT USING (true);

-- Service role write
CREATE POLICY "Service write sol_vaults" ON sol_vaults FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write sol_nav_history" ON sol_nav_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Service write sol_deposits" ON sol_deposits FOR INSERT WITH CHECK (true);
CREATE POLICY "Service write sol_withdrawals" ON sol_withdrawals FOR INSERT WITH CHECK (true);
CREATE POLICY "Service write sol_external_vaults" ON sol_external_vaults FOR ALL USING (true) WITH CHECK (true);

-- Helper function for incrementing vault TVL
CREATE OR REPLACE FUNCTION increment_vault_tvl(p_vault_id TEXT, p_amount BIGINT)
RETURNS void AS $$
BEGIN
  UPDATE sol_vaults
  SET tvl_usdc = tvl_usdc + p_amount,
      total_deposits = total_deposits + p_amount
  WHERE id = p_vault_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed initial vault data (update mint_address + vault_authority after running setup-vaults.ts)
INSERT INTO sol_vaults (id, name, underlying, mint_address, vault_authority, rate_bps, apy)
VALUES
  ('fdnAPOLLO', 'fdnAPOLLO', 'Apollo Diversified Credit (ACRED)', 'TODO', 'TODO', 877, 8.77),
  ('fdnBUILD', 'fdnBUILD', 'BlackRock USD Institutional (BUIDL)', 'TODO', 'TODO', 450, 4.50),
  ('fdnSCOPE', 'fdnSCOPE', 'Hamilton Lane SCOPE', 'TODO', 'TODO', 667, 6.67)
ON CONFLICT (id) DO NOTHING;

-- Seed external vault data
INSERT INTO sol_external_vaults (id, protocol, name, description, apy, external_url)
VALUES
  ('solomon-susdv', 'solomon', 'sUSDV', 'Staked USDV — yield-bearing stablecoin backed by basis trading strategies', 12.5, 'https://app.solomonlabs.org'),
  ('kamino-rwa-acred', 'kamino', 'Kamino ACRED Earn', 'Apollo Diversified Credit RWA vault on Kamino Finance', 8.5, 'https://app.kamino.finance'),
  ('drift-rwa-vault', 'drift', 'Drift Gauntlet RWA', 'Leveraged RWA vault managed by Gauntlet on Drift Protocol', 16.0, 'https://app.drift.trade/vaults')
ON CONFLICT (id) DO NOTHING;
