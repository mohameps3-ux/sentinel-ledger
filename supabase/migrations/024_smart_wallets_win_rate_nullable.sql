-- Allow NULL when no resolved signal outcomes exist for the lookback window.
ALTER TABLE IF EXISTS public.smart_wallets
  ALTER COLUMN win_rate DROP NOT NULL;
