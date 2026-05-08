async function getSentinelHealth() {
  return {
    app: "Sentinel Ledger",
    status: "running",
    checkedAt: new Date().toISOString(),
    modules: {
      auth: "ok",
      dashboard: "ok",
      terminal: "ok",
      signals: "ok",
      transactions: "warning",
    },
  };
}

async function getRecentErrors() {
  return {
    errors: [],
    source: "sentinel-agent",
  };
}

async function callOpenAI(payload) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${text}`);
  }

  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = req.headers["x-sentinel-secret"];

  if (!secret || secret !== process.env.SENTINEL_AGENT_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: "Missing OPENAI_API_KEY",
    });
  }

  try {
    const health = await getSentinelHealth();
    const errors = await getRecentErrors();

    const diagnosisInput = {
      health,
      errors,
      runtime: {
        node: process.version,
        environment: process.env.NODE_ENV,
      },
    };

    const response = await callOpenAI({
      model: "gpt-5.1-mini",

      instructions: `
You are Sentinel AI Agent.

You help maintain Sentinel Ledger.

Goals:
- inspect Sentinel
- detect weak architecture
- identify bugs
- identify slow systems
- propose improvements
- prioritize technical debt
- NEVER modify production automatically

Return concise JSON.
`,

      input: JSON.stringify(diagnosisInput),
    });

    return res.status(200).json({
      ok: true,
      diagnosis: response.output_text || response,
      health,
      errors,
    });
  } catch (error) {
    console.error("Sentinel AI Agent error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Unknown Sentinel AI error",
    });
  }
}
