"use strict";

/**
 * Anthropic tool-use loop for the ops Architect Agent.
 * Supports strict vs full autonomy, operational caps, and circuit breakers.
 */

const { randomUUID } = require("crypto");
const {
  OPS_AGENT_TOOLS,
  executeOpsAgentTool,
  getToolLevel,
  getAutonomyMode,
  isFullAutonomyMode,
  shouldRequireConfirmation
} = require("./opsAgentTools");
const { getOpsPostgresPool } = require("../lib/opsPostgresPool");
const { insertOpsAuditLog } = require("../lib/opsAuditLog");

const OPS_AGENT_MAX_TOOL_ITERATIONS = (() => {
  const n = Number(process.env.OPS_AGENT_MAX_TOOL_ITERATIONS || 12);
  return Number.isFinite(n) ? Math.min(30, Math.max(1, Math.floor(n))) : 12;
})();

const OPS_AGENT_MAX_TOOLS_PER_CONVERSATION = (() => {
  const n = Number(process.env.OPS_AGENT_MAX_TOOLS_PER_CONVERSATION || 40);
  return Number.isFinite(n) ? Math.min(200, Math.max(1, Math.floor(n))) : 40;
})();

const OPS_AGENT_MAX_SQL_WRITES_PER_CONVERSATION = (() => {
  const n = Number(process.env.OPS_AGENT_MAX_SQL_WRITES_PER_CONVERSATION || 10);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.floor(n))) : 10;
})();

const OPS_AGENT_MAX_DEPLOYS_PER_CONVERSATION = (() => {
  const n = Number(process.env.OPS_AGENT_MAX_DEPLOYS_PER_CONVERSATION || 2);
  return Number.isFinite(n) ? Math.min(20, Math.max(0, Math.floor(n))) : 2;
})();

const OPS_AGENT_MAX_COMMITS_PER_CONVERSATION = (() => {
  const n = Number(process.env.OPS_AGENT_MAX_COMMITS_PER_CONVERSATION || 5);
  return Number.isFinite(n) ? Math.min(50, Math.max(0, Math.floor(n))) : 5;
})();

const TOOL_CONSECUTIVE_FAIL_LIMIT = 3;
const TOTAL_ERROR_LIMIT = 5;

const SQL_WRITE_TOOLS = new Set(["sql_write", "sql_dangerous", "bulk_update_apply"]);

const REDACT_ENV_NAMES = new Set([
  "OMNI_BOT_OPS_KEY",
  "ANTHROPIC_API_KEY",
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "OPS_GITHUB_TOKEN",
  "VERCEL_TOKEN",
  "RAILWAY_TOKEN",
  "WEBHOOK_SECRET",
  "OPS_WEBHOOK_SECRET",
  "HELIUS_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "JWT_SECRET",
  "DATABASE_URL",
  "SUPABASE_DATABASE_URL"
]);

const REDACT_KEY_RE = /(token|secret|password|api[_-]?key|authorization|credential|private[_-]?key)/i;

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

