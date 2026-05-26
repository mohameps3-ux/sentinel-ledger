"use strict";

/**
 * Idempotent ops_audit_log schema for Full Autonomy audit columns.
 * Runs once at backend startup against the same DATABASE_URL Railway uses in prod.
 */

const MIGRATION_034_SQL = `
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
`;

/** @type {{ applied: boolean, columnCount: number | null, columns: string[] | null, error: string | null }} */
const state = {
  applied: false,
  columnCount: null,
  columns: null,
  error: null
};

function getOpsAuditSchemaState() {
  return { ...state };
}

/**
 * @param {import("pg").Pool} pool
 */
async function ensureOpsAuditSchema(pool) {
  if (!pool || state.applied) return getOpsAuditSchemaState();
  const client = await pool.connect();
  try {
    await client.query(MIGRATION_034_SQL);
    const r = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ops_audit_log'
      ORDER BY ordinal_position
    `);
    state.columns = r.rows.map((row) => row.column_name);
    state.columnCount = state.columns.length;
    state.applied = true;
    state.error = null;
    console.info("[ops-audit-schema] ensured 034 columns; count=", state.columnCount);
  } catch (e) {
    state.error = e?.message || String(e);
    console.warn("[ops-audit-schema] ensure failed:", state.error);
  } finally {
    client.release();
  }
  return getOpsAuditSchemaState();
}

module.exports = { ensureOpsAuditSchema, getOpsAuditSchemaState };
