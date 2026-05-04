-- Ensure status allows 'killed' (early stop-loss in signalPerformance.js).
-- Use when the table was created from manual DDL without migration 025, or to re-align drift.
-- Idempotent: safe if 025 already ran (DROP + ADD same constraint).

BEGIN;

ALTER TABLE public.signal_performance DROP CONSTRAINT IF EXISTS signal_performance_status_check;

ALTER TABLE public.signal_performance
  ADD CONSTRAINT signal_performance_status_check
  CHECK (status IN ('pending', 'resolved', 'failed', 'killed'));

COMMIT;
