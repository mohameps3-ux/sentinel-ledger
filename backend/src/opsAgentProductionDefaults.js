"use strict";

/**
 * Production-safe defaults for ops Architect Agent when Railway env vars are unset.
 * Does not override explicit env values. Loaded early from server.js.
 */
if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
  const defaults = {
    GITHUB_REPOSITORY: "mohameps3-ux/sentinel-ledger",
    OPS_AGENT_TOOL_USE_ENABLED: "true",
    OPS_AGENT_AUTONOMY_MODE: "full",
    OPS_AGENT_MAX_TOOL_ITERATIONS: "12",
    OPS_AGENT_MAX_TOOLS_PER_CONVERSATION: "40",
    OPS_AGENT_MAX_SQL_WRITES_PER_CONVERSATION: "10",
    OPS_AGENT_MAX_DEPLOYS_PER_CONVERSATION: "2",
    OPS_AGENT_MAX_COMMITS_PER_CONVERSATION: "5",
    OPS_REPO_READ_FALLBACK_GITHUB: "1",
    OPS_REPO_READ_ALLOW_PREFIXES: "frontend/,backend/,docs/,.github/",
    OPS_GITHUB_WRITE_ALLOW_PREFIXES: "frontend/,backend/src/,docs/,.github/workflows/"
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!String(process.env[key] || "").trim()) {
      process.env[key] = value;
    }
  }
}

module.exports = {};
