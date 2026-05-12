BEGIN;

CREATE TABLE IF NOT EXISTS public.ops_audit_log (
  id BIGSERIAL PRIMARY KEY,
  operation TEXT NOT NULL,
  sql_statement TEXT NOT NULL,
  affected_rows INTEGER NOT NULL DEFAULT 0,
  executed_by TEXT NOT NULL DEFAULT 'ops-console',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_ops_audit_executed_at ON public.ops_audit_log (executed_at DESC);

ALTER TABLE public.ops_audit_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ops_audit_log IS 'Append-only audit of mutating SQL from POST /api/v1/ops/tools/sql (backend uses DATABASE_URL; PostgREST clients do not need access).';

COMMIT;
