"use strict";

/**
 * Anthropic tool definitions + executors for the ops Architect Agent.
 * Read/diagnostic tools auto-run; mutating tools require operator confirmation.
 */

const opsToolsRouter = require("../routes/opsTools");
const { getOpsPostgresPool } = require("../lib/opsPostgresPool");
const { insertOpsAuditLog } = require("../lib/opsAuditLog");
const {
  validateAuditedMutatingSql,
  validateReadOnlySelect,
  classifySqlKind
} = require("../lib/opsSqlGuards");
const { runCalibrationOnce, getCalibrationSnapshot } = require("./signalCalibrator");
const { runSignalGateTunerTick } = require("../jobs/signalGateTunerCron");
const { probeHealth } = require("./opsHealthProbe");
const redis = require("../lib/cache");

const PUBLIC_PROBE_TIMEOUT_MS = 2500;
const MAX_SQL_ROWS = 200;

/** @type {Record<string, "auto"|"requires_confirmation">} */
const OPS_TOOL_LEVELS = {
  repo_read: "auto",
  sql_select: "auto",
  sql_write: "requires_confirmation",
  sql_dangerous: "requires_confirmation",
  bulk_update_dry_run: "auto",
  bulk_update_apply: "requires_confirmation",
  health_probe: "auto",
  public_api_probe: "auto",
  redis_inspect: "auto",
  calibration_status: "auto",
  calibration_run: "requires_confirmation",
  tuner_run: "requires_confirmation",
  rollback_calibration: "requires_confirmation",
  deploy: "requires_confirmation",
  env_update: "requires_confirmation",
  github_commit: "requires_confirmation",
  github_workflow: "requires_confirmation"
};

const PUBLIC_PROBE_ALLOW = [
  "/health",
  "/health/ingestion",
  "/health/sync",
  "/health/webhook-queue",
  "/api/v1/signals/latest",
  "/api/v1/tokens/hot",
  "/api/v1/public/smart-wallets-leaderboard",
  "/api/v1/public/track-record"
];

const REDIS_KEY_PREFIXES = ["sentinel:signal_weights:", "sentinel:ops:", "health:"];

