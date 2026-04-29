-- Allow NULL when 30d signal-based PnL cannot be computed (no resolved signals).
ALTER TABLE IF EXISTS public.smart_wallets
  ALTER COLUMN pnl_30d DROP NOT NULL;
