const express = require("express");
const { authMiddleware } = require("./auth");
const { getLatestSubscription, hasProAccess } = require("../services/subscriptionService");

const router = express.Router();

router.get("/status", authMiddleware, async (req, res) => {
  try {
    const row = await getLatestSubscription(req.user.userId);
    if (!row) {
      return res.json({
        ok: true,
        data: {
          plan: "free",
          status: null,
          expiresAt: null,
          isLifetime: false,
          hasProAccess: false
        }
      });
    }

    return res.json({
      ok: true,
      data: {
        plan: row.plan || "free",
        status: row.status || null,
        expiresAt: row.expires_at || null,
        isLifetime: row.plan === "lifetime",
        hasProAccess: hasProAccess(row)
      }
    });
  } catch (error) {
    console.error("user/status:", error);
    return res.status(500).json({ ok: false, error: "status_failed" });
  }
});

module.exports = router;
