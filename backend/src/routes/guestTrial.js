"use strict";

const express = require("express");
const rateLimit = require("express-rate-limit");
const { getTrialStatus, startTrial } = require("../services/guestTrialService");

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false
});

router.get("/status", limiter, async (req, res) => {
  try {
    const ip = req.ip;
    const fpHash = req.headers["x-fp-hash"] || null;
    res.json(await getTrialStatus(ip, fpHash));
  } catch (e) {
    console.warn("[guestTrial] status", e?.message);
    res.status(500).json({ status: "none", eligible: true });
  }
});

router.post("/start", limiter, async (req, res) => {
  try {
    const ip = req.ip;
    const { fingerprintHash } = req.body || {};
    res.json(await startTrial(ip, fingerprintHash || null));
  } catch (e) {
    console.warn("[guestTrial] start", e?.message);
    res.status(500).json({ ok: false, reason: "server_error" });
  }
});

module.exports = router;
