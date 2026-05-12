"use strict";

/**
 * Ops-only tooling (OMNI_BOT_OPS_KEY): repo/read local disk or GitHub API (body.source github|auto),
 * read-only SQL, workflow_dispatch, atomic github/commit. See .env.example: OPS_REPO_READ_*,
 * GITHUB_*, OPS_GITHUB_WRITE_ALLOW_PREFIXES, OPS_REPO_ROOT.
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
const GITHUB_COMMIT_MAX_FILES = 25;
const GITHUB_COMMIT_MAX_BYTES_PER_FILE = 200_000;

const writeToolsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  message: { ok: false, error: "too_many_requests" },
  standardHeaders: true,
  legacyHeaders: false
});

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

/**
 * Same guardrails as POST /api/v1/ops/tools/sql (read-only). Used by ops agent auto-SQL blocks.
 * @returns {Promise<{ ok: true, rows: object[], rowCount: number } | { ok: false, error: string }>}
 */
async function runOpsReadOnlySelect(sqlRaw) {
  const v = validateReadOnlySelect(sqlRaw);
  if (!v.ok) return { ok: false, error: v.error };
  const pool = getReadOnlyPool();
  if (!pool) return { ok: false, error: "database_url_not_configured" };
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = 15000");
    const r = await client.query(v.sql);
    const rows = r.rows || [];
    return {
      ok: true,
      rows: rows.slice(0, 10),
      rowCount: rows.length
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    client.release();
  }
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

function getGithubWriteAllowPrefixes() {
  const raw = String(process.env.OPS_GITHUB_WRITE_ALLOW_PREFIXES || "").trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim().replace(/\\/g, "/").replace(/^\/+/, ""))
      .filter(Boolean);
  }
  return ["frontend/", "backend/src/", "docs/", ".github/workflows/"];
}

