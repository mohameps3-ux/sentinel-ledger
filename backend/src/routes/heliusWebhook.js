const express = require("express");
const rateLimit = require("express-rate-limit");
const redis = require("../lib/cache");
const { getSupabase } = require("../lib/supabase");
const { trackSmartBuyAndDetect } = require("../services/convergenceService");
const { normalizeEvent } = require("../ingestion/sentinelEvent");
const { reserveEventId } = require("../ingestion/dedupe");
const {
  recordRawReceived,
  recordEventEmitted,
  recordSourceError
} = require("../ingestion/ingestionState");
const {
  validateWebhookShape,
  analyzeWebhookEntropy,
  shouldAllowMint,
  recordGuardDrop,
  getEntropyGuardSnapshot
} = require("../ingestion/entropyGuard");
const { evaluate: evaluateScore } = require("../scoring/engine");
const { recordSignalEmission } = require("../services/signalPerformance");
const { getMarketData } = require("../services/marketData");
const { evaluateSignalEmission } = require("../services/signalEmissionGate");

const SENTINEL_SOURCE = "helius_webhook";

const router = express.Router();

const DEDUPE_TTL_SEC = 120;
const MAX_HELIUS_BODY_BYTES = 512 * 1024;

/**
 * Per-asset, in-process market-data memo (60s) used ONLY for scoring enrichment.
 * Intentionally separate from `getMarketData`'s own Redis cache (20s) so that
 * other consumers (token detail page, etc.) keep their fresher TTL while the
 * scoring pipeline avoids hammering the upstream on bursts of events for the
 * same mint. Capped to bound memory.
 */
const MARKET_MEMO_TTL_MS = 60_000;
const MARKET_MEMO_MAX = 500;
const marketMemo = new Map();

async function getMarketDataMemoized(asset) {
  if (!asset) return null;
  const now = Date.now();
  const hit = marketMemo.get(asset);
  if (hit && hit.expiresAt > now) return hit.value;
  let value = null;
  try {
    value = await getMarketData(asset);
  } catch (_) {
    value = null;
  }
  if (marketMemo.size >= MARKET_MEMO_MAX) {
    const firstKey = marketMemo.keys().next().value;
    if (firstKey !== undefined) marketMemo.delete(firstKey);
  }
  marketMemo.set(asset, { value, expiresAt: now + MARKET_MEMO_TTL_MS });
  return value;
}

/** Builds the optional USD context for the scoring engine. Always returns an object;
 *  fields are `null` when market data is unavailable (engine handles null gracefully). */
function buildScoringContext(market, tokenAmount) {
  const priceUsd = market && Number(market.price) > 0 ? Number(market.price) : null;
  const liquidityUsd =
    market && Number(market.liquidity) > 0 ? Number(market.liquidity) : null;
  const amt = Number(tokenAmount);
  const amountUsd =
    priceUsd != null && Number.isFinite(amt) && amt > 0 ? amt * priceUsd : null;
  return { priceUsd, liquidityUsd, amountUsd };
}

const heliusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "rate_limit_exceeded" }
});
router.use(heliusLimiter);

function enforceHeliusBodyLimit(req, res, next) {
  const rawLen = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(rawLen) && rawLen > MAX_HELIUS_BODY_BYTES) {
    return res.status(413).json({ ok: false, error: "payload_too_large" });
  }
  return next();
}

async function markFirstEmit(dedupeKey) {
  try {
    const r = await redis.set(dedupeKey, "1", { nx: true, ex: DEDUPE_TTL_SEC });
    return r != null;
  } catch (_) {
    return true;
  }
}

/**
 * Map one Helius enhanced payload to zero or more normalized tx events (per mint leg).
 */
function expandHeliusPayload(raw) {
  if (!raw || typeof raw !== "object") return [];
  const signature =
    raw.signature || raw.transaction?.signatures?.[0] || raw.transactionSignature || "";
  const tsMs = (Number(raw.timestamp) || 0) * 1000 || Date.now();
  const transfers = Array.isArray(raw.tokenTransfers) ? raw.tokenTransfers : [];
  const out = [];

  for (const t of transfers) {
    const mint = t.mint;
    if (!mint) continue;
    const amount = Math.abs(Number(t.tokenAmount ?? 0));
    const to = t.toUserAccount || null;
    const from = t.fromUserAccount || null;

    let type = "swap";
    if (to && !from) type = "buy";
    else if (from && !to) type = "sell";
    else if (to && from) type = "swap";

    const wallet = to || from || raw.feePayer || null;
    if (!wallet) continue;

    out.push({
      tokenAddress: mint,
      wallet,
      amount,
      signature,
      timestamp: tsMs,
      type
    });
  }

  return out;
}

