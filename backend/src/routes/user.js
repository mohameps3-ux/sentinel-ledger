const express = require("express");
const { authMiddleware } = require("./auth");
const { getLatestSubscription, hasProAccess } = require("../services/subscriptionService");
const { getActiveWalletSubscription } = require("../services/subscriptionAccess");
const { getSupabase } = require("../lib/supabase");

const router = express.Router();

function safeSupabase() {
  try {
    return getSupabase();
  } catch {
    return null;
  }
}

/**
 * GET /api/v1/user/status
 * Returns the caller's PRO entitlement. Reads userId first (Stripe / JWT path)
 * and falls back to the wallet subscription (USDC modal path) so users that
 * paid via the wallet flow see hasProAccess=true even without a `users` row.
 */
router.get("/status", authMiddleware, async (req, res) => {
  try {
    const userRow = await getLatestSubscription(req.user.userId);
    let plan = userRow?.plan || "free";
    let status = userRow?.status || null;
    let expiresAt = userRow?.expires_at || null;
    let isLifetime = userRow?.plan === "lifetime";
    let pro = userRow ? hasProAccess(userRow) : false;

    if (!pro && req.user.wallet) {
      const supabase = safeSupabase();
      if (supabase) {
        const walletSub = await getActiveWalletSubscription(supabase, req.user.wallet);
        if (walletSub) {
          pro = true;
          plan = walletSub.plan || plan;
          status = "active";
          expiresAt = walletSub.expires_at || expiresAt;
        }
      }
    }

    return res.json({
      ok: true,
      data: {
        plan,
        status,
        expiresAt,
        isLifetime,
        hasProAccess: pro
      }
    });
  } catch (error) {
    console.error("user/status:", error);
    return res.status(500).json({ ok: false, error: "status_failed" });
  }
});

module.exports = router;