const OPS_AGENT_TOOLS = [
  {
    name: "repo_read",
    description: "Read a file from the monorepo (local disk or GitHub API). Paths must be whitelisted.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative path e.g. backend/src/server.js" },
        source: { type: "string", enum: ["local", "github", "auto"], description: "Default local" },
        ref: { type: "string", description: "Git ref for github source (default branch if omitted)" }
      },
      required: ["path"]
    }
  },
  {
    name: "sql_select",
    description: "Run a read-only SELECT against Postgres (single statement, no comments/semicolons).",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SELECT statement" },
        template: {
          type: "string",
          enum: ["ops_health_counts", "signal_performance_status_7d", "outcomes_pending_sample"]
        },
        params: { type: "object", description: "Template params e.g. { hours: 24 }" }
      }
    }
  },
  {
    name: "sql_write",
    description: "Execute audited DML (INSERT/UPDATE/DELETE/MERGE). Requires operator confirmation.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string" },
        intent: { type: "string", description: "Human-readable intent for audit log" }
      },
      required: ["sql"]
    }
  },
  {
    name: "sql_dangerous",
    description: "Execute DDL (DROP/TRUNCATE/ALTER/CREATE). Requires explicit operator confirmation.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string" },
        intent: { type: "string" }
      },
      required: ["sql"]
    }
  },
  {
    name: "bulk_update_dry_run",
    description: "Count rows that would match a bulk UPDATE on a whitelisted table (dry run).",
    input_schema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          enum: ["signal_outcomes", "signal_performance", "smart_wallet_signals", "rule_performance"]
        },
        where: { type: "object" },
        set: { type: "object" }
      },
      required: ["table", "where", "set"]
    }
  },
  {
    name: "bulk_update_apply",
    description: "Apply bulk UPDATE in chunks on a whitelisted table. Requires operator confirmation.",
    input_schema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          enum: ["signal_outcomes", "signal_performance", "smart_wallet_signals", "rule_performance"]
        },
        where: { type: "object" },
        set: { type: "object" }
      },
      required: ["table", "where", "set"]
    }
  },
  {
    name: "health_probe",
    description: "Read internal health snapshots (main, ingestion, sync, webhook-queue, or all).",
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: ["main", "ingestion", "sync", "webhook-queue", "all"],
          description: "Which health endpoint to mirror"
        }
      }
    }
  },
  {
    name: "public_api_probe",
    description: "HTTP GET a public API path on this backend (2.5s timeout, whitelisted paths only).",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path starting with / e.g. /health" },
        query: { type: "object", description: "Optional query string params" }
      },
      required: ["path"]
    }
  },
  {
    name: "redis_inspect",
    description: "Read whitelisted Redis keys (signal weights, ops markers, health ping).",
    input_schema: {
      type: "object",
      properties: {
        keys: {
          type: "array",
          items: { type: "string" },
          description: "Explicit keys to read; must match allowed prefixes"
        }
      }
    }
  },
  {
    name: "calibration_status",
    description: "Current calibration state: last run, published weights, Redis hydrate timestamps.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "calibration_run",
    description: "Run signal performance calibration once (updates rule weights). Requires confirmation.",
    input_schema: {
      type: "object",
      properties: {
        lookbackHours: { type: "number", description: "Optional lookback override" }
      }
    }
  },
  {
    name: "tuner_run",
    description: "Run signal gate adaptive tuner tick once. Requires confirmation.",
    input_schema: { type: "object", properties: {} }
  },
  {
    name: "rollback_calibration",
    description: "Restore calibration weights from Redis backup (previous or timestamp target).",
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: 'previous | timestamp:<iso-or-epoch> | audit_log_id:<id>'
        }
      }
    }
  },
  {
    name: "deploy",
    description: "Trigger Vercel (frontend) or Railway (backend) deploy. Requires confirmation.",
    input_schema: {
      type: "object",
      properties: {
        service: { type: "string", enum: ["frontend", "backend"] },
        environment: { type: "string", enum: ["production", "preview"] },
        gitRef: { type: "string", description: "Git ref for Vercel deploy (default main)" }
      },
      required: ["service"]
    }
  },
  {
    name: "env_update",
    description: "Update Vercel/Railway environment variables. Requires confirmation.",
    input_schema: {
      type: "object",
      properties: {
        service: { type: "string", enum: ["frontend", "backend"] },
        environment: { type: "string", enum: ["production", "preview"] },
        variables: { type: "object", description: "Key-value env vars" },
        autoRedeploy: { type: "boolean" }
      },
      required: ["service", "variables"]
    }
  },
  {
    name: "github_commit",
    description: "Create atomic Git commit (+ optional PR) on whitelisted paths. Requires confirmation.",
    input_schema: {
      type: "object",
      properties: {
        branch: { type: "string" },
        baseBranch: { type: "string" },
        message: { type: "string" },
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" },
              action: { type: "string", enum: ["create", "update", "delete"] }
            },
            required: ["path", "action"]
          }
        },
        createPR: { type: "boolean" },
        prTitle: { type: "string" },
        prBody: { type: "string" }
      },
      required: ["branch", "message", "files"]
    }
  },
  {
    name: "github_workflow",
    description: "Dispatch a GitHub Actions workflow. Requires confirmation.",
    input_schema: {
      type: "object",
      properties: {
        workflow: { type: "string" },
        ref: { type: "string" },
        inputs: { type: "object" }
      },
      required: ["workflow"]
    }
  }
];

function getToolLevel(name) {
  return OPS_TOOL_LEVELS[name] || "requires_confirmation";
}

function isRedisKeyAllowed(key) {
  const k = String(key || "").trim();
  if (!k || k.length > 256) return false;
  const mainKey =
    String(process.env.SIGNAL_WEIGHTS_REDIS_KEY || "").trim() || "sentinel:signal_weights:v1";
  const extras = [mainKey, `${mainKey}:last_backup`];
  if (extras.includes(k)) return true;
  return REDIS_KEY_PREFIXES.some((pre) => k.startsWith(pre));
}

