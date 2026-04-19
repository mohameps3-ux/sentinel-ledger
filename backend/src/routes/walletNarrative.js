const express = require("express");
const rateLimit = require("express-rate-limit");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");
const { getWalletNarrative } = require("../services/walletNarrative");

const router = express.Router();

const walletNarrativeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 45,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "rate_limit_exceeded" }
});

router.get("/:address/narrative", walletNarrativeLimiter, async (req, res) => {
  try {
    const address = String(req.params.address || "").trim();
    if (!isProbableSolanaPubkey(address)) {
      return res.status(400).json({ ok: false, error: "invalid_address" });
    }
    const lang = String(req.query.lang || "es").toLowerCase();
    const payload = await getWalletNarrative(address, { lang });
    if (!payload) {
      return res.status(404).json({ ok: false, error: "wallet_not_found" });
    }
    return res.json(payload);
  } catch (error) {
    console.error("wallet narrative route:", error.message);
    return res.status(500).json({ ok: false, error: "wallet_narrative_failed" });
  }
});

module.exports = router;

