-- Phase 4 source-of-truth hardening:
-- Store per-request freshness events in DB so 24h metrics survive restarts/redeploys.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_data_freshness_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  endpoint VARCHAR(32) NOT NULL CHECK (endpoint IN ('signalsLatest', 'tokensHot')),
  source VARCHAR(48) NOT NULL DEFAULT 'unknown',
  real_data_ratio NUMERIC(8,4) NOT NULL DEFAULT 0,
  fallback_reason VARCHAR(96),
  provider_used VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_ops_freshness_events_endpoint_time
  ON public.ops_data_freshness_events(endpoint, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_freshness_events_captured
  ON public.ops_data_freshness_events(captured_at DESC);

COMMIT;
