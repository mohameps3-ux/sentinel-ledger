"use strict";

const MAX_SQL_LEN = 8000;

function validateReadOnlySelect(sqlRaw) {
  const sql = String(sqlRaw || "").trim();
  if (!sql) return { ok: false, error: "empty_sql" };
  if (sql.length > MAX_SQL_LEN) return { ok: false, error: "sql_too_long" };
  if (/--|\/\*|\*\//.test(sql)) return { ok: false, error: "comments_not_allowed" };
  if (/;/g.test(sql)) return { ok: false, error: "semicolon_not_allowed" };
  const lower = sql.toLowerCase();
  if (!/^\s*select\b/.test(lower)) return { ok: false, error: "select_only" };
  const forbidden =
    /\b(insert|update|delete|drop|alter|truncate|grant|revoke|copy|into\s+pg_|create\s+table|create\s+index|merge|replace|call|execute|set\s+role|set\s+session)\b/i;
  if (forbidden.test(sql)) return { ok: false, error: "forbidden_keyword" };
  return { ok: true, sql };
}

function validateAuditedMutatingSql(sqlRaw) {
  const sql = String(sqlRaw || "").trim();
  if (!sql) return { ok: false, error: "empty_sql" };
  if (sql.length > MAX_SQL_LEN) return { ok: false, error: "sql_too_long" };
  if (/--|\/\*|\*\//.test(sql)) return { ok: false, error: "comments_not_allowed" };
  if (/;/g.test(sql)) return { ok: false, error: "semicolon_not_allowed" };
  const bad =
    /\b(pg_sleep|pg_read_file|lo_import|lo_export|dblink_|copy\s+\(|into\s+outfile|execute\s+immediate)\b/i;
  if (bad.test(sql)) return { ok: false, error: "forbidden_keyword" };
  return { ok: true, sql };
}

function classifySqlKind(sqlRaw) {
  const sql = String(sqlRaw || "").trim();
  if (!sql) return "unknown";
  if (/^\s*(drop|truncate|alter|create|grant|revoke)\b/i.test(sql)) return "dangerous";
  if (/^\s*(insert|update|delete|merge)\b/i.test(sql)) return "write";
  if (/^\s*select\b/i.test(sql)) return "read";
  return "unknown";
}

module.exports = {
  MAX_SQL_LEN,
  validateReadOnlySelect,
  validateAuditedMutatingSql,
  classifySqlKind
};
