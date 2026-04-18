const express = require("express");
const rateLimit = require("express-rate-limit");
const { getSmartWalletsForToken } = require("../services/smartWalletsService");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");
const { authMiddleware, requirePro } = require("./auth");
const { getSupabase } = require("../lib/supabase");
const publicTerminalLimiter = require("../middleware/publicTerminalLimiter");
const { getSmartWalletsTopCached } = require("../services/homeTerminalApi");

const router = express.Router();

function safeSupabase() {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

/** GET /api/v1/smart-wallets/top — leaderboard + terminal fields. Cached ~3m. */
router.get("/top", publicTerminalLimiter, async (req, res) => {
  const lim = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const supabase = safeSupabase();
  try {
    const body = await getSmartWalletsTopCached(supabase, lim);
    return res.json(body);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, data: [], rows: [] });
  }
});

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

