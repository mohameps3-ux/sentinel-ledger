-- Base Sentinel display score captured at emission (feed read path uses when present).
-- Safe to run multiple times.

BEGIN;

ALTER TABLE public.signal_performance
  ADD COLUMN IF NOT EXISTS sentinel_score NUMERIC(6,2);

COMMENT ON COLUMN public.signal_performance.sentinel_score IS
  'Base Sentinel display score (0-100) captured at emission; feed uses when present.';

COMMIT;
