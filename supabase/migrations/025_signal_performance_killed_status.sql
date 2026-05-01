-- Allow early stop-loss exits on pending signal_performance rows.
BEGIN;

ALTER TABLE public.signal_performance DROP CONSTRAINT IF EXISTS signal_performance_status_check;

ALTER TABLE public.signal_performance
  ADD CONSTRAINT signal_performance_status_check
  CHECK (status IN ('pending', 'resolved', 'failed', 'killed'));

COMMIT;
