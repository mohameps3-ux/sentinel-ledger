-- Payments (Stripe), PRO Telegram alerts, smart-wallet worker tables.
-- Idempotent: safe to re-run on existing databases.
-- Applied automatically at end of schema.sql; backend/scripts/ensureSubscriptionsTable.js runs this file.

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(20) NOT NULL DEFAULT 'free',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);

CREATE TABLE IF NOT EXISTS stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stripe_events_event_id ON stripe_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed ON stripe_events(processed_at);

CREATE TABLE IF NOT EXISTS system_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_category_created ON system_logs(category, created_at DESC);

ALTER TABLE smart_wallets ADD COLUMN IF NOT EXISTS total_trades INT DEFAULT 0;
ALTER TABLE smart_wallets ADD COLUMN IF NOT EXISTS profitable_trades INT DEFAULT 0;
ALTER TABLE smart_wallets ADD COLUMN IF NOT EXISTS early_entry_score DECIMAL(5,2) DEFAULT 0;
ALTER TABLE smart_wallets ADD COLUMN IF NOT EXISTS cluster_score DECIMAL(5,2) DEFAULT 0;
ALTER TABLE smart_wallets ADD COLUMN IF NOT EXISTS consistency_score DECIMAL(5,2) DEFAULT 0;
ALTER TABLE smart_wallets ADD COLUMN IF NOT EXISTS smart_score DECIMAL(5,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_smart_wallets_win_rate ON smart_wallets(win_rate DESC);
CREATE INDEX IF NOT EXISTS idx_smart_wallets_smart_score ON smart_wallets(smart_score DESC);

CREATE TABLE IF NOT EXISTS wallet_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(100) REFERENCES smart_wallets(wallet_address) ON DELETE CASCADE,
  token_address VARCHAR(100) NOT NULL,
  tx_signature VARCHAR(255),
  amount_usd DECIMAL(20,2),
  bought_at TIMESTAMPTZ,
  UNIQUE(wallet_address, token_address, tx_signature)
);

CREATE INDEX IF NOT EXISTS idx_wallet_tokens_token ON wallet_tokens(token_address);

CREATE TABLE IF NOT EXISTS wallet_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_name VARCHAR(100),
  wallet_address VARCHAR(100) REFERENCES smart_wallets(wallet_address),
  confidence DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS token_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address VARCHAR(100),
  wallet_address VARCHAR(100),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_time ON token_activity_logs(token_address, timestamp);

ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_alerts_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_alert_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;
