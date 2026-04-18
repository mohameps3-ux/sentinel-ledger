-- Optional: run on Supabase for track record + smart labels (idempotent).
-- Does not remove or rename existing columns.

CREATE TABLE IF NOT EXISTS wallet_labels (
  address TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  tier TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE smart_wallet_signals ADD COLUMN IF NOT EXISTS entry_price_usd NUMERIC(24, 12);
ALTER TABLE smart_wallet_signals ADD COLUMN IF NOT EXISTS price_1h_usd NUMERIC(24, 12);
ALTER TABLE smart_wallet_signals ADD COLUMN IF NOT EXISTS price_4h_usd NUMERIC(24, 12);
ALTER TABLE smart_wallet_signals ADD COLUMN IF NOT EXISTS result_pct NUMERIC(10, 4);

CREATE INDEX IF NOT EXISTS idx_smart_wallet_signals_created_at ON smart_wallet_signals(created_at DESC);