function getInternalOpsBaseUrl() {
  const custom = String(process.env.OPS_AGENT_INTERNAL_BASE_URL || "").trim();
  if (custom) return custom.replace(/\/+$/, "");
  const port = Number(process.env.PORT || 3000);
  return `http://127.0.0.1:${port}`;
}

async function callOpsToolsEndpoint(path, body) {
  const opsKey = process.env.OMNI_BOT_OPS_KEY;
  if (!opsKey) return { ok: false, error: "ops_key_not_configured" };
  const url = `${getInternalOpsBaseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ops-key": opsKey
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, ...data };
  } catch (e) {
    return { ok: false, error: e?.name === "AbortError" ? "timeout" : e?.message || String(e) };
  } finally {
    clearTimeout(timer);
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

async function execSqlSelect(input) {
  let sql = null;
  if (input?.template) {
    sql = buildTemplateSql(input.template, input.params || {});
    if (!sql) return { ok: false, error: "unknown_template" };
  } else if (input?.sql) {
    sql = String(input.sql);
  } else {
    return { ok: false, error: "sql_or_template_required" };
  }
  const out = await opsToolsRouter.runOpsReadOnlySelect(sql);
  if (!out.ok) return out;
  return {
    ok: true,
    rowCount: out.rowCount,
    rows: (out.rows || []).slice(0, MAX_SQL_ROWS)
  };
}

async function execSqlMutating(input, { dangerous = false }) {
  const sqlRaw = String(input?.sql || "").trim();
  if (!sqlRaw) return { ok: false, error: "sql_required" };
  const kind = classifySqlKind(sqlRaw);
  if (kind === "read") return { ok: false, error: "use_sql_select_for_reads" };
  if (kind === "unknown") return { ok: false, error: "unsupported_sql_kind" };
  if (dangerous && kind !== "dangerous") {
    return { ok: false, error: "not_dangerous_sql", hint: "Use sql_write for DML." };
  }
  if (!dangerous && kind === "dangerous") {
    return { ok: false, error: "use_sql_dangerous_for_ddl" };
  }
  const v = validateAuditedMutatingSql(sqlRaw);
  if (!v.ok) return { ok: false, error: v.error };

  const pool = getOpsPostgresPool();
  if (!pool) return { ok: false, error: "database_url_not_configured" };
  const client = await pool.connect();
  const t0 = Date.now();
  try {
    await client.query("SET statement_timeout = 30000");
    const r = await client.query(v.sql);
    const rowCount = r.rowCount != null ? r.rowCount : 0;
    const audit = await insertOpsAuditLog(client, {
      operation: dangerous ? "agent_sql_dangerous" : "agent_sql_write",
      sql_statement: v.sql,
      affected_rows: rowCount,
      executed_by: "ops-agent-tool",
      error: null,
      metadata: { intent: String(input?.intent || "").slice(0, 200), kind },
      auto_executed: false
    });
    return {
      ok: true,
      kind,
      rowCount,
      execution_time_ms: Date.now() - t0,
      audit_log_id: audit?.id || null
    };
  } catch (e) {
    const msg = e?.message || String(e);
    try {
      await insertOpsAuditLog(client, {
        operation: dangerous ? "agent_sql_dangerous" : "agent_sql_write",
        sql_statement: v.sql,
        affected_rows: 0,
        executed_by: "ops-agent-tool",
        error: msg,
        metadata: { intent: String(input?.intent || "").slice(0, 200), kind },
        auto_executed: false
      });
    } catch (_) {}
    return { ok: false, error: msg };
  } finally {
    client.release();
  }
}

async function execBulkUpdate(input, { dryRun }) {
  const body = {
    table: input?.table,
    where: input?.where,
    set: input?.set,
    dryRun: !!dryRun,
    confirm: !dryRun
  };
  return callOpsToolsEndpoint("/api/v1/ops/tools/bulk-update", body);
}

async function execPublicApiProbe(input) {
  const rawPath = String(input?.path || "").trim();
  if (!rawPath.startsWith("/")) return { ok: false, error: "path_must_start_with_slash" };
  const pathOnly = rawPath.split("?")[0];
  if (!PUBLIC_PROBE_ALLOW.includes(pathOnly)) {
    return { ok: false, error: "path_not_whitelisted", allowed: PUBLIC_PROBE_ALLOW };
  }
  const base = getInternalOpsBaseUrl();
  const qs =
    input?.query && typeof input.query === "object"
      ? `?${new URLSearchParams(
          Object.fromEntries(
            Object.entries(input.query).map(([k, v]) => [k, String(v)])
          )
        ).toString()}`
      : "";
  const url = `${base}${pathOnly}${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUBLIC_PROBE_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method: "GET", signal: controller.signal });
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {
      json = { _raw: text.slice(0, 4000) };
    }
    return {
      ok: r.ok,
      status: r.status,
      latency_ms: Date.now() - t0,
      path: pathOnly,
      body: json
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.name === "AbortError" ? "timeout" : e?.message || String(e),
      latency_ms: Date.now() - t0
    };
  } finally {
    clearTimeout(timer);
  }
}

