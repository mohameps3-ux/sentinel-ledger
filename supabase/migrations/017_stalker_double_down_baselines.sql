-- F4: Stalker "double down" baselines (first notional per wallet+token) and tx dedupe.
-- Safe to re-run (IF NOT EXISTS).

BEGIN;

CREATE TABLE IF NOT EXISTS public.stalker_position_baselines (
  wallet_address text NOT NULL,
  token_address text NOT NULL,
  first_notional_usd numeric(24, 12) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, token_address)
);

COMMENT ON TABLE public.stalker_position_baselines IS
  'First buy notional (USD) per on-chain (wallet, mint) for Stalker F4 double-down.';

CREATE TABLE IF NOT EXISTS public.stalker_baseline_dedup (
  wallet_address text NOT NULL,
  token_address text NOT NULL,
  signature text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, token_address, signature)
);

CREATE INDEX IF NOT EXISTS idx_stalker_baseline_dedup_signature
  ON public.stalker_baseline_dedup (signature);

COMMENT ON TABLE public.stalker_baseline_dedup IS
  'Idempotency: one row per (wallet, mint, tx signature) for Helius replays.';

COMMIT;
