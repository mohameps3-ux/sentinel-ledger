BEGIN;

ALTER TABLE public.ops_audit_log
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS auto_executed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ops_audit_metadata_gin ON public.ops_audit_log USING gin (metadata);

CREATE TABLE IF NOT EXISTS public.ops_alerts (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  severity TEXT NOT NULL,
  event TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_taken TEXT NOT NULL DEFAULT 'logged',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ops_alerts_created_at ON public.ops_alerts (created_at DESC);

ALTER TABLE public.ops_alerts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ops_alerts IS 'Inbound webhook / proactive ops alerts (backend inserts via DATABASE_URL).';

COMMIT;
