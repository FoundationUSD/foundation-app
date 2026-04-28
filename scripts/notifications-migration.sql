-- Foundation — Email subscribers + notifications schema
-- Run after the base supabase-migration.sql.

-- 1. Email subscribers
CREATE TABLE IF NOT EXISTS sol_subscribers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  wallet TEXT,
  -- Notification preferences. Defaults: APY changes + own deposit/withdraw
  -- confirmations on, weekly digest off, new vault launches on.
  prefs JSONB NOT NULL DEFAULT '{"apy_change": true, "deposits": true, "withdrawals": true, "vault_launches": true, "weekly_digest": false}',
  verified_at TIMESTAMPTZ,
  -- One-shot tokens for verify + unsubscribe links. Rotated when used.
  verify_token TEXT,
  unsubscribe_token TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sol_subscribers_wallet ON sol_subscribers(wallet) WHERE wallet IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sol_subscribers_verify ON sol_subscribers(verify_token) WHERE verify_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sol_subscribers_unsubscribe ON sol_subscribers(unsubscribe_token) WHERE unsubscribe_token IS NOT NULL;

-- 2. Notifications (in-app + email log)
CREATE TABLE IF NOT EXISTS sol_notifications (
  id BIGSERIAL PRIMARY KEY,
  -- nullable wallet means a broadcast (e.g. "AWY just went live")
  wallet TEXT,
  -- type: apy_change | deposit | withdrawal | vault_launch | weekly_digest | system
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  metadata JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  emailed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sol_notifications_wallet
  ON sol_notifications(wallet, created_at DESC) WHERE wallet IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sol_notifications_unread
  ON sol_notifications(wallet, read_at) WHERE wallet IS NOT NULL AND read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sol_notifications_pending_email
  ON sol_notifications(emailed_at) WHERE emailed_at IS NULL;

-- 3. Last-seen APY snapshot per vault — used by the change-detection cron.
--    A single row per vault, upserted; we don't need history (sol_nav_history
--    already has that).
CREATE TABLE IF NOT EXISTS sol_apy_state (
  vault_id TEXT PRIMARY KEY,
  last_apy NUMERIC NOT NULL,
  last_change_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS — public read for notifications scoped to wallet via API filter, no
-- direct subscribers exposure. Service role does writes.
ALTER TABLE sol_subscribers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sol_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sol_apy_state     ENABLE ROW LEVEL SECURITY;

-- Service role can do anything; client never reads these tables directly.
CREATE POLICY "Service all sol_subscribers"   ON sol_subscribers   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service all sol_notifications" ON sol_notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service all sol_apy_state"     ON sol_apy_state     FOR ALL USING (true) WITH CHECK (true);
