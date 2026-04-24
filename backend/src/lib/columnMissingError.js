/**
 * PostgREST / Postgres "column does not exist" (e.g. migration 016 not applied).
 */
"use strict";

function isMissingColumnError(err, columnHint) {
  const s = String(err?.message || err?.details || err || "");
  if (columnHint) {
    const safe = String(columnHint).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(safe, "i").test(s) && /does not exist|undefined column/i.test(s)) return true;
  }
  return /column .+ does not exist|42703/i.test(s);
}

module.exports = { isMissingColumnError };
