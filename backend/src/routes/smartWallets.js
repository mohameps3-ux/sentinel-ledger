const express = require("express");
const rateLimit = require("express-rate-limit");
const { getSmartWalletsForToken } = require("../services/smartWalletsService");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");
const { authMiddleware, requirePro } = require("./auth");

const router = express.Router();
const smartWalletsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId || req.ip,
  message: { ok: false, error: "rate_limit_exceeded" }
});

router.get("/:address", authMiddleware, requirePro, smartWalletsLimiter, async (req, res) => {
  try {
    const { address } = req.params;
    if (!address || !isProbableSolanaPubkey(address)) {
      return res.status(400).json({ ok: false, error: "invalid_address" });
    }

    const result = await getSmartWalletsForToken(address);
    return res.json({
      ok: true,
      data: result.wallets,
      smartWallets: result.wallets,
      meta: {
        tokenAddress: address,
        ...(result.meta || {}),
        count: result.wallets?.length ?? 0
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: "smart_wallets_failed" });
  }
});

module.exports = router;

