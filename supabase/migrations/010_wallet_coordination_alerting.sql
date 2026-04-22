-- F6: historical temporal coordination between smart wallets + red alerts.
-- Safe to run multiple times.

BEGIN;

CREATE TABLE IF NOT EXISTS public.wallet_coordination_pairs (
  wallet_a VARCHAR(100) NOT NULL,
  wallet_b VARCHAR(100) NOT NULL,
  co_buy_count_30d INT NOT NULL DEFAULT 0,
  early_co_buy_count_30d INT NOT NULL DEFAULT 0,
  avg_delta_sec NUMERIC(12,3),
  strength_score NUMERIC(8,4) NOT NULL DEFAULT 0,
  last_co_buy_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (wallet_a, wallet_b)
);

CREATE TABLE IF NOT EXISTS public.wallet_coordination_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mint VARCHAR(100) NOT NULL,
  cluster_key TEXT NOT NULL,
  wallets JSONB NOT NULL DEFAULT '[]'::jsonb,
  wallet_count INT NOT NULL DEFAULT 0,
  spread_sec INT,
  score NUMERIC(8,4) NOT NULL DEFAULT 0,
  severity VARCHAR(16) NOT NULL DEFAULT 'RED',
  latency_from_deploy_min NUMERIC(12,3),
  reason VARCHAR(128),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_wallet_coord_pairs_strength
  ON public.wallet_coordination_pairs(strength_score DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_coord_pairs_last
  ON public.wallet_coordination_pairs(last_co_buy_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_coord_alerts_detected
  ON public.wallet_coordination_alerts(detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_coord_alerts_mint
  ON public.wallet_coordination_alerts(mint, detected_at DESC);

COMMIT;
