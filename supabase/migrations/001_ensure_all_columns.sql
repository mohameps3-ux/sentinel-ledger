-- Canonical hardening migration: align schema with runtime code paths.
-- Safe to run multiple times.

BEGIN;

ALTER TABLE IF EXISTS public.smart_wallet_signals
  ADD COLUMN IF NOT EXISTS entry_price_usd NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS price_1h_usd NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS price_4h_usd NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS result_pct NUMERIC(10,4);

ALTER TABLE IF EXISTS public.smart_wallets
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(6,2) DEFAULT 0;

ALTER TABLE IF EXISTS public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(120);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE stripe_subscription_id IS NOT NULL
    GROUP BY stripe_subscription_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Skipping unique constraint on subscriptions.stripe_subscription_id due to existing duplicates';
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_stripe_subscription_id_unique'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_stripe_subscription_id_unique UNIQUE (stripe_subscription_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_smart_wallet_signals_created_at
  ON public.smart_wallet_signals(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_tokens_bought_at
  ON public.wallet_tokens(bought_at DESC);

COMMIT;