function normalizeGithubWritePath(p) {
  return String(p || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function isGithubWritePathAllowed(rel) {
  const filePath = normalizeGithubWritePath(rel);
  if (!filePath || filePath.length > 500) return { ok: false, error: "bad_path" };
  if (filePath.includes("..") || filePath.split("/").includes("..")) return { ok: false, error: "path_traversal" };
  const lower = filePath.toLowerCase();
  const segments = filePath.split("/");
  for (const seg of segments) {
    if (seg === "node_modules" || seg === ".next" || seg === "dist" || seg === ".git") {
      return { ok: false, error: "forbidden_segment", segment: seg };
    }
    if (seg.toLowerCase().startsWith(".env") || /^\.env(\.|$)/i.test(seg)) {
      return { ok: false, error: "forbidden_env_path" };
    }
  }
  if (lower.includes("/.env") || lower.startsWith(".env")) return { ok: false, error: "forbidden_env_path" };
  if (/\.(pem|key|p12|pfx)$/i.test(filePath)) return { ok: false, error: "forbidden_secret_extension" };
  const prefixes = getGithubWriteAllowPrefixes();
  const allowed = prefixes.some((pre) => filePath === pre || filePath.startsWith(pre));
  if (!allowed) return { ok: false, error: "path_not_whitelisted", allowedPrefixes: prefixes };
  return { ok: true, path: filePath };
}

function isSafeBranchName(b) {
  const s = String(b || "").trim();
  if (!s || s.length > 200) return false;
  if (s.includes("..") || /\s/.test(s)) return false;
  return /^[\w./-]+$/.test(s);
}

async function githubRestRaw(method, pathFromApiRoot, body) {
  const token = getGithubToken();
  if (!token) return { ok: false, status: 0, error: "GITHUB_TOKEN_not_configured" };
  const url = `https://api.github.com${pathFromApiRoot.startsWith("/") ? pathFromApiRoot : `/${pathFromApiRoot}`}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "sentinel-ledger-ops-tools"
  };
  if (body !== undefined && body !== null) headers["Content-Type"] = "application/json";
  const r = await fetch(url, {
    method,
    headers,
    body: body !== undefined && body !== null ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (_) {
      json = { _raw: text.slice(0, 1500) };
    }
  }
  return { ok: r.ok, status: r.status, json, text: text.slice(0, 4000) };
}

async function githubGetDefaultBranch(repo) {
  const path = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;
  const r = await githubRestRaw("GET", path, null);
  if (!r.ok) return { ok: false, ...r };
  const db = r.json?.default_branch;
  if (!db) return { ok: false, error: "default_branch_missing", json: r.json };
  return { ok: true, defaultBranch: db };
}

async function githubGetRefSha(repo, refName) {
  const enc = refName.replace(/^refs\//, "");
  const path = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/ref/heads/${encodeURIComponent(enc)}`;
  const r = await githubRestRaw("GET", path, null);
  if (!r.ok) return { ok: false, ...r, error: "ref_not_found" };
  const sha = r.json?.object?.sha;
  if (!sha) return { ok: false, error: "ref_sha_missing", json: r.json };
  return { ok: true, sha };
}

async function githubGetCommit(repo, commitSha) {
  const path = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/commits/${commitSha}`;
  const r = await githubRestRaw("GET", path, null);
  if (!r.ok) return { ok: false, ...r };
  const treeSha = r.json?.tree?.sha;
  if (!treeSha) return { ok: false, error: "commit_tree_missing", json: r.json };
  return { ok: true, treeSha, commit: r.json };
}

function getGithubReadAllowPrefixes() {
  const raw = String(process.env.OPS_REPO_READ_ALLOW_PREFIXES || "").trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim().replace(/\\/g, "/").replace(/^\/+/, ""))
      .filter(Boolean);
  }
  return ["frontend/", "backend/", "docs/", ".github/"];
}

function isGithubReadPathAllowed(rel) {
  const filePath = normalizeGithubWritePath(rel);
  if (!filePath || filePath.length > 500) return { ok: false, error: "bad_path" };
  if (filePath.includes("..") || filePath.split("/").includes("..")) return { ok: false, error: "path_traversal" };
  const segments = filePath.split("/");
  for (const seg of segments) {
    if (seg === "node_modules" || seg === ".next" || seg === "dist" || seg === ".git") {
      return { ok: false, error: "forbidden_segment", segment: seg };
    }
    if (seg.toLowerCase().startsWith(".env") || /^\.env(\.|$)/i.test(seg)) {
      return { ok: false, error: "forbidden_env_path" };
    }
  }
  if (filePath.toLowerCase().includes("/.env") || filePath.toLowerCase().startsWith(".env")) {
    return { ok: false, error: "forbidden_env_path" };
  }
  if (/\.(pem|key|p12|pfx)$/i.test(filePath)) return { ok: false, error: "forbidden_secret_extension" };
  const prefixes = getGithubReadAllowPrefixes();
  const allowed = prefixes.some((pre) => filePath === pre || filePath.startsWith(pre));
  if (!allowed) return { ok: false, error: "path_not_whitelisted", allowedPrefixes: prefixes };
  return { ok: true, path: filePath };
}

async function githubReadRepoFile(repo, relPath, refMandatory) {
  const check = isGithubReadPathAllowed(relPath);
  if (!check.ok) return { ok: false, error: "path_validation_failed", reason: check };
  const p = check.path;
  const enc = p.split("/").map((s) => encodeURIComponent(s)).join("/");
  const ref = String(refMandatory || "").trim();
  if (!ref) return { ok: false, error: "ref_required_for_github_read" };
  const url = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${enc}?ref=${encodeURIComponent(ref)}`;
  const r = await githubRestRaw("GET", url, null);
  if (!r.ok) {
    return {
      ok: false,
      status: r.status,
      error: "github_contents_failed",
      message: r.json?.message || r.text
    };
  }
  const data = r.json;
  if (Array.isArray(data)) return { ok: false, error: "path_is_directory" };
  if (data.type !== "file") return { ok: false, error: "not_a_file", type: data.type };
  if (Number(data.size) > MAX_FILE_BYTES) return { ok: false, error: "file_too_large", size: data.size };
  if (data.encoding !== "base64" || typeof data.content !== "string") {
    return { ok: false, error: "unsupported_blob", hint: "GitHub returned non-base64 payload (symlink or empty)." };
  }
  const buf = Buffer.from(String(data.content).replace(/\n/g, ""), "base64");
  if (buf.length > MAX_FILE_BYTES) return { ok: false, error: "file_too_large_after_decode" };
  const content = buf.toString("utf8");
  return { ok: true, content, bytes: buf.length, sha: data.sha, path: p };
}

router.post("/repo/read", requireOpsKey, toolsLimiter, async (req, res) => {
  try {
    const rel = req.body?.path ?? req.body?.file;
    if (!rel || typeof rel !== "string") {
      return res.status(400).json({ ok: false, error: "path_required" });
    }

    const sourceRaw = String(req.body?.source || "local").toLowerCase().trim();
    const source = ["local", "github", "auto"].includes(sourceRaw) ? sourceRaw : "local";
    const refParam = String(req.body?.ref || "").trim();
    const fallbackGithub = process.env.OPS_REPO_READ_FALLBACK_GITHUB === "1";

    const sendGithub = async () => {
      const repo = parseGithubRepo();
      if (!repo) return res.status(503).json({ ok: false, error: "GITHUB_REPOSITORY_not_configured" });
      if (!getGithubToken()) return res.status(503).json({ ok: false, error: "GITHUB_TOKEN_not_configured" });
      const meta = await githubGetDefaultBranch(repo);
      if (!meta.ok) {
        return res.status(502).json({ ok: false, error: "github_default_branch_failed", detail: meta });
      }
      const refUse = refParam || meta.defaultBranch;
      const g = await githubReadRepoFile(repo, rel, refUse);
      if (!g.ok) {
        const st = Number(g.status) || 404;
        return res.status(st >= 400 && st < 600 ? st : 404).json({ ok: false, ...g });
      }
      return res.json({
        ok: true,
        path: g.path,
        source: "github",
        ref: refUse,
        bytes: g.bytes,
        content: g.content,
        sha: g.sha,
        repository: `${repo.owner}/${repo.repo}`
      });
    };

    if (source === "github") {
      return await sendGithub();
    }

    const resolved = resolveSafeRepoPath(rel);
    if (!resolved.ok) return res.status(400).json({ ok: false, error: resolved.error });

    if (fs.existsSync(resolved.abs) && fs.statSync(resolved.abs).isFile()) {
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
        content,
        source: "local"
      });
    }

    if (source === "auto" && fallbackGithub) {
      return await sendGithub();
    }

    return res.status(404).json({ ok: false, error: "not_found", source: "local" });
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
      ref,
      inputs
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "github_dispatch_exception" });
  }
});

