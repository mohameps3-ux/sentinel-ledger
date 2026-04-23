-- T+N market outcome rows anchored to wallet_coordination_alerts (Fase B+).
-- Safe to run multiple times (IF NOT EXISTS / indexes with IF NOT EXISTS where supported).

BEGIN;

CREATE TABLE IF NOT EXISTS public.coordination_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL,
  mint varchar(100) NOT NULL,
  cluster_key text NOT NULL,
  alert_detected_at timestamptz NOT NULL,
  coordination_lead_sec int,
  horizon_min int NOT NULL DEFAULT 30
    CHECK (horizon_min > 0 AND horizon_min <= 240),
  entry_price_usd numeric(18,8),
  entry_captured_at timestamptz,
  resolve_after timestamptz NOT NULL,
  outcome_price_usd numeric(18,8),
  outcome_pct numeric(10,4),
  success boolean,
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'resolved', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  failure_reason text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_coord_outcomes_one_per_alert UNIQUE (alert_id),
  CONSTRAINT fk_coord_outcomes_alert
    FOREIGN KEY (alert_id) REFERENCES public.wallet_coordination_alerts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_coord_outcomes_cluster_key_detected
  ON public.coordination_outcomes (cluster_key, alert_detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_coord_outcomes_pending_resolve
  ON public.coordination_outcomes (status, resolve_after ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_coord_outcomes_mint
  ON public.coordination_outcomes (mint, alert_detected_at DESC);

COMMIT;
