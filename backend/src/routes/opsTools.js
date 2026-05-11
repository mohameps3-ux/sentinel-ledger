"use strict";

/**
 * Ops-only tooling (OMNI_BOT_OPS_KEY): repo file read, read-only SQL (INSERT/UPDATE/DELETE/DDL
 * rejected by validateReadOnlySelect), GitHub workflow_dispatch (no Vercel/Railway deploy unless
 * your workflow implements it). See backend/.env.example for GITHUB_* and OPS_REPO_ROOT.
 */

const fs = require("fs");
const path = require("path");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");
const { tryResolvePostgresUrlFromSupabaseEnv } = require("../lib/resolvePostgresUrlFromSupabase");

const router = express.Router();

const MAX_FILE_BYTES = 280_000;
const MAX_SQL_LEN = 8000;
const MAX_SQL_ROWS = 200;

function requireOpsKey(req, res, next) {
  const expected = process.env.OMNI_BOT_OPS_KEY;
  if (!expected) return res.status(503).json({ ok: false, error: "ops_key_not_configured" });
  const provided = String(req.headers["x-ops-key"] || req.body?.ops_key || "").trim();
  if (!provided || provided !== expected) return res.status(401).json({ ok: false, error: "unauthorized" });
  return next();
}

const toolsLimiter = rateLimit({
  windowMs: 60_000,
  max: 40,
  message: { ok: false, error: "too_many_requests" },
  standardHeaders: true,
  legacyHeaders: false
});

function getRepoRoot() {
  const custom = String(process.env.OPS_REPO_ROOT || "").trim();
  if (custom) return path.resolve(custom);
  const three = path.resolve(__dirname, "..", "..", "..");
  const two = path.resolve(__dirname, "..", "..");
  try {
    if (fs.existsSync(path.join(three, "backend")) && fs.existsSync(path.join(three, "frontend"))) return three;
  } catch (_) {}
  return two;
}

function resolveSafeRepoPath(rel) {
  const root = getRepoRoot();
  const raw = String(rel || "")
    .trim()
    .replace(/^[/\\]+/, "");
  if (!raw || raw.length > 400) return { ok: false, error: "bad_path" };
  const segments = raw.split(/[/\\]/);
  if (segments.includes("..")) return { ok: false, error: "path_traversal" };
  const rootResolved = path.resolve(root);
  const target = path.resolve(rootResolved, raw);
  const relCheck = path.relative(rootResolved, target);
  if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) return { ok: false, error: "outside_repo" };
  return { ok: true, abs: target, root: rootResolved, rel: raw };
}

/** @type {import("pg").Pool | null} */
let pgPool = null;

function getReadOnlyPool() {
  if (pgPool) return pgPool;
  const url =
    String(process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || "").trim() ||
    tryResolvePostgresUrlFromSupabaseEnv(process.env);
  if (!url) return null;
  pgPool = new Pool({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 8000,
    connectionTimeoutMillis: 20000
  });
  return pgPool;
}

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

function buildTemplateSql(templateId, params = {}) {
  const id = String(templateId || "").trim();
  if (id === "ops_health_counts") {
    return `
SELECT 'signal_outcomes' AS table_name, COUNT(*)::bigint AS row_count,
       MIN(created_at) AS oldest, MAX(created_at) AS newest
FROM signal_outcomes
UNION ALL
SELECT 'signal_performance', COUNT(*)::bigint, MIN(created_at), MAX(created_at)
FROM signal_performance
UNION ALL
SELECT 'smart_wallets', COUNT(*)::bigint, MIN(updated_at), MAX(updated_at)
FROM smart_wallets
UNION ALL
SELECT 'smart_wallet_signals', COUNT(*)::bigint, MIN(created_at), MAX(created_at)
FROM smart_wallet_signals
UNION ALL
SELECT 'rule_performance', COUNT(*)::bigint, MIN(updated_at), MAX(updated_at)
FROM rule_performance
`.trim();
  }
  if (id === "signal_performance_status_7d") {
    return `
SELECT status, COUNT(*)::int AS n,
       ROUND(AVG(outcome_pct)::numeric, 4) AS avg_outcome_pct
FROM signal_performance
WHERE emitted_at > NOW() - INTERVAL '7 days'
GROUP BY status
ORDER BY n DESC
LIMIT 50
`.trim();
  }
  if (id === "outcomes_pending_sample") {
    const hours = Math.max(1, Math.min(168, Number(params.hours) || 24));
    return `
SELECT signal_id, mint, rule_id, created_at
FROM signal_outcomes
WHERE outcome_60m IS NULL
  AND created_at < NOW() - INTERVAL '${hours} hours'
ORDER BY created_at ASC
LIMIT 50
`.trim();
  }
  return null;
}