async function execRedisInspect(input) {
  const mainKey =
    String(process.env.SIGNAL_WEIGHTS_REDIS_KEY || "").trim() || "sentinel:signal_weights:v1";
  let keys = Array.isArray(input?.keys) ? input.keys.map(String) : [];
  if (keys.length === 0) {
    keys = [mainKey, `${mainKey}:last_backup`, "health:ping"];
  }
  const out = {};
  const rejected = [];
  for (const key of keys.slice(0, 12)) {
    if (!isRedisKeyAllowed(key)) {
      rejected.push(key);
      continue;
    }
    try {
      out[key] = await redis.get(key);
    } catch (e) {
      out[key] = { error: e?.message || String(e) };
    }
  }
  return { ok: true, values: out, rejected, allowedPrefixes: REDIS_KEY_PREFIXES };
}

/** Keyword heuristics when operator writes OK EJECUTAR in the same message. */
const CONFIRM_KEYWORDS = {
  calibration_run: [/\bcalibraci[oó]n\b/i, /\bcalibrat/i, /\bweights?\b/i, /\bpesos?\b/i],
  tuner_run: [/\btuner\b/i, /\bgate\s*adapt/i, /\badaptativ[oa]\b/i],
  sql_write: [/\bsql\s*write\b/i, /\bdml\b/i, /\bupdate\b/i, /\binsert\b/i, /\bdelete\b/i],
  sql_dangerous: [/\bddl\b/i, /\bdangerous\b/i, /\bdrop\b/i, /\btruncate\b/i],
  bulk_update_apply: [/\bbulk\b/i, /\bbatch\b/i],
  rollback_calibration: [/\brollback\b/i],
  deploy: [/\bdeploy\b/i],
  env_update: [/\benv\b/i, /\bvariable/i],
  github_commit: [/\bcommit\b/i, /\bgithub\b/i, /\bpr\b/i],
  github_workflow: [/\bworkflow\b/i]
};

/**
 * @param {string} toolName
 * @param {string} userMessage
 * @param {string[]} confirmTools explicit tool names from request body
 */
function isToolConfirmed(toolName, userMessage, confirmTools = []) {
  if (getToolLevel(toolName) === "auto") return true;
  if (Array.isArray(confirmTools) && confirmTools.includes(toolName)) return true;
  const m = String(userMessage || "");
  if (/\bCONFIRM\s+TOOL\s+[\w_]+\b/i.test(m)) {
    const re = new RegExp(`\\bCONFIRM\\s+TOOL\\s+${toolName}\\b`, "i");
    if (re.test(m)) return true;
  }
  if (!/\bOK\s+EJECUTAR\b/i.test(m) && !/\bOK\s+EXECUTE\b/i.test(m)) return false;
  const patterns = CONFIRM_KEYWORDS[toolName];
  if (!patterns) return true;
  return patterns.some((re) => re.test(m));
}

