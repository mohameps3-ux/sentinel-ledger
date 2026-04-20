"use strict";

/**
 * Read-only public access to the scoring engine's latest output per asset.
 *
 * Why this exists
 * ---------------
 * The engine writes `scoring:latest:{asset}` to Redis (10 min TTL) on every
 * evaluation. Without this endpoint, a client that loads `/token/X` has to
 * WAIT for a fresh on-chain event before it can show any score, even if one
 * was computed seconds ago. Bootstrapping `useScoreSocket` from this endpoint
 * kills the "WAITING" state for any asset with recent activity.
 *
 * Scope
 * -----
 *  - GET only. No mutation surface.
 *  - No auth: the scoring output is derivable from public on-chain data.
 *  - Inherits the global 60s / 120 req rate limit mounted in server.js.
 *  - Validates the asset param as a probable Solana pubkey before touching
 *    cache, to reject obvious garbage without round-tripping Redis.
 */

const express = require("express");
const cache = require("../lib/cache");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");
const { getPublicKeyInfo } = require("../lib/scoreSigner");

const router = express.Router();

/**
 * Public Ed25519 key used to verify `sentinel:score` signatures.
 *
 * Clients (frontend verifier, backtest scripts, institutional API consumers)
 * fetch this once per pubkey fingerprint. When the server rotates its key,
 * incoming scores carry a new `pubkeyFp` that doesn't match the cached key,
 * and clients re-fetch transparently — no manual coordination required.
 *
 * Cache: 5 min at the edge. The key rotates at most on deployment boundaries.
 */
router.get("/public-key", (_req, res) => {
  const info = getPublicKeyInfo();
  res.set("Cache-Control", "public, max-age=300");
  res.json({ ok: true, ...info });
});

router.get("/latest/:asset", async (req, res) => {
  const asset = String(req.params.asset || "").trim();
  if (!isProbableSolanaPubkey(asset)) {
    return res.status(400).json({ ok: false, error: "invalid_asset" });
  }
  try {
    const cached = await cache.get(`scoring:latest:${asset}`);
    if (!cached || typeof cached !== "object") {
      return res.status(404).json({ ok: false, error: "no_score_cached", asset });
    }
    return res.json({ ok: true, asset, score: cached });
  } catch (_) {
    return res.status(503).json({ ok: false, error: "cache_unavailable" });
  }
});

module.exports = router;
