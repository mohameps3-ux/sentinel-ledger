"use strict";

const express = require("express");
const rateLimit = require("express-rate-limit");
const { handleBotMessage, handleFeedback } = require("../services/botService");

const router = express.Router();

const botLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false
});

router.post("/message", botLimiter, async (req, res) => {
  try {
    const { message, language = "es", sessionId, mode = "chat" } = req.body || {};
    if (!message || typeof message !== "string" || message.length > 500) {
      return res.status(400).json({ error: "Invalid message" });
    }
    const result = await handleBotMessage(message, language, sessionId, mode);
    return res.json(result);
  } catch (err) {
    console.error("[bot] error:", err?.message || err);
    return res.status(500).json({
      answer: "Error procesando tu pregunta. Intenta de nuevo.",
      source: "error"
    });
  }
});

router.post("/feedback", botLimiter, async (req, res) => {
  try {
    const { thumbsId, vote } = req.body || {};
    if (!thumbsId || !["up", "down"].includes(vote)) {
      return res.status(400).json({ error: "Invalid feedback" });
    }
    const result = await handleFeedback(thumbsId, vote);
    return res.json(result);
  } catch (err) {
    console.error("[bot] feedback:", err?.message || err);
    return res.status(500).json({ error: "Feedback failed" });
  }
});

module.exports = router;
