const express = require("express");
const { authMiddleware } = require("./auth");

const router = express.Router();

router.get("/status", authMiddleware, async (req, res) => {
  return res.json({
    ok: true,
    data: {
      userId: req.user.userId,
      plan: req.user.plan || "free",
      expiresAt: req.user.planExpiresAt || null,
      isPro: req.user.plan !== "free"
    }
  });
});

module.exports = router;
