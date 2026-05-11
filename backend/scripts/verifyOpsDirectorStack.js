#!/usr/bin/env node
"use strict";

/**
 * Check env vars for Ops agent + tools. Run from repo: cd backend && node scripts/verifyOpsDirectorStack.js
 * Optional: --strict → exit 1 if agent + SQL + GitHub bundle incomplete.
 */

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const backendRoot = path.resolve(__dirname, "..");
const envPath = path.join(backendRoot, ".env");
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

function has(k) {
  const v = process.env[k];
  return v != null && String(v).trim() !== "";
}

function pgEnv() {
  if (has("DATABASE_URL")) return "DATABASE_URL";
  if (has("SUPABASE_DATABASE_URL")) return "SUPABASE_DATABASE_URL";
  return null;
}

function githubRepo() {
  if (has("GITHUB_REPOSITORY")) return "GITHUB_REPOSITORY";
  if (has("GITHUB_REPO_OWNER") && has("GITHUB_REPO_NAME")) return "GITHUB_REPO_OWNER+NAME";
  return null;
}

function githubToken() {
  if (has("GITHUB_TOKEN")) return "GITHUB_TOKEN";
  if (has("GH_TOKEN")) return "GH_TOKEN";
  if (has("OPS_GITHUB_TOKEN")) return "OPS_GITHUB_TOKEN";
  return null;
}

const report = {
  agent: {
    ANTHROPIC_API_KEY: has("ANTHROPIC_API_KEY"),
    OMNI_BOT_OPS_KEY: has("OMNI_BOT_OPS_KEY")
  },
  sqlRead: {
    postgres: pgEnv(),
    ok: Boolean(pgEnv())
  },
  github: {
    token: githubToken(),
    repository: githubRepo(),
    ok: Boolean(githubToken() && githubRepo())
  },
  repoRead: {
    OPS_REPO_ROOT: process.env.OPS_REPO_ROOT || null,
    OPS_REPO_READ_FALLBACK_GITHUB: process.env.OPS_REPO_READ_FALLBACK_GITHUB === "1",
    hint: "Railway: set OPS_REPO_READ_FALLBACK_GITHUB=1 and GitHub vars so repo/read uses source=auto or github."
  },
  deploy: {
    workflow: ".github/workflows/deploy-production.yml",
    note: "Add secrets + real steps in that workflow; ops only dispatches workflow_dispatch."
  }
};

const strict = process.argv.includes("--strict");
const agentOk = report.agent.ANTHROPIC_API_KEY && report.agent.OMNI_BOT_OPS_KEY;
const exitCode = strict && (!agentOk || !report.sqlRead.ok || !report.github.ok) ? 1 : 0;

console.log(JSON.stringify(report, null, 2));
if (strict && exitCode) {
  console.error(
    "[verifyOpsDirectorStack] --strict: need ANTHROPIC_API_KEY + OMNI_BOT_OPS_KEY + Postgres env + GitHub token + repo id."
  );
}
process.exit(exitCode);
