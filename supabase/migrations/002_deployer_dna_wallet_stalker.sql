ALTER TABLE IF EXISTS public.deployer_history
  ADD COLUMN IF NOT EXISTS success_rate NUMERIC(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_hours_to_rug NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS deployer_label VARCHAR(64),
  ADD COLUMN IF NOT EXISTS launch_sample_size INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.wallet_stalks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stalked_wallet VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, stalked_wallet)
);

CREATE INDEX IF NOT EXISTS idx_wallet_stalks_wallet_active
  ON public.wallet_stalks(stalked_wallet, is_active);

CREATE INDEX IF NOT EXISTS idx_wallet_stalks_user_active
  ON public.wallet_stalks(user_id, is_active);

