-- Archive emission regime + gate snapshot for outcome analytics (no scoring path change).
-- Safe to run multiple times.

BEGIN;

ALTER TABLE public.signal_performance
  ADD COLUMN IF NOT EXISTS emission_regime VARCHAR(32),
  ADD COLUMN IF NOT EXISTS emission_gate JSONB;

CREATE INDEX IF NOT EXISTS idx_signal_perf_emission_regime_emitted
  ON public.signal_performance(emission_regime, emitted_at DESC);

COMMIT;
