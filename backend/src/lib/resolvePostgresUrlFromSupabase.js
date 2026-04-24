/**
 * When DATABASE_URL is unset, build Postgres URI(s) from
 * Supabase project URL + the database password (Project Settings → Database), not the API keys.
 *
 * - Session pooler (IPv4): postgresql://postgres.<ref>:...@aws-0-<region>.pooler.supabase.com:5432/postgres
 * - Direct: postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres (often IPv6-only; can fail on IPv4 networks)
 */
"use strict";

/**
 * @param {string|undefined} supabaseUrl
 * @returns {string|null} project ref (subdomain) or null
 */
function getProjectRefFromSupabaseUrl(supabaseUrl) {
  if (!supabaseUrl || typeof supabaseUrl !== "string") return null;
  const t = supabaseUrl.trim();
  if (!t) return null;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(t) ? t : `https://${t}`);
    const h = u.hostname;
    if (!/\.supabase\.co$/i.test(h)) return null;
    const sub = h.replace(/\.supabase\.co$/i, "");
    if (!sub || sub.includes(".")) return null;
    return sub;
  } catch {
    return null;
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string|null}
 */
function getPostgresPasswordFromEnv(env) {
  const e = env || process.env;
  const v = String(
    e.SUPABASE_DB_PASSWORD || e.SUPABASE_POSTGRES_PASSWORD || e.DATABASE_PASSWORD || ""
  ).trim();
  return v || null;
}

/** Tried in order when SUPABASE_DB_REGION is unset. */
const DEFAULT_AWS_REGION_GUESSES = [
  "eu-west-1",
  "eu-central-1",
  "eu-west-2",
  "us-east-1",
  "us-west-1",
  "ap-south-1",
  "ap-southeast-1",
  "sa-east-1"
];

/**
 * All candidate connection strings to try in order (pooler first for IPv4 compatibility).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function getPostgresUrlCandidatesFromSupabaseEnv(env) {
  const e = env || process.env;
  const direct = String(e.DATABASE_URL || e.SUPABASE_DATABASE_URL || "").trim();
  if (direct) return [direct];

  const ref =
    String(e.SUPABASE_PROJECT_REF || "").trim() || getProjectRefFromSupabaseUrl(String(e.SUPABASE_URL || "").trim());
  const pw = getPostgresPasswordFromEnv(e);
  if (!ref || !pw) return [];

  const port = String(e.SUPABASE_DB_PORT || "5432").trim() || "5432";
  const database = String(e.SUPABASE_DB_NAME || "postgres").trim() || "postgres";
  const useDirectOnly = /^(1|true|yes)$/i.test(String(e.SUPABASE_USE_DIRECT_DB || ""));
  const skipPooler = /^(1|true|yes)$/i.test(String(e.SUPABASE_SKIP_POOLER || ""));

  const out = [];
  const hostOverride = String(e.SUPABASE_DB_HOST || "").trim();

  if (hostOverride) {
    const user = String(e.SUPABASE_DB_USER || "postgres").trim() || "postgres";
    out.push(
      `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pw)}@${hostOverride}:${port}/${encodeURIComponent(
        database
      )}`
    );
    return out;
  }

  if (!useDirectOnly && !skipPooler) {
    const oneRegion = String(e.SUPABASE_DB_REGION || "").trim();
    const regions = oneRegion ? [oneRegion] : DEFAULT_AWS_REGION_GUESSES;
    const poolUser = `postgres.${ref}`;
    for (const region of regions) {
      const poolHost = `aws-0-${region}.pooler.supabase.com`;
      out.push(
        `postgresql://${encodeURIComponent(poolUser)}:${encodeURIComponent(
          pw
        )}@${poolHost}:5432/${encodeURIComponent(database)}`
      );
    }
  }

  if (!/^(1|true|yes)$/i.test(String(e.SUPABASE_SKIP_DIRECT_DB || ""))) {
    const h = `db.${ref}.supabase.co`;
    out.push(
      `postgresql://${encodeURIComponent("postgres")}:${encodeURIComponent(
        pw
      )}@${h}:${port}/${encodeURIComponent(database)}`
    );
  }
  return out;
}

/**
 * First candidate (same as getPostgresUrlCandidatesFromSupabaseEnv(env)[0] or null). Kept for callers that do not loop.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null} connection string or null if it cannot be derived
 */
function tryResolvePostgresUrlFromSupabaseEnv(env) {
  const list = getPostgresUrlCandidatesFromSupabaseEnv(env);
  return list[0] || null;
}

module.exports = {
  tryResolvePostgresUrlFromSupabaseEnv,
  getPostgresUrlCandidatesFromSupabaseEnv,
  getProjectRefFromSupabaseUrl,
  getPostgresPasswordFromEnv
};