function parseGithubRepo() {
  const combined = String(process.env.GITHUB_REPOSITORY || "").trim();
  if (combined && combined.includes("/")) {
    const [owner, repo] = combined.split("/", 2);
    if (owner && repo) return { owner, repo };
  }
  const owner = String(process.env.GITHUB_REPO_OWNER || "").trim();
  const repo = String(process.env.GITHUB_REPO_NAME || "").trim();
  if (owner && repo) return { owner, repo };
  return null;
}

function getGithubToken() {
  return String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.OPS_GITHUB_TOKEN || "").trim();
}

router.post("/repo/read", requireOpsKey, toolsLimiter, (req, res) => {
  try {
    const rel = req.body?.path ?? req.body?.file;
    const resolved = resolveSafeRepoPath(rel);
    if (!resolved.ok) return res.status(400).json({ ok: false, error: resolved.error });
    if (!fs.existsSync(resolved.abs) || !fs.statSync(resolved.abs).isFile()) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    const st = fs.statSync(resolved.abs);
    if (st.size > MAX_FILE_BYTES) {
      return res.status(413).json({ ok: false, error: "file_too_large", maxBytes: MAX_FILE_BYTES, size: st.size });
    }
    const content = fs.readFileSync(resolved.abs, "utf8");
    return res.json({
      ok: true,
      path: resolved.rel,
      root: resolved.root,
      bytes: st.size,
      content
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "repo_read_failed" });
  }
});

router.post("/sql", requireOpsKey, toolsLimiter, async (req, res) => {
  try {
    const preview = Boolean(req.body?.preview);
    const confirm = Boolean(req.body?.confirm);
    const templateId = req.body?.template;
    const params = req.body?.params && typeof req.body.params === "object" ? req.body.params : {};

    let sql = null;
    if (templateId) {
      sql = buildTemplateSql(String(templateId), params);
      if (!sql) return res.status(400).json({ ok: false, error: "unknown_template" });
    } else if (req.body?.sql) {
      const v = validateReadOnlySelect(req.body.sql);
      if (!v.ok) return res.status(400).json({ ok: false, error: v.error });
      sql = v.sql;
    } else {
      return res.status(400).json({ ok: false, error: "template_or_sql_required" });
    }

    if (preview) {
      return res.json({ ok: true, preview: true, sql });
    }

    if (!confirm) {
      return res.status(400).json({
        ok: false,
        error: "confirm_required",
        hint: "Set preview:true to inspect SQL, then confirm:true to execute read."
      });
    }

    const pool = getReadOnlyPool();
    if (!pool) return res.status(503).json({ ok: false, error: "database_url_not_configured" });

    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = 15000");
      const r = await client.query(sql);
      const rows = (r.rows || []).slice(0, MAX_SQL_ROWS);
      return res.json({
        ok: true,
        preview: false,
        sql,
        rowCount: r.rowCount,
        fields: r.fields?.map((f) => f.name) || [],
        rows
      });
    } finally {
      client.release();
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "sql_failed" });
  }
});

router.post("/github/workflow", requireOpsKey, toolsLimiter, async (req, res) => {
  try {
    if (!req.body?.confirm) {
      return res.status(400).json({ ok: false, error: "confirm_required", hint: "Set confirm:true to dispatch." });
    }
    const workflow = String(req.body?.workflow || req.body?.workflow_id || "").trim();
    const ref = String(req.body?.ref || "main").trim();
    const inputs = req.body?.inputs && typeof req.body.inputs === "object" ? req.body.inputs : {};
    if (!workflow) return res.status(400).json({ ok: false, error: "workflow_required" });

    const token = getGithubToken();
    if (!token) return res.status(503).json({ ok: false, error: "GITHUB_TOKEN_not_configured" });

    const repo = parseGithubRepo();
    if (!repo) return res.status(503).json({ ok: false, error: "GITHUB_REPOSITORY_not_configured" });

    const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/workflows/${encodeURIComponent(
      workflow
    )}/dispatches`;
    const gh = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "sentinel-ledger-ops-tools"
      },
      body: JSON.stringify({ ref, inputs })
    });

    if (gh.status !== 204 && gh.status !== 200) {
      const text = await gh.text();
      return res.status(502).json({
        ok: false,
        error: "github_dispatch_failed",
        status: gh.status,
        body: text.slice(0, 2000)
      });
    }
    return res.json({
      ok: true,
      dispatched: true,
      repository: `${repo.owner}/${repo.repo}`,
      workflow,
      ref
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "github_dispatch_exception" });
  }
});

module.exports = router;
