-- Min / max DEX spot observed by the price worker during the post-entry window (tied to runSignalPriceEnrichmentOnce).
-- Safe to re-run.

BEGIN;

ALTER TABLE IF EXISTS public.smart_wallet_signals
  ADD COLUMN IF NOT EXISTS min_price_window_usd NUMERIC(24, 12),
  ADD COLUMN IF NOT EXISTS max_price_window_usd NUMERIC(24, 12);

COMMENT ON COLUMN public.smart_wallet_signals.min_price_window_usd IS
  'Lowest spot USD seen for this signal while the worker was tracking the window (not full CLOB OHLC).';
COMMENT ON COLUMN public.smart_wallet_signals.max_price_window_usd IS
  'Highest spot USD seen for this signal while the worker was tracking the window (not full CLOB OHLC).';

COMMIT;
