"use strict";

/**
 * @param {import("pg").PoolClient} client
 * @param {{
 *   operation: string,
 *   sql_statement: string,
 *   affected_rows?: number,
 *   executed_by?: string,
 *   error?: string | null,
 *   metadata?: object | null,
 *   auto_executed?: boolean
 * }} row
 * @returns {Promise<{ id: number | null }>}
 */
async function insertOpsAuditLog(client, row) {
  const meta = row.metadata == null ? null : JSON.stringify(row.metadata);
  const auto = Boolean(row.auto_executed);
  try {
    const r = await client.query(
      `INSERT INTO public.ops_audit_log
        (operation, sql_statement, affected_rows, executed_by, error, metadata, auto_executed)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING id`,
      [
        String(row.operation || "unknown").slice(0, 256),
        String(row.sql_statement || "").slice(0, 120_000),
        Number.isFinite(row.affected_rows) ? Math.max(0, Math.floor(row.affected_rows)) : 0,
        String(row.executed_by || "ops-console").slice(0, 256),
        row.error == null ? null : String(row.error).slice(0, 8000),
        meta,
        auto
      ]
    );
    const id = r.rows?.[0]?.id;
    return { id: id != null ? Number(id) : null };
  } catch (e) {
    try {
      await client.query(
        `INSERT INTO public.ops_audit_log (operation, sql_statement, affected_rows, executed_by, error)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          String(row.operation || "unknown").slice(0, 256),
          String(row.sql_statement || "").slice(0, 120_000),
          Number.isFinite(row.affected_rows) ? Math.max(0, Math.floor(row.affected_rows)) : 0,
          String(row.executed_by || "ops-console").slice(0, 256),
          row.error == null ? null : String(row.error).slice(0, 8000)
        ]
      );
    } catch (e2) {
      console.error("[ops-audit] insert failed:", e2?.message || e2);
    }
    console.error("[ops-audit] extended insert failed (apply migration 031):", e?.message || e);
    return { id: null };
  }
}

module.exports = { insertOpsAuditLog };
