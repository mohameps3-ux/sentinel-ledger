export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

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

function extractOutputText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text;
  const parts = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim() || null;
}

export async function POST(request) {
  const configuredSecret = process.env.SENTINEL_AGENT_SECRET;
  const providedSecret = request.headers.get("x-sentinel-secret");

  if (!configuredSecret) {
    return json({
      ok: false,
      error: "missing_sentinel_agent_secret",
      fix: "Add SENTINEL_AGENT_SECRET to Vercel Production environment variables and redeploy."
    }, 500);
  }

  if (!safeEqual(providedSecret, configuredSecret)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (!process.env.OPENAI_API_KEY) {
    return json({
      ok: false,
      error: "missing_openai_api_key",
      fix: "Add OPENAI_API_KEY to Vercel Production environment variables and redeploy."
    }, 500);
  }

  const model = process.env.SENTINEL_AGENT_MODEL || "gpt-5-mini";

  try {
    const health = {
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

    const errors = {
      errors: [],
      source: "sentinel-agent",
      note: "No external logs are exposed from this endpoint."
    };

    const response = await callOpenAI({
      model,
      instructions: `You are Sentinel AI Agent. Return concise JSON only with: status, priority, findings, next_actions. Never modify production automatically.`,
      input: JSON.stringify({
        health,
        errors,
        runtime: {
          node: process.version,
          environment: process.env.NODE_ENV,
          vercel: Boolean(process.env.VERCEL),
          region: process.env.VERCEL_REGION || null
        }
      }),
      text: {
        format: { type: "json_object" }
      }
    });

    return json({
      ok: true,
      route: "app-router",
      model,
      diagnosis: extractOutputText(response) || response,
      health,
      errors
    });
  } catch (error) {
    return json({
      ok: false,
      route: "app-router",
      model,
      error: error?.message || "unknown_sentinel_ai_error"
    }, 500);
  }
}

export function GET() {
  return json({ ok: false, error: "method_not_allowed", allow: "POST" }, 405);
}
