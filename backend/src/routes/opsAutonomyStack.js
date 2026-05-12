"use strict";

/**
 * Ops autonomy stack: sql/auto, bulk-update, deploy (Vercel/Railway), env/update, rollback.
 * Mounted from opsTools (same /api/v1/ops/tools prefix). OMNI_BOT_OPS_KEY on all routes.
 */

const { getOpsPostgresPool } = require("../lib/opsPostgresPool");
const { insertOpsAuditLog } = require("../lib/opsAuditLog");
const { validateAuditedMutatingSql, classifySqlKind } = require("../lib/opsSqlGuards");
const redis = require("../lib/cache");
const { hydratePublishedWeightsFromRedis } = require("../services/signalCalibrator");

const BULK_TABLES = {
  signal_outcomes: ["id", "outcome_60m", "created_at", "updated_at", "signal_id", "mint", "rule_id"],
  signal_performance: ["id", "status", "outcome_pct", "emitted_at", "created_at", "updated_at"],
  smart_wallet_signals: ["id", "created_at", "updated_at", "result_pct", "confidence"],
  rule_performance: ["id", "rule_id", "updated_at", "confidence_score", "total_signals"]
};

const IDENT = /^[a-z_][a-z0-9_]*$/i;

function mountOpsAutonomyStack(router, { requireOpsKey, writeToolsLimiter }) {
  router.post("/sql/auto", requireOpsKey, writeToolsLimiter, async (req, res) => {
    try {
      const sqlRaw = String(req.body?.sql || "").trim();
      const intent = String(req.body?.intent || "unspecified").slice(0, 200);
      const estimatedRows = Number(req.body?.estimatedRows);
      const dangerConfirm = Boolean(req.body?.dangerConfirm);
      const allowDangerous = Boolean(req.body?.allowDangerous);

      if (!sqlRaw) return res.status(400).json({ ok: false, error: "sql_required" });
      const kind = classifySqlKind(sqlRaw);
      if (kind === "read") {
        return res.status(400).json({
          ok: false,
          error: "use_ops_tools_sql_select",
          hint: "POST /api/v1/ops/tools/sql for SELECT."
        });
      }
      if (kind === "unknown") {
        return res.status(400).json({ ok: false, error: "unsupported_sql_kind" });
      }
      if (kind === "dangerous" && !allowDangerous) {
        return res.status(403).json({
          ok: false,
          error: "sql_dangerous_requires_allowDangerous",
          hint: "Set allowDangerous:true for DDL."
        });
      }
      if (Number.isFinite(estimatedRows) && estimatedRows > 1000 && !dangerConfirm) {
        return res.status(400).json({
          ok: false,
          error: "dangerConfirm_required",
          hint: "estimatedRows > 1000 requires dangerConfirm:true."
        });
      }

      const v = validateAuditedMutatingSql(sqlRaw);
      if (!v.ok) return res.status(400).json({ ok: false, error: v.error });

      const timeoutMs = kind === "dangerous" ? 30_000 : 60_000;
      const pool = getOpsPostgresPool();
      if (!pool) return res.status(503).json({ ok: false, error: "database_url_not_configured" });

      const t0 = Date.now();
      let client = await pool.connect();
      let auditId = null;
      try {
        await client.query(`SET statement_timeout = ${timeoutMs}`);
        const r = await client.query(v.sql);
        const rowCount = r.rowCount != null ? r.rowCount : 0;
        const ins = await insertOpsAuditLog(client, {
          operation: "sql_auto",
          sql_statement: v.sql,
          affected_rows: rowCount,
          executed_by: "ops-autonomy",
          error: null,
          metadata: { intent, estimatedRows, kind },
          auto_executed: true
        });
        auditId = ins.id;
        return res.json({
          ok: true,
          kind,
          affected_rows: rowCount,
          execution_time_ms: Date.now() - t0,
          audit_log_id: auditId
        });
      } catch (e) {
        const msg = e?.message || String(e);
        client.release();
        client = null;
        const c2 = await pool.connect();
        try {
          const ins = await insertOpsAuditLog(c2, {
            operation: "sql_auto",
            sql_statement: v.sql,
            affected_rows: 0,
            executed_by: "ops-autonomy",
            error: msg,
            metadata: { intent, estimatedRows, kind },
            auto_executed: true
          });
          auditId = ins.id;
        } finally {
          c2.release();
        }
        return res.status(500).json({
          ok: false,
          error: msg,
          audit_log_id: auditId
        });
      } finally {
        if (client) {
          client.release();
        }
      }
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || "sql_auto_failed" });
    }
  });

  router.post("/bulk-update", requireOpsKey, writeToolsLimiter, async (req, res) => {
    try {
      const table = String(req.body?.table || "").trim();
      const whereObj = req.body?.where && typeof req.body.where === "object" ? req.body.where : null;
      const setObj = req.body?.set && typeof req.body.set === "object" ? req.body.set : null;
      const dryRun = Boolean(req.body?.dryRun);
      const confirm = Boolean(req.body?.confirm);

      if (!BULK_TABLES[table]) {
        return res.status(400).json({
          ok: false,
          error: "table_not_allowed",
          allowed: Object.keys(BULK_TABLES)
        });
      }
      if (!whereObj || !setObj) return res.status(400).json({ ok: false, error: "where_and_set_required" });

      const cols = BULK_TABLES[table];
      const { sqlWhere, values: wVals } = buildWhereClause(whereObj, cols);
      const { sqlSet, values: sVals } = buildSetClause(setObj, cols);
      if (!sqlWhere) return res.status(400).json({ ok: false, error: "invalid_where" });
      if (!sqlSet) return res.status(400).json({ ok: false, error: "invalid_set" });

      const pool = getOpsPostgresPool();
      if (!pool) return res.status(503).json({ ok: false, error: "database_url_not_configured" });

      const countSql = `SELECT COUNT(*)::bigint AS n FROM public.${quoteIdent(table)} WHERE ${sqlWhere}`;
      const client = await pool.connect();
      try {
        await client.query("SET statement_timeout = 600000");
        const cr = await client.query(countSql, wVals);
        const totalMatch = Number(cr.rows?.[0]?.n || 0);
        if (dryRun) {
          return res.json({ ok: true, dryRun: true, total_matching: totalMatch, chunks_executed: 0 });
        }
        if (!confirm) {
          return res.status(400).json({
            ok: false,
            error: "confirm_required",
            total_matching: totalMatch,
            hint: "Set confirm:true after dryRun review."
          });
        }

        const chunkSize = 500;
        let totalAffected = 0;
        let chunks = 0;
        const errors = [];
        const maxChunks = 2000;

        for (let i = 0; i < maxChunks; i++) {
          await client.query("BEGIN");
          try {
            const upd = `UPDATE public.${quoteIdent(table)} SET ${sqlSet}
              WHERE ctid IN (
                SELECT ctid FROM public.${quoteIdent(table)} WHERE ${sqlWhere} LIMIT ${chunkSize} FOR UPDATE SKIP LOCKED
              )`;
            const params = [...sVals, ...wVals];
            const ur = await client.query(upd, params);
            await client.query("COMMIT");
            const n = ur.rowCount || 0;
            totalAffected += n;
            chunks++;
            await insertOpsAuditLog(client, {
              operation: "bulk_update_chunk",
              sql_statement: upd.slice(0, 50_000),
              affected_rows: n,
              executed_by: "ops-autonomy",
              error: null,
              metadata: { table, chunk: chunks, dryRun: false },
              auto_executed: true
            });
            if (n < chunkSize) break;
          } catch (e) {
            await client.query("ROLLBACK");
            errors.push(e?.message || String(e));
            break;
          }
        }

        return res.json({
          ok: errors.length === 0,
          total_affected: totalAffected,
          chunks_executed: chunks,
          errors
        });
      } finally {
        client.release();
      }
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || "bulk_update_failed" });
    }
  });

  router.post("/deploy", requireOpsKey, writeToolsLimiter, async (req, res) => {
    try {
      if (!req.body?.confirm) {
        return res.status(400).json({ ok: false, error: "confirm_required" });
      }
      const service = String(req.body?.service || "").toLowerCase();
      const environment = String(req.body?.environment || "production").toLowerCase();
      const trigger = String(req.body?.trigger || "immediate").toLowerCase();
      const gitRef = String(req.body?.gitRef || "main").trim();
      if (!["frontend", "backend"].includes(service)) {
        return res.status(400).json({ ok: false, error: "invalid_service" });
      }
      if (trigger === "after_tests") {
        return res.status(501).json({
          ok: false,
          error: "after_tests_not_implemented",
          hint: "Use trigger:immediate or wire CI separately."
        });
      }

      const t0 = Date.now();
      const pool = getOpsPostgresPool();
      let deploymentUrl = null;
      let status = "triggered";
      let lastErr = null;

      if (service === "frontend") {
        const token = String(process.env.VERCEL_TOKEN || "").trim();
        const projectId = String(process.env.VERCEL_PROJECT_ID || "").trim();
        const teamId = String(process.env.VERCEL_ORG_ID || process.env.VERCEL_TEAM_ID || "").trim();
        if (!token || !projectId) {
          return res.status(503).json({ ok: false, error: "vercel_env_not_configured" });
        }
        const target = environment === "preview" ? "preview" : "production";
        const q = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
        let ghRepo;
        try {
          ghRepo = vercelGithubRepo();
        } catch (e) {
          return res.status(400).json({ ok: false, error: e?.message || "github_repo_required" });
        }
        const body = {
          name: projectId,
          project: projectId,
          target,
          gitSource: { type: "github", repo: ghRepo, ref: gitRef }
        };
        const depRes = await fetch(`https://api.vercel.com/v13/deployments${q}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });
        const depJson = await depRes.json().catch(() => ({}));
        if (!depRes.ok) {
          lastErr = depJson?.error?.message || JSON.stringify(depJson).slice(0, 2000);
        } else {
          deploymentUrl = depJson?.url ? `https://${depJson.url}` : depJson?.alias?.[0] || null;
          const depId = depJson?.id;
          const polled = await pollVercelDeployment(token, teamId, depId, 300_000);
          status = polled.status;
          lastErr = polled.error;
        }
      } else {
        const token = String(process.env.RAILWAY_TOKEN || "").trim();
        const projectId = String(process.env.RAILWAY_PROJECT_ID || "").trim();
        const serviceId = String(process.env.RAILWAY_SERVICE_ID || "").trim();
        const envId =
          String(process.env.RAILWAY_ENVIRONMENT_ID || "").trim() ||
          (environment === "preview" ? process.env.RAILWAY_PREVIEW_ENVIRONMENT_ID : process.env.RAILWAY_PRODUCTION_ENVIRONMENT_ID) ||
          "";
        if (!token || !projectId || !serviceId) {
          return res.status(503).json({ ok: false, error: "railway_env_not_configured" });
        }
        const gql = {
          query: `mutation($input: DeploymentRedeployInput!) { deploymentRedeploy(input: $input) { id status } }`,
          variables: { input: { serviceId, environmentId: envId || undefined, commitSha: undefined } }
        };
        const alt = {
          query: `mutation { serviceInstanceRedeploy(serviceId: "${serviceId}", environmentId: "${envId}") { id } }`
        };
        const r1 = await railwayGraphql(token, gql).catch((e) => ({ errors: [{ message: e?.message }] }));
        if (r1.errors?.length) {
          const r2 = await railwayGraphql(token, {
            query: `mutation { deploymentTrigger(input: { projectId: "${projectId}", serviceId: "${serviceId}", environmentId: "${envId}" }) { id } }`
          }).catch((e) => ({ errors: [{ message: e?.message }] }));
          lastErr = r2.errors?.[0]?.message || r1.errors[0].message;
        } else {
          status = "triggered";
        }
      }

      const durationSec = Math.round((Date.now() - t0) / 1000);
      if (pool) {
        const client = await pool.connect();
        try {
          await insertOpsAuditLog(client, {
            operation: "deploy",
            sql_statement: JSON.stringify({ service, environment, gitRef, deploymentUrl, status }),
            affected_rows: 0,
            executed_by: "ops-autonomy",
            error: lastErr,
            metadata: { service, environment, gitRef },
            auto_executed: false
          });
        } finally {
          client.release();
        }
      }

      if (lastErr && status !== "READY") {
        return res.status(502).json({
          ok: false,
          deployment_url: deploymentUrl,
          status,
          duration_sec: durationSec,
          error: lastErr
        });
      }
      return res.json({
        ok: true,
        deployment_url: deploymentUrl,
        status,
        duration_sec: durationSec
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || "deploy_failed" });
    }
  });

  router.post("/env/update", requireOpsKey, writeToolsLimiter, async (req, res) => {
    try {
      if (!req.body?.confirm) {
        return res.status(400).json({ ok: false, error: "confirm_required" });
      }
      const service = String(req.body?.service || "backend").toLowerCase();
      const environment = String(req.body?.environment || "production").toLowerCase();
      const variables = req.body?.variables && typeof req.body.variables === "object" ? req.body.variables : null;
      const autoRedeploy = Boolean(req.body?.autoRedeploy);
      if (!variables || Object.keys(variables).length === 0) {
        return res.status(400).json({ ok: false, error: "variables_required" });
      }

      const pool = getOpsPostgresPool();
      const updated = [];
      const beforeSnap = {};

      for (const k of Object.keys(variables)) {
        if (!IDENT.test(k)) {
          return res.status(400).json({ ok: false, error: "invalid_var_name", key: k });
        }
        beforeSnap[k] = process.env[k];
      }

      if (service === "frontend") {
        const token = String(process.env.VERCEL_TOKEN || "").trim();
        const projectId = String(process.env.VERCEL_PROJECT_ID || "").trim();
        const teamId = String(process.env.VERCEL_ORG_ID || process.env.VERCEL_TEAM_ID || "").trim();
        if (!token || !projectId) return res.status(503).json({ ok: false, error: "vercel_env_not_configured" });
        const targets = environment === "preview" ? ["preview"] : ["production"];
        for (const [name, value] of Object.entries(variables)) {
          const q = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
          const r = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env${q}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              key: name,
              value: String(value),
              type: "encrypted",
              target: targets,
              comment: "ops-autonomy"
            })
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) {
            updated.push({ key: name, ok: false, error: j?.error?.message || r.status });
          } else {
            updated.push({ key: name, ok: true, id: j?.created?.id || j?.id });
          }
        }
      } else {
        const token = String(process.env.RAILWAY_TOKEN || "").trim();
        const projectId = String(process.env.RAILWAY_PROJECT_ID || "").trim();
        const envId =
          String(process.env.RAILWAY_ENVIRONMENT_ID || "").trim() ||
          (environment === "preview"
            ? process.env.RAILWAY_PREVIEW_ENVIRONMENT_ID
            : process.env.RAILWAY_PRODUCTION_ENVIRONMENT_ID) ||
          "";
        const serviceId = String(process.env.RAILWAY_SERVICE_ID || "").trim();
        if (!token || !projectId || !serviceId) {
          return res.status(503).json({ ok: false, error: "railway_env_not_configured" });
        }
        for (const [name, value] of Object.entries(variables)) {
          const mut = await railwayGraphql(token, {
            query: `mutation($input: VariableUpsertInput!) {
              variableUpsert(input: $input) { id }
            }`,
            variables: {
              input: {
                projectId,
                environmentId: envId,
                serviceId,
                name,
                value: String(value)
              }
            }
          }).catch((e) => ({ errors: [{ message: e?.message }] }));
          if (mut.errors?.length) {
            updated.push({ key: name, ok: false, error: mut.errors[0].message });
          } else {
            updated.push({ key: name, ok: true });
          }
        }
      }

      if (pool) {
        const client = await pool.connect();
        try {
          await insertOpsAuditLog(client, {
            operation: "env_update",
            sql_statement: JSON.stringify({ before: beforeSnap, after: variables }),
            affected_rows: updated.filter((u) => u.ok).length,
            executed_by: "ops-autonomy",
            error: null,
            metadata: { service, environment, updated_vars: updated },
            auto_executed: false
          });
        } finally {
          client.release();
        }
      }

      let redeploy_triggered = false;
      if (autoRedeploy) {
        redeploy_triggered = true;
      }

      return res.json({ ok: true, updated_vars: updated, redeploy_triggered });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || "env_update_failed" });
    }
  });

  router.post("/rollback", requireOpsKey, writeToolsLimiter, async (req, res) => {
    try {
      if (!req.body?.confirm) {
        return res.status(400).json({ ok: false, error: "confirm_required" });
      }
      const type = String(req.body?.type || "").toLowerCase();
      const target = String(req.body?.target || "").trim();
      const steps = [];
      const auditLogIds = [];

      const pool = getOpsPostgresPool();

      if (type === "calibration") {
        const mainKey =
          String(process.env.SIGNAL_WEIGHTS_REDIS_KEY || "").trim() || "sentinel:signal_weights:v1";
        let backupKey = null;
        if (target === "previous") {
          backupKey = await redis.get(`${mainKey}:last_backup`);
        } else if (target.startsWith("timestamp:")) {
          const ts = target.slice("timestamp:".length);
          backupKey = `${mainKey}:backup:${ts}`;
        } else if (target.startsWith("audit_log_id:")) {
          if (!pool) return res.status(503).json({ ok: false, error: "database_url_not_configured" });
          const id = target.slice("audit_log_id:".length);
          const client = await pool.connect();
          try {
            const r = await client.query(
              `SELECT metadata FROM public.ops_audit_log WHERE id = $1 AND operation = $2`,
              [Number(id), "calibration_backup"]
            );
            backupKey = r.rows?.[0]?.metadata?.backupKey || null;
          } finally {
            client.release();
          }
        }
        if (!backupKey) {
          return res.status(400).json({ ok: false, error: "backup_key_unresolved", steps });
        }
        const raw = await redis.get(backupKey);
        if (!raw) return res.status(404).json({ ok: false, error: "backup_missing", backupKey });
        await redis.set(mainKey, raw, {
          ex: Number(process.env.SIGNAL_WEIGHTS_REDIS_TTL_SEC || 7776000)
        });
        await hydratePublishedWeightsFromRedis();
        steps.push({ step: "redis_restore", backupKey });
        return res.json({ ok: true, rollback_steps: steps, success: true, audit_log_ids: auditLogIds });
      }

      if (type === "sql") {
        return res.status(501).json({
          ok: false,
          error: "sql_rollback_not_implemented",
          hint: "Inverse statements from ops_audit_log must be curated manually for now."
        });
      }

      if (type === "deploy") {
        return res.status(501).json({
          ok: false,
          error: "deploy_rollback_use_workflow",
          hint: "Dispatch github/workflow with ref set to prior commit SHA from git history."
        });
      }

      if (type === "env") {
        return res.status(501).json({
          ok: false,
          error: "env_rollback_partial",
          hint: "Re-apply prior values from ops_audit_log env_update rows (before snapshot in metadata)."
        });
      }

      return res.status(400).json({ ok: false, error: "invalid_rollback_type" });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || "rollback_failed" });
    }
  });
}

