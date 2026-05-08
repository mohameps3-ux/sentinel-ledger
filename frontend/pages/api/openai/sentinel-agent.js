import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = req.headers["x-sentinel-secret"];

  if (!secret || secret !== process.env.SENTINEL_AGENT_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const response = await client.responses.create({
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
`,

      tools: [
        {
          type: "function",
          name: "get_sentinel_health",
          description: "Get Sentinel health status",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
        {
          type: "function",
          name: "get_recent_errors",
          description: "Get recent Sentinel errors",
          parameters: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      ],

      input: "Analyze Sentinel Ledger current state.",
    });

    const toolCalls = response.output?.filter(
      (item) => item.type === "function_call"
    );

    const toolResults = [];

    if (toolCalls?.length) {
      for (const tool of toolCalls) {
        if (tool.name === "get_sentinel_health") {
          toolResults.push(await getSentinelHealth());
        }

        if (tool.name === "get_recent_errors") {
          toolResults.push(await getRecentErrors());
        }
      }
    }

    return res.status(200).json({
      ok: true,
      diagnosis: response.output_text,
      tools: toolResults,
    });
  } catch (error) {
    console.error("Sentinel AI Agent error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message || "Unknown Sentinel AI error",
    });
  }
}
