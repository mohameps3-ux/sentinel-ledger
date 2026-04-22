-- F5 completion: probabilistic wallet profile horizons (5m/30m/2h).
-- Safe to run multiple times.

BEGIN;

ALTER TABLE IF EXISTS public.smart_wallet_signals
  ADD COLUMN IF NOT EXISTS price_5m_usd NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS price_30m_usd NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS price_2h_usd NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS result_5m_pct NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS result_30m_pct NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS result_2h_pct NUMERIC(10,4);

ALTER TABLE IF EXISTS public.wallet_behavior_stats
  ADD COLUMN IF NOT EXISTS resolved_signals_5m INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_signals_30m INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_signals_2h INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS win_rate_real_5m NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS win_rate_real_30m NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS win_rate_real_2h NUMERIC(6,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_smart_wallet_signals_created_at
  ON public.smart_wallet_signals(created_at DESC);

COMMIT;
