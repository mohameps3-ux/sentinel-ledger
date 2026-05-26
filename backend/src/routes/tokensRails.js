"use strict";

const express = require("express");
const publicTerminalLimiter = require("../middleware/publicTerminalLimiter");
const { getTokensRailsCached } = require("../services/tokensRailsService");
const { recordRailsRequest } = require("../lib/tokensRailsTelemetry");

const router = express.Router();

/**
 * GET /api/v1/tokens/rails
 * Hot / Live / Velocity rails — public, HTTP cache 30s.
 */
router.get("/rails", publicTerminalLimiter, async (_req, res) => {
  const started = Date.now();
  try {
    const body = await getTokensRailsCached();
    recordRailsRequest({
      durationMs: body.durationMs ?? Date.now() - started,
      hotCount: body.hot?.length || 0,
      liveCount: body.live?.length || 0,
      velocityCount: body.velocity?.length || 0
    });
    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=15");
    return res.json({
      ok: true,
      generated_at: body.generated_at,
      hot: body.hot || [],
      live: body.live || [],
      velocity: body.velocity || []
    });
  } catch (e) {
    recordRailsRequest({
      durationMs: Date.now() - started,
      error: e?.message || "rails_failed"
    });
    console.error("tokens/rails:", e.message);
    return res.status(500).json({
      ok: false,
      error: e.message || "tokens_rails_failed",
      generated_at: new Date().toISOString(),
      hot: [],
      live: [],
      velocity: []
    });
  }
});

module.exports = router;
