const express = require("express");

const router = express.Router();

function safeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (!left || !right || left.length !== right.length) return false;

  let out = 0;
  for (let i = 0; i < left.length; i += 1) {
    out |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return out === 0;
}

function extractOutputText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const parts = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }

  return parts.join("\n").trim() || null;
}

async function callOpenAI(payload) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    const message = body?.error?.message || body?.error || text || `OpenAI API error ${response.status}`;
    throw new Error(message);
  }

  return body;
}

router.post("/sentinel-agent", async (req, res) => {
  const configuredSecret = process.env.SENTINEL_AGENT_SECRET;
  const providedSecret = req.headers["x-sentinel-secret"];

  if (!configuredSecret) {
    return res.status(500).json({
      ok: false,
      error: "missing_sentinel_agent_secret",
      fix: "Add SENTINEL_AGENT_SECRET to Railway backend variables and redeploy."
    });
  }

  if (!safeEqual(providedSecret, configuredSecret)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "missing_openai_api_key",
      fix: "Add OPENAI_API_KEY to Railway backend variables and redeploy."
    });
  }

  const model = process.env.OPENAI_SENTINEL_AGENT_MODEL || "gpt-5-mini";

  try {
    const health = {
      app: "Sentinel Ledger",
      status: "running",
      checkedAt: new Date().toISOString(),
      runtime: "railway-backend",
      modules: {
        backend: "ok",
        openaiAgent: "ok",
        signals: "observe",
        ops: "protected",
        railway: "ok"
      }
    };

    const errors = {
      errors: [],
      source: "sentinel-agent",
      note: "Agent route is active on Railway backend. No private logs are exposed by this endpoint."
    };

    const response = await callOpenAI({
      model,
      instructions: `You are Sentinel AI Agent.

Return valid json only.

You help maintain Sentinel Ledger.

Goals:
- inspect Sentinel runtime health
- detect weak architecture
- identify bugs
- identify slow systems
- propose improvements
- prioritize technical debt
- never modify production automatically

Return concise json only with: status, priority, findings, next_actions.`,
      input: `json runtime diagnostics: ${JSON.stringify({
        health,
        errors,
        runtime: {
          node: process.version,
          environment: process.env.NODE_ENV,
          railway: Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID),
          commit: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.COMMIT_SHA || null
        }
      })}`,
      text: {
        format: { type: "json_object" }
      }
    });

    return res.status(200).json({
      ok: true,
      route: "railway-backend",
      model,
      diagnosis: extractOutputText(response) || response,
      health,
      errors
    });
  } catch (error) {
    console.error("Sentinel AI Agent error:", error);
    return res.status(500).json({
      ok: false,
      route: "railway-backend",
      model,
      error: error?.message || "unknown_sentinel_ai_error"
    });
  }
});

router.all("/sentinel-agent", (_req, res) => {
  res.setHeader("Allow", "POST");
  return res.status(405).json({ ok: false, error: "method_not_allowed", allow: "POST" });
});

module.exports = router;
