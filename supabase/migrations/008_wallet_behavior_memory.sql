-- Wallet behavior memory (F5): persistent features + summary for real stats.

BEGIN;

CREATE TABLE IF NOT EXISTS public.wallet_behavior_stats (
  wallet_address VARCHAR(100) PRIMARY KEY,
  lookback_days INT NOT NULL DEFAULT 30,
  sample_signals INT NOT NULL DEFAULT 0,
  resolved_signals INT NOT NULL DEFAULT 0,
  win_rate_real NUMERIC(6,2) NOT NULL DEFAULT 0,
  avg_position_size_usd NUMERIC(20,4) NOT NULL DEFAULT 0,
  avg_size_pre_pump_usd NUMERIC(20,4) NOT NULL DEFAULT 0,
  avg_latency_post_deploy_min NUMERIC(20,4),
  solo_buy_ratio NUMERIC(8,4) NOT NULL DEFAULT 0,
  group_buy_ratio NUMERIC(8,4) NOT NULL DEFAULT 0,
  anticipatory_buy_ratio NUMERIC(8,4) NOT NULL DEFAULT 0,
  breakout_buy_ratio NUMERIC(8,4) NOT NULL DEFAULT 0,
  style_label VARCHAR(48) NOT NULL DEFAULT 'insufficient_sample',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.wallet_behavior_token_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(100) NOT NULL,
  token_address VARCHAR(100) NOT NULL,
  first_buy_at TIMESTAMPTZ,
  last_buy_at TIMESTAMPTZ,
  buys_count INT NOT NULL DEFAULT 0,
  avg_amount_usd NUMERIC(20,4) NOT NULL DEFAULT 0,
  avg_latency_post_deploy_min NUMERIC(20,4),
  group_buy_ratio NUMERIC(8,4) NOT NULL DEFAULT 0,
  anticipatory_ratio NUMERIC(8,4) NOT NULL DEFAULT 0,
  breakout_ratio NUMERIC(8,4) NOT NULL DEFAULT 0,
  win_rate_real NUMERIC(6,2) NOT NULL DEFAULT 0,
  avg_result_pct NUMERIC(10,4),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_behavior_stats_computed
  ON public.wallet_behavior_stats(computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_behavior_stats_winrate
  ON public.wallet_behavior_stats(win_rate_real DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_behavior_token_wallet
  ON public.wallet_behavior_token_features(wallet_address, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_behavior_token_token
  ON public.wallet_behavior_token_features(token_address, computed_at DESC);

COMMIT;
