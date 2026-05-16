-- On-chain USDC wallet subscriptions (trial / pro). Coexists with Stripe `subscriptions` (user_id).
CREATE TABLE IF NOT EXISTS public.usdc_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(44) NOT NULL,
  tx_signature TEXT NOT NULL UNIQUE,
  amount_usdc NUMERIC(20, 6) NOT NULL,
  plan VARCHAR(20) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usdc_subscriptions_wallet ON public.usdc_subscriptions (wallet_address);
CREATE INDEX IF NOT EXISTS idx_usdc_subscriptions_expires ON public.usdc_subscriptions (expires_at DESC);

COMMENT ON TABLE public.usdc_subscriptions IS 'Solana USDC pay-per-wallet subs; verified via Helius getTransaction.';
