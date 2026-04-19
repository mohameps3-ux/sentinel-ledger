const express = require("express");
const { detectIntent, executeIntent } = require("../services/nluEngine");

const router = express.Router();

router.post("/query", async (req, res) => {
  try {
    const query = String(req.body?.query || "").trim();
    const explicitIntent = req.body?.intent ? String(req.body.intent) : null;
    const entities = req.body?.entities && typeof req.body.entities === "object" ? req.body.entities : {};

    const detected = explicitIntent ? { intent: explicitIntent, entities } : detectIntent(query);
    const mergedEntities = { ...(detected.entities || {}), ...(entities || {}) };
    const result = await executeIntent(detected.intent, mergedEntities);

    return res.json({
      ok: Boolean(result?.ok),
      intent: detected.intent,
      entities: mergedEntities,
      ...result
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error:
        "I didn't understand that. Try: price of SOL, signal on WIF, analyze wallet [address], swap 1 SOL to USDC."
    });
  }
});

module.exports = router;