function sanitizeAuditValue(value, depth = 0) {
  if (depth > 8) return "[max_depth]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 4000) return `${value.slice(0, 4000)}…[truncated]`;
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((v) => sanitizeAuditValue(v, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const key = String(k);
      if (REDACT_ENV_NAMES.has(key) || REDACT_KEY_RE.test(key)) {
        out[key] = "[REDACTED]";
        continue;
      }
      if (typeof v === "string" && REDACT_ENV_NAMES.has(v)) {
        out[key] = "[REDACTED]";
        continue;
      }
      out[key] = sanitizeAuditValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

function summarizeOutput(result) {
  try {
    const s = JSON.stringify(result ?? {});
    return s.slice(0, 500);
  } catch (_) {
    return String(result).slice(0, 500);
  }
}

function createConversationCounters() {
  return {
    totalTools: 0,
    sqlWrites: 0,
    deploys: 0,
    commits: 0,
    totalErrors: 0,
    consecutiveFailures: new Map()
  };
}

function checkOperationalCap(toolName, counters) {
  if (counters.totalTools >= OPS_AGENT_MAX_TOOLS_PER_CONVERSATION) {
    return {
      blocked: true,
      error: "max_tools_per_conversation",
      limit: OPS_AGENT_MAX_TOOLS_PER_CONVERSATION,
      message: `Hard cap reached: ${OPS_AGENT_MAX_TOOLS_PER_CONVERSATION} tool invocations per request.`
    };
  }
  if (SQL_WRITE_TOOLS.has(toolName) && counters.sqlWrites >= OPS_AGENT_MAX_SQL_WRITES_PER_CONVERSATION) {
    return {
      blocked: true,
      error: "max_sql_writes_per_conversation",
      limit: OPS_AGENT_MAX_SQL_WRITES_PER_CONVERSATION,
      message: `SQL write cap reached (${OPS_AGENT_MAX_SQL_WRITES_PER_CONVERSATION}). Pending mutations were not executed.`
    };
  }
  if (toolName === "deploy" && counters.deploys >= OPS_AGENT_MAX_DEPLOYS_PER_CONVERSATION) {
    return {
      blocked: true,
      error: "max_deploys_per_conversation",
      limit: OPS_AGENT_MAX_DEPLOYS_PER_CONVERSATION,
      message: `Deploy cap reached (${OPS_AGENT_MAX_DEPLOYS_PER_CONVERSATION}).`
    };
  }
  if (toolName === "github_commit" && counters.commits >= OPS_AGENT_MAX_COMMITS_PER_CONVERSATION) {
    return {
      blocked: true,
      error: "max_commits_per_conversation",
      limit: OPS_AGENT_MAX_COMMITS_PER_CONVERSATION,
      message: `GitHub commit cap reached (${OPS_AGENT_MAX_COMMITS_PER_CONVERSATION}).`
    };
  }
  return { blocked: false };
}

function bumpCounters(toolName, counters, success) {
  counters.totalTools += 1;
  if (SQL_WRITE_TOOLS.has(toolName)) counters.sqlWrites += 1;
  if (toolName === "deploy") counters.deploys += 1;
  if (toolName === "github_commit") counters.commits += 1;

  if (success) {
    counters.consecutiveFailures.set(toolName, 0);
  } else {
    counters.totalErrors += 1;
    const prev = counters.consecutiveFailures.get(toolName) || 0;
    counters.consecutiveFailures.set(toolName, prev + 1);
  }
}

function isToolCircuitOpen(toolName, counters) {
  return (counters.consecutiveFailures.get(toolName) || 0) >= TOOL_CONSECUTIVE_FAIL_LIMIT;
}

async function auditToolInvocation(
  toolName,
  input,
  result,
  {
    conversationId,
    iterationIndex,
    modelReasoningSnippet,
    triggeringUserMessage,
    autoExecutedWithoutConfirmation
  }
) {
  const pool = getOpsPostgresPool();
  if (!pool) return null;
  const client = await pool.connect();
  const autonomyMode = getAutonomyMode();
  const success = result?.ok !== false && result?.status !== "confirmation_required";
  const metadata = {
    tool_name: toolName,
    input: sanitizeAuditValue(input),
    output_summary: summarizeOutput(result),
    success,
    error: success
      ? null
      : {
          message: String(result?.error || result?.status || result?.message || "tool_failed").slice(0, 2000),
          stack: result?.stack ? String(result.stack).slice(0, 4000) : null
        },
    autonomy_mode: autonomyMode,
    auto_executed_without_confirmation: Boolean(autoExecutedWithoutConfirmation),
    iteration_index: iterationIndex,
    conversation_id: conversationId,
    model_reasoning_snippet: String(modelReasoningSnippet || "").slice(-300),
    triggering_user_message: String(triggeringUserMessage || "").slice(0, 500),
    level: getToolLevel(toolName)
  };

  try {
    const ins = await insertOpsAuditLog(client, {
      operation: `agent_tool:${toolName}`,
      sql_statement: JSON.stringify(metadata).slice(0, 50_000),
      affected_rows: Number(result?.rowCount || result?.affected_rows || result?.total_affected || 0),
      executed_by: "ops-agent-tool",
      error: success ? null : metadata.error?.message || null,
      metadata,
      auto_executed: Boolean(autoExecutedWithoutConfirmation)
    });
    return ins?.id || null;
  } catch (_) {
    return null;
  } finally {
    client.release();
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

function buildCapExceededAnswer(counters, toolInvocations, reason) {
  const done = toolInvocations.map((t) => `${t.name}: ${t.result?.ok === false ? "failed/skipped" : "ok"}`).join("\n");
  return [
    `Loop stopped: ${reason}.`,
    "",
    "Completed in this turn:",
    done || "(none)",
    "",
    "Send a new message to continue remaining work — no confirmation needed."
  ].join("\n");
}

/**
 * Run agentic tool loop until end_turn or max iterations.
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

  const conversationId = randomUUID();
  const counters = createConversationCounters();
  const toolInvocations = [];
  let currentMessages = [...seedMessages];
  let lastResponse = null;
  let truncated = false;
  let stopReason = "end_turn";

  for (let iter = 0; iter < OPS_AGENT_MAX_TOOL_ITERATIONS; iter++) {
    if (counters.totalErrors >= TOTAL_ERROR_LIMIT) {
      truncated = true;
      stopReason = "error_budget_exceeded";
      break;
    }

    lastResponse = await callAnthropicMessages({
      apiKey,
      model,
      system: systemPrompt,
      messages: currentMessages,
      tools: OPS_AGENT_TOOLS
    });

    const content = lastResponse.content || [];
    const toolUses = extractToolUses(content);
    const reasoningSnippet = extractTextFromContent(content);

    if (toolUses.length === 0 || lastResponse.stop_reason === "end_turn") {
      stopReason = lastResponse.stop_reason || "end_turn";
      return {
        answer: extractTextFromContent(content),
        model: lastResponse.model || model,
        toolInvocations,
        truncated,
        stopReason,
        conversationId,
        autonomyMode: getAutonomyMode(),
        rawUsage: lastResponse.usage || null,
        counters: {
          totalTools: counters.totalTools,
          totalErrors: counters.totalErrors
        }
      };
    }

    currentMessages.push({ role: "assistant", content });

    const toolResults = [];
    let capBlocked = false;
    let capReason = null;

    for (const tu of toolUses) {
      if (counters.totalErrors >= TOTAL_ERROR_LIMIT) {
        capBlocked = true;
        capReason = "error_budget_exceeded";
        break;
      }

      if (isToolCircuitOpen(tu.name, counters)) {
        const skipResult = {
          ok: false,
          error: "tool_circuit_open",
          message: `Skipped ${tu.name}: failed ${TOOL_CONSECUTIVE_FAIL_LIMIT} times consecutively in this turn.`
        };
        toolInvocations.push({
          id: tu.id,
          name: tu.name,
          input: tu.input,
          result: skipResult,
          skipped: true,
          iteration: iter
        });
        onEvent?.({ type: "tool_result", name: tu.name, result: skipResult, iteration: iter });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(skipResult)
        });
        bumpCounters(tu.name, counters, false);
        continue;
      }

      const cap = checkOperationalCap(tu.name, counters);
      if (cap.blocked) {
        capBlocked = true;
        capReason = cap.error;
        const capResult = { ok: false, ...cap };
        toolInvocations.push({
          id: tu.id,
          name: tu.name,
          input: tu.input,
          result: capResult,
          capBlocked: true,
          iteration: iter
        });
        onEvent?.({ type: "tool_result", name: tu.name, result: capResult, iteration: iter });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(capResult)
        });
        break;
      }

      onEvent?.({ type: "tool_start", name: tu.name, input: tu.input, iteration: iter });

      const result = await executeOpsAgentTool(tu.name, tu.input || {}, {
        userMessage,
        confirmTools
      });

      const success = result?.ok !== false && result?.status !== "confirmation_required";
      const autoExecutedWithoutConfirmation =
        isFullAutonomyMode() || !shouldRequireConfirmation(tu.name, tu.input, { userMessage, confirmTools });

      bumpCounters(tu.name, counters, success);

      const auditId = await auditToolInvocation(tu.name, tu.input, result, {
        conversationId,
        iterationIndex: iter,
        modelReasoningSnippet: reasoningSnippet,
        triggeringUserMessage: userMessage,
        autoExecutedWithoutConfirmation
      });

      const enriched = { ...result, audit_log_id: auditId };
      toolInvocations.push({
        id: tu.id,
        name: tu.name,
        input: tu.input,
        result: enriched,
        autoExecuted: autoExecutedWithoutConfirmation && success,
        iteration: iter
      });
      onEvent?.({ type: "tool_result", name: tu.name, result: enriched, iteration: iter });
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(enriched)
      });
    }

    if (capBlocked) {
      truncated = true;
      stopReason = capReason || "operational_cap";
      currentMessages.push({ role: "user", content: toolResults });
      const tailText = extractTextFromContent(lastResponse?.content);
      return {
        answer:
          tailText ||
          buildCapExceededAnswer(counters, toolInvocations, stopReason),
        model: lastResponse?.model || model,
        toolInvocations,
        truncated: true,
        stopReason,
        conversationId,
        autonomyMode: getAutonomyMode(),
        rawUsage: lastResponse?.usage || null,
        counters: {
          totalTools: counters.totalTools,
          totalErrors: counters.totalErrors
        }
      };
    }

    currentMessages.push({ role: "user", content: toolResults });
  }

  truncated = true;
  stopReason = "max_iterations";
  const tailText = extractTextFromContent(lastResponse?.content);
  return {
    answer:
      tailText ||
      `Reached max tool iterations (${OPS_AGENT_MAX_TOOL_ITERATIONS}). Review toolInvocations and continue in a follow-up message.`,
    model: lastResponse?.model || model,
    toolInvocations,
    truncated: true,
    stopReason,
    conversationId,
    autonomyMode: getAutonomyMode(),
    rawUsage: lastResponse?.usage || null,
    counters: {
      totalTools: counters.totalTools,
      totalErrors: counters.totalErrors
    }
  };
}

module.exports = {
  isToolUseEnabled,
  getAutonomyMode,
  isFullAutonomyMode,
  runOpsAgentLoop,
  OPS_AGENT_MAX_TOOL_ITERATIONS,
  OPS_AGENT_MAX_TOOLS_PER_CONVERSATION
};
