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

async function getSentinelHealth() {
  return {
    app: "Sentinel Ledger",
    status: "running",
    checkedAt: new Date().toISOString(),
    modules: {
      frontend: "ok",
      apiRoute: "ok",
      openaiAgent: "ok",
      terminal: "ok",
      signals: "observe",
      ops: "protected"
    }
  };
}

async function getRecentErrors() {
  return {
    errors: [],
    source: "sentinel-agent",
    note: "No external logs are exposed from this endpoint. It only performs an authenticated agent health pass."
  };
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const configuredSecret = process.env.SENTINEL_AGENT_SECRET;
  const providedSecret = req.headers["x-sentinel-secret"];

  if (!configuredSecret) {
    return res.status(500).json({
      ok: false,
      error: "missing_sentinel_agent_secret",
      fix: "Add SENTINEL_AGENT_SECRET to Vercel Production environment variables and redeploy."
    });
  }

  if (!safeEqual(providedSecret, configuredSecret)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "missing_openai_api_key",
      fix: "Add OPENAI_API_KEY to Vercel Production environment variables and redeploy."
    });
  }

  const model = process.env.OPENAI_SENTINEL_AGENT_MODEL || "gpt-4o-mini";

  try {
    const health = await getSentinelHealth();
    const errors = await getRecentErrors();

    const diagnosisInput = {
      health,
      errors,
      runtime: {
        node: process.version,
        environment: process.env.NODE_ENV,
        vercel: Boolean(process.env.VERCEL),
        region: process.env.VERCEL_REGION || null
      }
    };

    const response = await callOpenAI({
      model,
      instructions: `You are Sentinel AI Agent.

You help maintain Sentinel Ledger.

Goals:
- inspect Sentinel runtime health
- detect weak architecture
- identify bugs
- identify slow systems
- propose improvements
- prioritize technical debt
- never modify production automatically

Return concise JSON only with: status, priority, findings, next_actions.`,
      input: JSON.stringify(diagnosisInput),
      text: {
        format: {
          type: "json_object"
        }
      }
    });

    return res.status(200).json({
      ok: true,
      model,
      diagnosis: extractOutputText(response) || response,
      health,
      errors
    });
  } catch (error) {
    console.error("Sentinel AI Agent error:", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "unknown_sentinel_ai_error",
      model
    });
  }
}
