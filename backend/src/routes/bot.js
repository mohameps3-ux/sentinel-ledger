"use strict";

const express = require("express");
const rateLimit = require("express-rate-limit");
const { processBotMessage, applyBotFeedback } = require("../services/botService");

const router = express.Router();

const botWindowMs = 60 * 1000;
const botMessageLimiter = rateLimit({
  windowMs: botWindowMs,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false
});

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseBodyMessage(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const { message, language, sessionId: _s, uiMode } = body;
  if (message != null && typeof message !== "string") return { ok: false, error: "message_invalid" };
  if (language != null && typeof language !== "string") return { ok: false, error: "language_invalid" };
  const modeRaw = uiMode == null ? "" : String(uiMode).toLowerCase();
  const mode = modeRaw === "support" || modeRaw === "ask" ? modeRaw : "auto";
  return {
    ok: true,
    message,
    language,
    sessionId: typeof body.sessionId === "string" ? body.sessionId.slice(0, 128) : "",
    uiMode: mode
  };
}

router.post("/message", botMessageLimiter, async (req, res) => {
  const p = parseBodyMessage(req.body);
  if (!p.ok) {
    return res.status(400).json({ ok: false, error: p.error });
  }
  try {
    const out = await processBotMessage({
      message: p.message,
      language: p.language,
      sessionId: p.sessionId,
      uiMode: p.uiMode
    });
    if (!out.ok) {
      return res.status(out.status || 500).json({ ok: false, error: out.error || "bot_failed" });
    }
    return res.json({
      ok: true,
      answer: out.answer,
      intent: out.intent,
      source: out.source,
      cached: Boolean(out.cached),
      thumbsId: out.thumbsId
    });
  } catch (e) {
    console.error("[bot] /message", e);
    return res.status(500).json({ ok: false, error: "bot_internal" });
  }
});

router.post("/feedback", botMessageLimiter, async (req, res) => {
  const b = req.body;
  if (!b || typeof b !== "object") {
    return res.status(400).json({ ok: false, error: "invalid_body" });
  }
  const thumbsId = b.thumbsId;
  const vote = b.vote;
  if (thumbsId == null || !uuidRe.test(String(thumbsId).trim())) {
    return res.status(400).json({ ok: false, error: "thumbsId_invalid" });
  }
  if (vote !== "up" && vote !== "down") {
    return res.status(400).json({ ok: false, error: "vote_invalid" });
  }
  try {
    const out = await applyBotFeedback({ thumbsId: String(thumbsId).trim(), vote });
    if (!out.ok) {
      return res.status(out.status || 500).json({ ok: false, error: out.error || "feedback_failed" });
    }
    return res.json({ ok: true, confidence: out.confidence, thumbsUp: out.thumbsUp, thumbsDown: out.thumbsDown });
  } catch (e) {
    console.error("[bot] /feedback", e);
    return res.status(500).json({ ok: false, error: "bot_internal" });
  }
});

module.exports = { botRouter: router, botMessageLimiter };