function confirmationRequiredPayload(toolName, input) {
  return {
    ok: false,
    status: "confirmation_required",
    tool: toolName,
    level: getToolLevel(toolName),
    input,
    confirmHints: [
      `Include "${toolName}" in confirmTools array in request body, or`,
      `Reply with: OK EJECUTAR (with context for ${toolName}), or`,
      `Reply with: CONFIRM TOOL ${toolName}`
    ]
  };
}

/**
 * Execute one agent tool.
 * @param {string} name
 * @param {object} input
 * @param {{ confirmed?: boolean, userMessage?: string, confirmTools?: string[] }} ctx
 */
async function executeOpsAgentTool(name, input = {}, ctx = {}) {
  const toolName = String(name || "").trim();
  if (!OPS_TOOL_LEVELS[toolName]) {
    return { ok: false, error: "unknown_tool", tool: toolName };
  }

  const needsConfirm = getToolLevel(toolName) === "requires_confirmation";
  const confirmed =
    ctx.confirmed === true ||
    isToolConfirmed(toolName, ctx.userMessage || "", ctx.confirmTools || []);

  if (needsConfirm && !confirmed) {
    return confirmationRequiredPayload(toolName, input);
  }

  try {
    switch (toolName) {
      case "repo_read":
        return callOpsToolsEndpoint("/api/v1/ops/tools/repo/read", {
          path: input.path,
          source: input.source || "auto",
          ref: input.ref
        });
      case "sql_select":
        return execSqlSelect(input);
      case "sql_write":
        return execSqlMutating(input, { dangerous: false });
      case "sql_dangerous":
        return execSqlMutating(input, { dangerous: true });
      case "bulk_update_dry_run":
        return execBulkUpdate(input, { dryRun: true });
      case "bulk_update_apply":
        return execBulkUpdate(input, { dryRun: false });
      case "health_probe":
        return { ok: true, ...(await probeHealth(input?.target || "main")) };
      case "public_api_probe":
        return execPublicApiProbe(input);
      case "redis_inspect":
        return execRedisInspect(input);
      case "calibration_status":
        return { ok: true, snapshot: getCalibrationSnapshot() };
      case "calibration_run": {
        const out = await runCalibrationOnce(
          Number.isFinite(Number(input?.lookbackHours))
            ? { lookbackHours: Number(input.lookbackHours) }
            : {}
        );
        return { ok: !!out?.ok, detail: out };
      }
      case "tuner_run": {
        const out = await runSignalGateTunerTick();
        return { ok: out?.ok !== false, detail: out };
      }
      case "rollback_calibration":
        return callOpsToolsEndpoint("/api/v1/ops/tools/rollback", {
          confirm: true,
          type: "calibration",
          target: input?.target || "previous"
        });
      case "deploy":
        return callOpsToolsEndpoint("/api/v1/ops/tools/deploy", {
          confirm: true,
          service: input.service,
          environment: input.environment || "production",
          trigger: "immediate",
          gitRef: input.gitRef || "main"
        });
      case "env_update":
        return callOpsToolsEndpoint("/api/v1/ops/tools/env/update", {
          confirm: true,
          service: input.service || "backend",
          environment: input.environment || "production",
          variables: input.variables,
          autoRedeploy: Boolean(input.autoRedeploy)
        });
      case "github_commit":
        return callOpsToolsEndpoint("/api/v1/ops/tools/github/commit", {
          confirm: true,
          ...input
        });
      case "github_workflow":
        return callOpsToolsEndpoint("/api/v1/ops/tools/github/workflow", {
          confirm: true,
          workflow: input.workflow,
          ref: input.ref || "main",
          inputs: input.inputs || {}
        });
      default:
        return { ok: false, error: "tool_not_implemented", tool: toolName };
    }
  } catch (e) {
    return { ok: false, error: e?.message || String(e), tool: toolName };
  }
}

module.exports = {
  OPS_AGENT_TOOLS,
  OPS_TOOL_LEVELS,
  getToolLevel,
  isToolConfirmed,
  executeOpsAgentTool
};