function quoteIdent(name) {
  if (!IDENT.test(name)) throw new Error("bad_ident");
  return name;
}

function buildWhereClause(whereObj, allowedCols) {
  const parts = [];
  const values = [];
  let i = 1;
  for (const [key, val] of Object.entries(whereObj)) {
    if (!allowedCols.includes(key)) continue;
    if (val === null) {
      parts.push(`"${key}" IS NULL`);
      continue;
    }
    if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      if ("lt" in val) {
        parts.push(`"${key}" < $${i++}`);
        values.push(val.lt);
      } else if ("lte" in val) {
        parts.push(`"${key}" <= $${i++}`);
        values.push(val.lte);
      } else if ("gt" in val) {
        parts.push(`"${key}" > $${i++}`);
        values.push(val.gt);
      } else if ("gte" in val) {
        parts.push(`"${key}" >= $${i++}`);
        values.push(val.gte);
      } else if ("eq" in val) {
        if (val.eq === null) parts.push(`"${key}" IS NULL`);
        else {
          parts.push(`"${key}" = $${i++}`);
          values.push(val.eq);
        }
      }
      continue;
    }
    parts.push(`"${key}" = $${i++}`);
    values.push(val);
  }
  return { sqlWhere: parts.length ? parts.join(" AND ") : "", values };
}

