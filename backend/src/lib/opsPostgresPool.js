"use strict";

const { Pool } = require("pg");
const { tryResolvePostgresUrlFromSupabaseEnv } = require("./resolvePostgresUrlFromSupabase");

/** @type {import("pg").Pool | null} */
let pgPool = null;

function getOpsPostgresPool() {
  if (pgPool) return pgPool;
  const url =
    String(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || "").trim() ||
    tryResolvePostgresUrlFromSupabaseEnv(process.env);
  if (!url) return null;
  pgPool = new Pool({
    connectionString: url,
    max: 4,
    idleTimeoutMillis: 8000,
    connectionTimeoutMillis: 20000
  });
  return pgPool;
}

module.exports = { getOpsPostgresPool };
