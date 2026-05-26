BEGIN;

ALTER TABLE public.ops_audit_log
  ADD COLUMN IF NOT EXISTS conversation_id UUID,
  ADD COLUMN IF NOT EXISTS autonomy_mode TEXT,
  ADD COLUMN IF NOT EXISTS auto_executed_without_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS iteration_index INTEGER,
  ADD COLUMN IF NOT EXISTS model_reasoning_snippet TEXT,
  ADD COLUMN IF NOT EXISTS triggering_user_message TEXT;

CREATE INDEX IF NOT EXISTS idx_ops_audit_log_conversation_id
  ON public.ops_audit_log (conversation_id)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ops_audit_log_operation_executed
  ON public.ops_audit_log (operation, executed_at DESC);

COMMENT ON COLUMN public.ops_audit_log.conversation_id IS 'UUID per ops agent request loop (Full Autonomy audit trail).';
COMMENT ON COLUMN public.ops_audit_log.autonomy_mode IS 'strict | full at time of tool invocation.';

COMMIT;
