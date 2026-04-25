-- Auto-Discovery Engine: candidate wallet queue
-- Safe to run multiple times (idempotent)

BEGIN;

CREATE TABLE IF NOT EXISTS public.auto_discovered_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(100) UNIQUE NOT NULL,
  
  -- Discovery traceability
  discovered_from_signal UUID,
  discovered_from_mint VARCHAR(100),
  discovery_rule_id VARCHAR(50),
  discovery_outcome_pct FLOAT,
  
  -- Round-trip metrics (SPL inventory method v5.0)
  candidate_score FLOAT DEFAULT 0,
  closed_trades INTEGER DEFAULT 0,
  wins_observed INTEGER DEFAULT 0,
  losses_observed INTEGER DEFAULT 0,
  open_positions INTEGER DEFAULT 0,
  win_rate_observed FLOAT DEFAULT 0,
  avg_sol_pnl_per_cycle FLOAT DEFAULT 0,
  weighted_avg_sol_pnl FLOAT DEFAULT 0,
  total_sol_moved FLOAT DEFAULT 0,
  avg_cycle_duration_hours FLOAT DEFAULT 0,
  
  -- Bot detection
  is_likely_bot BOOLEAN DEFAULT FALSE,
  bot_rejection_reason TEXT,
  tx_per_hour FLOAT DEFAULT 0,
  
  -- Lifecycle
  status VARCHAR(20) DEFAULT 'candidate',
  promoted_at TIMESTAMP,
  rejected_at TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_disc_status 
  ON public.auto_discovered_wallets(status);
CREATE INDEX IF NOT EXISTS idx_auto_disc_score 
  ON public.auto_discovered_wallets(candidate_score DESC);
CREATE INDEX IF NOT EXISTS idx_auto_disc_wallet 
  ON public.auto_discovered_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_auto_disc_created 
  ON public.auto_discovered_wallets(created_at DESC);

-- Add traceability to smart_wallets
ALTER TABLE IF EXISTS public.smart_wallets
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS discovery_mint VARCHAR(100),
  ADD COLUMN IF NOT EXISTS discovery_outcome_pct FLOAT,
  ADD COLUMN IF NOT EXISTS discovery_rule_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS promoted_from_score FLOAT,
  ADD COLUMN IF NOT EXISTS total_sol_moved FLOAT,
  ADD COLUMN IF NOT EXISTS closed_trades INTEGER DEFAULT 0;

COMMIT;
