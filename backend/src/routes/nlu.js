const express = require("express");
const rateLimit = require("express-rate-limit");
const { detectIntent, executeIntent } = require("../services/nluEngine");
const { ALLOWED_INTENTS, FALLBACK_MESSAGE } = require("../services/nlu/constants");

const router = express.Router();
const MAX_NLU_BODY_BYTES = 16 * 1024;

const nluLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 45,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.ip || "anon")
});

function sanitizeQuery(input) {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function sanitizeEntities(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!/^[a-zA-Z0-9_]{1,24}$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.trim().slice(0, 120);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function enforceNluPayloadSize(req, res, next) {
  const rawLen = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(rawLen) && rawLen > MAX_NLU_BODY_BYTES) {
    return res.status(413).json({ ok: false, error: "payload_too_large" });
  }
  return next();
}

router.post("/query", nluLimiter, enforceNluPayloadSize, async (req, res) => {
  try {
    const query = sanitizeQuery(req.body?.query);
    const explicitIntentRaw = req.body?.intent ? String(req.body.intent).trim().toUpperCase() : null;
    const explicitIntent = ALLOWED_INTENTS.has(explicitIntentRaw) ? explicitIntentRaw : null;
    const entities = sanitizeEntities(req.body?.entities);

    const detected = explicitIntent ? { intent: explicitIntent, entities } : detectIntent(query);
    if (!ALLOWED_INTENTS.has(detected.intent)) {
      return res.status(400).json({ ok: false, intent: "UNKNOWN", error: FALLBACK_MESSAGE });
    }
    const mergedEntities = { ...(detected.entities || {}), ...(entities || {}) };
    const result = await executeIntent(detected.intent, mergedEntities);

    return res.json({
      ok: Boolean(result?.ok),
      intent: detected.intent,
      entities: mergedEntities,
      ...result
    });
  } catch (error) {
    console.error("[nlu-route] query failed:", error.message);
    return res.status(500).json({
      ok: false,
      error: FALLBACK_MESSAGE
    });
  }
});

module.exports = router;