function heliusWebhookAuth(req, res, next) {
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ ok: false, error: "helius_webhook_secret_missing" });
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const header = (req.headers["x-helius-secret"] || "").trim();
  if (bearer === secret || header === secret) return next();
  return res.status(401).json({ ok: false, error: "webhook_unauthorized" });
}

function assertOpsAuth(req, res, next) {
  const expected = process.env.OMNI_BOT_OPS_KEY;
  if (!expected) return res.status(503).json({ ok: false, error: "ops_key_not_configured" });
  const provided = String(req.headers["x-ops-key"] || "").trim();
  if (!provided || provided !== expected) return res.status(401).json({ ok: false, error: "unauthorized" });
  return next();
}

router.get("/helius/health", (_req, res) => {
  const configured = Boolean(process.env.HELIUS_WEBHOOK_SECRET);
  if (!configured) {
    return res.status(503).json({
      ok: false,
      warning: "HELIUS_WEBHOOK_SECRET missing",
      endpoint: "/api/v1/webhooks/helius"
    });
  }
  return res.json({ ok: true, endpoint: "/api/v1/webhooks/helius", auth: "enabled" });
});

router.get("/helius/entropy-guard", assertOpsAuth, (req, res) => {
  const limit = Math.max(1, Math.min(240, Number(req.query.limit || 60)));
  const snapshot = getEntropyGuardSnapshot();
  return res.json({
    ok: true,
    data: {
      ...snapshot,
      history: Array.isArray(snapshot.history) ? snapshot.history.slice(-limit) : []
    }
  });
});