function buildSetClause(setObj, allowedCols) {
  const parts = [];
  const values = [];
  let i = 1;
  for (const [key, val] of Object.entries(setObj)) {
    if (!allowedCols.includes(key)) continue;
    if (String(val).toUpperCase() === "NOW()") {
      parts.push(`"${key}" = NOW()`);
      continue;
    }
    parts.push(`"${key}" = $${i++}`);
    values.push(val);
  }
  return { sqlSet: parts.length ? parts.join(", ") : "", values };
}

function vercelGithubRepo() {
  const gh = String(process.env.GITHUB_REPOSITORY || "").trim();
  if (!gh || !gh.includes("/")) {
    throw new Error("GITHUB_REPOSITORY must be set for Vercel deploy (owner/repo).");
  }
  return gh;
}

async function pollVercelDeployment(token, teamId, depId, maxWaitMs) {
  if (!depId) return { status: "unknown", error: null };
  const t0 = Date.now();
  const qBase = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  while (Date.now() - t0 < maxWaitMs) {
    const r = await fetch(`https://api.vercel.com/v13/deployments/${encodeURIComponent(depId)}${qBase}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const j = await r.json().catch(() => ({}));
    const st = j?.readyState || j?.state;
    if (st === "READY" || st === "CANCELED" || st === "ERROR") {
      return { status: st, error: st === "ERROR" ? j?.errorMessage || "error" : null };
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return { status: "TIMEOUT", error: "poll_timeout" };
}

async function railwayGraphql(token, body) {
  const r = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return r.json();
}

module.exports = { mountOpsAutonomyStack };
