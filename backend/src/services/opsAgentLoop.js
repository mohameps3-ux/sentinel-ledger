"use strict";

/**
 * Anthropic tool-use loop for the ops Architect Agent.
 */

const { OPS_AGENT_TOOLS, executeOpsAgentTool, getToolLevel } = require("./opsAgentTools");
const { getOpsPostgresPool } = require("../lib/opsPostgresPool");
const { insertOpsAuditLog } = require("../lib/opsAuditLog");

const OPS_AGENT_MAX_TOOL_ITERATIONS = (() => {
  const n = Number(process.env.OPS_AGENT_MAX_TOOL_ITERATIONS || 8);
  return Number.isFinite(n) ? Math.min(20, Math.max(1, Math.floor(n))) : 8;
})();

function isToolUseEnabled() {
  const raw = String(process.env.OPS_AGENT_TOOL_USE_ENABLED ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function extractTextFromContent(content) {
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

function extractToolUses(content) {
  if (!Array.isArray(content)) return [];
  return content.filter((b) => b?.type === "tool_use" && b.id && b.name);
}

async function auditToolInvocation(toolName, input, result, { autoExecuted }) {
  const pool = getOpsPostgresPool();
  if (!pool) return null;
  const client = await pool.connect();
  try {
    const ins = await insertOpsAuditLog(client, {
      operation: `agent_tool:${toolName}`,
      sql_statement: JSON.stringify({ input, result: truncateForAudit(result) }).slice(0, 50_000),
      affected_rows: Number(result?.rowCount || result?.affected_rows || result?.total_affected || 0),
      executed_by: "ops-agent-tool",
      error: result?.ok === false ? String(result?.error || result?.status || "tool_failed") : null,
      metadata: {
        tool: toolName,
        level: getToolLevel(toolName),
        auto_executed: autoExecuted,
        confirmation_required: result?.status === "confirmation_required"
      },
      auto_executed: autoExecuted
    });
    return ins?.id || null;
  } catch (_) {
    return null;
  } finally {
    client.release();
  }
}

function truncateForAudit(obj) {
  try {
    const s = JSON.stringify(obj);
    if (s.length <= 12_000) return obj;
    return { _truncated: true, preview: s.slice(0, 12_000) };
  } catch (_) {
    return { _error: "audit_serialize_failed" };
  }
}

async function callAnthropicMessages({ apiKey, model, system, messages, tools }) {
  const body = {
    model,
    max_tokens: Number(process.env.OPS_AGENT_MAX_TOKENS || 4096),
    system,
    messages
  };
  if (tools && tools.length > 0) body.tools = tools;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const msg = data.error?.message || data.error?.type || `anthropic_${response.status}`;
    throw new Error(msg);
  }
  return data;
}

/**
 * Run agentic tool loop until end_turn or max iterations.
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.systemPrompt
 * @param {Array<{role:string,content:string|object[]}>} opts.messages
 * @param {string} opts.userMessage
 * @param {string[]} [opts.confirmTools]
 * @param {(event: object) => void} [opts.onEvent]
 */
async function runOpsAgentLoop(opts) {
  const {
    apiKey,
    model,
    systemPrompt,
    messages: seedMessages,
    userMessage,
    confirmTools = [],
    onEvent
  } = opts;

  const toolInvocations = [];
  let currentMessages = [...seedMessages];
  let lastResponse = null;
  let truncated = false;

  for (let iter = 0; iter < OPS_AGENT_MAX_TOOL_ITERATIONS; iter++) {
    lastResponse = await callAnthropicMessages({
      apiKey,
      model,
      system: systemPrompt,
      messages: currentMessages,
      tools: OPS_AGENT_TOOLS
    });

    const stopReason = lastResponse.stop_reason;
    const content = lastResponse.content || [];
    const toolUses = extractToolUses(content);

    if (toolUses.length === 0 || stopReason === "end_turn") {
      return {
        answer: extractTextFromContent(content),
        model: lastResponse.model || model,
        toolInvocations,
        truncated,
        stopReason: stopReason || "end_turn",
        rawUsage: lastResponse.usage || null
      };
    }

    currentMessages.push({ role: "assistant", content });

    const toolResults = [];
    for (const tu of toolUses) {
      onEvent?.({ type: "tool_start", name: tu.name, input: tu.input, iteration: iter });
      const result = await executeOpsAgentTool(tu.name, tu.input || {}, {
        userMessage,
        confirmTools,
        confirmed: false
      });
      const autoExecuted = getToolLevel(tu.name) === "auto" && result?.status !== "confirmation_required";
      const auditId = await auditToolInvocation(tu.name, tu.input, result, { autoExecuted });
      const enriched = { ...result, audit_log_id: auditId };
      toolInvocations.push({
        id: tu.id,
        name: tu.name,
        input: tu.input,
        result: enriched,
        autoExecuted,
        iteration: iter
      });
      onEvent?.({ type: "tool_result", name: tu.name, result: enriched, iteration: iter });
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(enriched)
      });
    }

    currentMessages.push({ role: "user", content: toolResults });
  }

  truncated = true;
  const tailText = extractTextFromContent(lastResponse?.content);
  return {
    answer:
      tailText ||
      `Reached max tool iterations (${OPS_AGENT_MAX_TOOL_ITERATIONS}). Review toolInvocations and continue in a follow-up message.`,
    model: lastResponse?.model || model,
    toolInvocations,
    truncated: true,
    stopReason: "max_iterations",
    rawUsage: lastResponse?.usage || null
  };
}

module.exports = {
  isToolUseEnabled,
  runOpsAgentLoop,
  OPS_AGENT_MAX_TOOL_ITERATIONS
};
