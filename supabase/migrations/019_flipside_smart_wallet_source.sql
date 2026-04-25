ALTER TABLE IF EXISTS public.smart_wallets
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS avg_return_pct NUMERIC(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS flipside_last_active TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_smart_wallets_source ON public.smart_wallets(source);
CREATE INDEX IF NOT EXISTS idx_smart_wallets_flipside_rank
  ON public.smart_wallets(source, win_rate DESC, total_trades DESC);
