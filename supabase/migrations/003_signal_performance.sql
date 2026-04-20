-- Signal outcome archive for backtesting / feedback loop.
-- Safe to run multiple times.

BEGIN;

CREATE TABLE IF NOT EXISTS public.signal_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE,
  asset VARCHAR(100) NOT NULL,
  emitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolve_after TIMESTAMPTZ NOT NULL,
  horizon_min INT NOT NULL DEFAULT 10 CHECK (horizon_min > 0 AND horizon_min <= 240),
  confidence NUMERIC(6,2),
  signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  entry_price_usd NUMERIC(18,8),
  outcome_price_usd NUMERIC(18,8),
  outcome_pct NUMERIC(10,4),
  success BOOLEAN,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  failure_reason TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_perf_asset_emitted
  ON public.signal_performance(asset, emitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_signal_perf_status_resolve_after
  ON public.signal_performance(status, resolve_after ASC);

CREATE INDEX IF NOT EXISTS idx_signal_perf_resolved_at
  ON public.signal_performance(resolved_at DESC);

COMMIT;

