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
 *   auto_executed?: boolean,
 *   conversation_id?: string | null,
 *   autonomy_mode?: string | null,
 *   auto_executed_without_confirmation?: boolean,
 *   iteration_index?: number | null,
 *   model_reasoning_snippet?: string | null,
 *   triggering_user_message?: string | null
 * }} row
 * @returns {Promise<{ id: number | null }>}
 */
async function insertOpsAuditLog(client, row) {
  const meta = row.metadata == null ? null : JSON.stringify(row.metadata);
  const auto = Boolean(row.auto_executed);
  const conversationId = row.conversation_id ? String(row.conversation_id) : null;
  const autonomyMode = row.autonomy_mode == null ? null : String(row.autonomy_mode).slice(0, 32);
  const autoNoConfirm = Boolean(row.auto_executed_without_confirmation);
  const iterationIndex =
    row.iteration_index == null || !Number.isFinite(Number(row.iteration_index))
      ? null
      : Math.floor(Number(row.iteration_index));
  const reasoningSnippet =
    row.model_reasoning_snippet == null ? null : String(row.model_reasoning_snippet).slice(0, 4000);
  const triggeringMessage =
    row.triggering_user_message == null ? null : String(row.triggering_user_message).slice(0, 2000);

  try {
    const r = await client.query(
      `INSERT INTO public.ops_audit_log
        (operation, sql_statement, affected_rows, executed_by, error, metadata, auto_executed,
         conversation_id, autonomy_mode, auto_executed_without_confirmation,
         iteration_index, model_reasoning_snippet, triggering_user_message)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::uuid, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        String(row.operation || "unknown").slice(0, 256),
        String(row.sql_statement || "").slice(0, 120_000),
        Number.isFinite(row.affected_rows) ? Math.max(0, Math.floor(row.affected_rows)) : 0,
        String(row.executed_by || "ops-console").slice(0, 256),
        row.error == null ? null : String(row.error).slice(0, 8000),
        meta,
        auto,
        conversationId,
        autonomyMode,
        autoNoConfirm,
        iterationIndex,
        reasoningSnippet,
        triggeringMessage
      ]
    );
    const id = r.rows?.[0]?.id;
    return { id: id != null ? Number(id) : null };
  } catch (e) {
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
    } catch (e2) {
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
      } catch (e3) {
        console.error("[ops-audit] insert failed:", e3?.message || e3);
      }
    }
    console.error("[ops-audit] full autonomy insert failed (apply migration 034):", e?.message || e);
    return { id: null };
  }
}

module.exports = { insertOpsAuditLog };