router.post("/helius", enforceHeliusBodyLimit, heliusWebhookAuth, async (req, res) => {
  try {
    const body = req.body;
    const events = Array.isArray(body) ? body : body ? [body] : [];
    const shape = validateWebhookShape(events);
    if (!shape.ok) {
      const estimatedDrops = Number(shape.totalTransfers) > 0 ? Number(shape.totalTransfers) : 1;
      recordGuardDrop(String(shape.reason || "shape_guard_rejected"), estimatedDrops);
      return res.status(200).json({
        ok: true,
        emitted: 0,
        droppedByGuard: estimatedDrops,
        guardRejected: shape.error || "payload_shape_invalid",
        reason: shape.reason || "shape_guard_rejected"
      });
    }
    const entropy = analyzeWebhookEntropy(events);
    if (!entropy.ok) {
      const estimatedDrops = Number(entropy.totalTransfers) > 0 ? Number(entropy.totalTransfers) : 1;
      if (entropy.topMint && entropy.topMintCount > 0) {
        recordGuardDrop("low_entropy_payload", entropy.topMintCount, entropy.topMint);
        if (estimatedDrops > entropy.topMintCount) {
          recordGuardDrop("low_entropy_payload", estimatedDrops - entropy.topMintCount);
        }
      } else {
        recordGuardDrop("low_entropy_payload", estimatedDrops);
      }
      return res.status(200).json({
        ok: true,
        emitted: 0,
        droppedByGuard: estimatedDrops,
        guardRejected: entropy.error || "low_entropy_payload",
        reason: "entropy_guard_rejected"
      });
    }
    let emitted = 0;
    let droppedByGuard = 0;

    for (const raw of events) {
      recordRawReceived(SENTINEL_SOURCE);
      const txs = expandHeliusPayload(raw);
      for (let i = 0; i < txs.length; i += 1) {
        const tx = txs[i];
        if (!tx.tokenAddress || !global.io) continue;
        const gate = shouldAllowMint(tx.tokenAddress);
        if (!gate.allowed) {
          droppedByGuard += 1;
          continue;
        }
        const sig = tx.signature || "nosig";

        // SentinelEvent normalization + edge dedup. Non-blocking for legacy emit:
        // if it fails for any reason we still ship the legacy transaction event.
        const startedAt = Date.now();
        let sentinelEvent = null;
        try {
          sentinelEvent = normalizeEvent(
            {
              network: "solana",
              type:
                tx.type === "buy" || tx.type === "sell" || tx.type === "swap"
                  ? "SWAP"
                  : "TRANSFER",
              source: SENTINEL_SOURCE,
              signature: sig,
              blockNumber: Number(raw?.slot) || 0,
              blockHash: raw?.transaction?.message?.recentBlockhash || "",
              logIndex: i,
              timestamp: tx.timestamp,
              data: {
                actor: tx.wallet,
                asset: tx.tokenAddress,
                amount: String(tx.amount ?? "0")
              },
              metadata: { confidence: 0.85, labels: [tx.type].filter(Boolean) }
            },
            { processingStartedAt: startedAt }
          );
        } catch (e) {
          recordSourceError(SENTINEL_SOURCE, e);
        }

        // Per-SentinelEvent edge dedup wins over the legacy key.
        if (sentinelEvent) {
          const r = await reserveEventId(sentinelEvent.id);
          if (r.duplicate) continue;
        } else {
          const legacyKey = `helius:tx:${sig}:${tx.tokenAddress}:${tx.wallet}:${tx.type}:${String(tx.amount)}`;
          const first = await markFirstEmit(legacyKey);
          if (!first) continue;
        }

        global.io.to(tx.tokenAddress).emit("transaction", tx);
        if (sentinelEvent) {
          global.io.to(tx.tokenAddress).emit("sentinel:event", sentinelEvent);
          recordEventEmitted(sentinelEvent, Date.now() - startedAt);
          // Market-aware scoring — best-effort, never blocks event emission.
          // 1) fetch market (memoized 60s per asset); 2) compute USD ctx;
          // 3) evaluate; 4) structured log on high-signal events.
          getMarketDataMemoized(tx.tokenAddress)
            .then((market) => {
              const ctx = buildScoringContext(market, tx.amount);
              return evaluateScore(sentinelEvent, ctx).then((score) => ({ score, ctx }));
            })
            .then(({ score, ctx }) => {
              if (!score || !global.io) return;
              const gate = evaluateSignalEmission(score, { liquidityUsd: ctx?.liquidityUsd });
              if (!gate.allow) {
                return;
              }
              score.meta = {
                ...(score.meta || {}),
                emissionGate: {
                  passed: true,
                  unifiedScore: gate.unifiedScore,
                  components: gate.components
                }
              };
              // The engine already stamps `timestamp` on the result and caches
              // it, so the socket payload and the /scoring/latest cache entry
              // stay byte-identical.
              global.io.to(tx.tokenAddress).emit("sentinel:score", score);
              // Best-effort archival for outcome backtesting (T+N resolution).
              // Never blocks ingestion.
              recordSignalEmission(score).catch(() => {});
              if (score.confidence > 70 || (score.signals && score.signals.length > 2)) {
                console.log(
                  `[SCORING_SIGNAL] ${score.asset} - ${score.confidence}% - ${(score.signals || []).join(",")}`
                );
              }
            })
            .catch(() => {});
        }
        if (tx.type === "buy" || tx.type === "swap") {
          const conv = await trackSmartBuyAndDetect(tx.tokenAddress, tx.wallet, tx.timestamp, tx.type);
          if (conv?.detected) {
            global.io.to(tx.tokenAddress).emit("convergence", {
              tokenAddress: tx.tokenAddress,
              wallets: conv.wallets,
              detectedAt: new Date().toISOString(),
              windowMinutes: conv.windowMinutes
            });
          }
          if (conv?.redAlert) {
            global.io.to(tx.tokenAddress).emit("coordination:red-alert", {
              tokenAddress: tx.tokenAddress,
              detectedAt: conv.redAlert.detectedAt,
              severity: conv.redAlert.severity || "RED",
              score: conv.redAlert.score,
              wallets: conv.redAlert.wallets,
              clusterKey: conv.redAlert.clusterKey,
              latencyFromDeployMin: conv.redAlert.latencyFromDeployMin,
              reason: conv.redAlert.reason
            });
          }
        }

        try {
          const supabase = getSupabase();
          const { data: watchers, error } = await supabase
            .from("wallet_stalks")
            .select("user_id, stalked_wallet")
            .eq("stalked_wallet", tx.wallet)
            .eq("is_active", true)
            .limit(100);
          if (!error && Array.isArray(watchers) && watchers.length) {
            for (const w of watchers) {
              global.io.to(`user:${w.user_id}`).emit("wallet-stalk", {
                wallet: tx.wallet,
                tokenAddress: tx.tokenAddress,
                amount: tx.amount,
                type: tx.type,
                signature: tx.signature,
                timestamp: tx.timestamp
              });
            }
          }
        } catch (_) {}
        emitted += 1;
      }
    }

    res.status(200).json({ ok: true, emitted, droppedByGuard });
  } catch (error) {
    console.error("helius webhook:", error);
    res.sendStatus(500);
  }
});

module.exports = router;