router.post("/github/commit", requireOpsKey, writeToolsLimiter, async (req, res) => {
  try {
    if (!req.body?.confirm) {
      return res.status(400).json({
        ok: false,
        error: "confirm_required",
        hint: "Set confirm:true to create a commit on GitHub (writes remote repo)."
      });
    }
    if (!getGithubToken()) return res.status(503).json({ ok: false, error: "GITHUB_TOKEN_not_configured" });

    const repo = parseGithubRepo();
    if (!repo) return res.status(503).json({ ok: false, error: "GITHUB_REPOSITORY_not_configured" });

    const files = Array.isArray(req.body.files) ? req.body.files : [];
    if (files.length === 0 || files.length > GITHUB_COMMIT_MAX_FILES) {
      return res.status(400).json({
        ok: false,
        error: "files_count_invalid",
        min: 1,
        max: GITHUB_COMMIT_MAX_FILES
      });
    }

    const branch = String(req.body.branch || "").trim();
    if (!isSafeBranchName(branch)) {
      return res.status(400).json({
        ok: false,
        error: "invalid_branch",
        hint: "Use a branch name like feature/ops-auto-123 (letters, numbers, /, -, _)."
      });
    }

    const message = String(req.body.message || "").trim();
    if (!message || message.length > 500) {
      return res.status(400).json({ ok: false, error: "message_required", maxLen: 500 });
    }

    const meta = await githubGetDefaultBranch(repo);
    if (!meta.ok) return res.status(502).json({ ok: false, error: "github_repo_meta_failed", detail: meta });

    const baseBranch = String(req.body.baseBranch || meta.defaultBranch).trim();
    const updateExistingBranch = Boolean(req.body.updateExistingBranch);
    const allowDirectPushDefault = Boolean(req.body.allowDirectPushDefault);

    if (branch === baseBranch && !allowDirectPushDefault) {
      return res.status(400).json({
        ok: false,
        error: "cannot_commit_directly_to_default",
        hint: "Use a feature branch + createPR, or set allowDirectPushDefault:true only for intentional fast-forward to default."
      });
    }

    const treeEntries = [];
    for (const f of files) {
      const rel = f?.path ?? f?.file;
      const check = isGithubWritePathAllowed(rel);
      if (!check.ok) {
        return res.status(400).json({ ok: false, error: "path_validation_failed", path: rel, reason: check });
      }
      const action = String(f.action || "update").toLowerCase();
      if (!["create", "update", "delete"].includes(action)) {
        return res.status(400).json({ ok: false, error: "invalid_action", path: check.path, action });
      }
      if (action === "delete") {
        treeEntries.push({ path: check.path, mode: "100644", type: "blob", sha: null });
      } else {
        const content = f.content == null ? "" : String(f.content);
        if (content.length > GITHUB_COMMIT_MAX_BYTES_PER_FILE) {
          return res.status(413).json({
            ok: false,
            error: "file_too_large",
            path: check.path,
            maxBytes: GITHUB_COMMIT_MAX_BYTES_PER_FILE
          });
        }
        treeEntries.push({ path: check.path, mode: "100644", type: "blob", content });
      }
    }

    const branchRefPath = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/ref/heads/${encodeURIComponent(branch)}`;
    const branchHeadRes = await githubRestRaw("GET", branchRefPath, null);
    const branchExists = branchHeadRes.ok;

    let parentSha;
    if (branchExists) {
      if (branch !== baseBranch && !updateExistingBranch) {
        return res.status(409).json({
          ok: false,
          error: "branch_already_exists",
          hint: "Set updateExistingBranch:true to stack a new commit on that branch."
        });
      }
      parentSha = branchHeadRes.json?.object?.sha;
      if (!parentSha) return res.status(502).json({ ok: false, error: "branch_ref_missing_sha" });
    } else {
      const baseRef = await githubGetRefSha(repo, baseBranch);
      if (!baseRef.ok) {
        return res.status(400).json({ ok: false, error: "base_branch_not_found", baseBranch, detail: baseRef });
      }
      parentSha = baseRef.sha;
    }

    const parentCommit = await githubGetCommit(repo, parentSha);
    if (!parentCommit.ok) return res.status(502).json({ ok: false, error: "parent_commit_failed", detail: parentCommit });

    const treeUrl = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/trees`;
    const treeRes = await githubRestRaw("POST", treeUrl, {
      base_tree: parentCommit.treeSha,
      tree: treeEntries
    });
    if (!treeRes.ok) {
      return res.status(502).json({
        ok: false,
        error: "github_tree_failed",
        status: treeRes.status,
        message: treeRes.json?.message || treeRes.text
      });
    }
    const newTreeSha = treeRes.json?.sha;
    if (!newTreeSha) return res.status(502).json({ ok: false, error: "tree_sha_missing", json: treeRes.json });

    const commitUrl = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/commits`;
    const commitRes = await githubRestRaw("POST", commitUrl, {
      message,
      tree: newTreeSha,
      parents: [parentSha]
    });
    if (!commitRes.ok) {
      return res.status(502).json({
        ok: false,
        error: "github_commit_failed",
        status: commitRes.status,
        message: commitRes.json?.message || commitRes.text
      });
    }
    const newCommitSha = commitRes.json?.sha;
    if (!newCommitSha) return res.status(502).json({ ok: false, error: "commit_sha_missing" });

    if (branchExists) {
      const patchUrl = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/refs/heads/${encodeURIComponent(branch)}`;
      const patchRes = await githubRestRaw("PATCH", patchUrl, { sha: newCommitSha });
      if (!patchRes.ok) {
        return res.status(502).json({ ok: false, error: "github_ref_update_failed", detail: patchRes });
      }
    } else {
      const createUrl = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/refs`;
      const createRes = await githubRestRaw("POST", createUrl, {
        ref: `refs/heads/${branch}`,
        sha: newCommitSha
      });
      if (!createRes.ok) {
        return res.status(502).json({ ok: false, error: "github_ref_create_failed", detail: createRes });
      }
    }

    let pr = null;
    let prSkipped = null;
    const wantPr = Boolean(req.body.createPR);
    if (wantPr) {
      if (branch === baseBranch) {
        prSkipped = "createPR_ignored_same_as_base";
      } else {
        const prTitle = String(req.body.prTitle || message).slice(0, 300);
        const prBody = String(req.body.prBody || "").slice(0, 20000);
        const pullsUrl = `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/pulls`;
        const prRes = await githubRestRaw("POST", pullsUrl, {
          title: prTitle,
          head: branch,
          base: baseBranch,
          body: prBody || undefined
        });
        if (!prRes.ok) {
          pr = {
            created: false,
            error: prRes.json?.message || prRes.text,
            status: prRes.status
          };
        } else {
          pr = {
            created: true,
            number: prRes.json?.number,
            url: prRes.json?.html_url,
            id: prRes.json?.id
          };
        }
      }
    }

    return res.json({
      ok: true,
      committed: true,
      repository: `${repo.owner}/${repo.repo}`,
      branch,
      baseBranch,
      commitSha: newCommitSha,
      treeSha: newTreeSha,
      paths: treeEntries.map((e) => e.path),
      pr,
      prSkipped
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || "github_commit_exception" });
  }
});

router.runOpsReadOnlySelect = runOpsReadOnlySelect;
module.exports = router;
