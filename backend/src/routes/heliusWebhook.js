const express = require("express");
const rateLimit = require("express-rate-limit");
const txDedupe = require("../lib/dedupe");
const { recordWebhookIngestActivity } = require("../lib/eventPriority");
const {
  validateWebhookShape,
  analyzeWebhookEntropy,
  recordGuardDrop,
  getEntropyGuardSnapshot
} = require("../ingestion/entropyGuard");
const { processHeliusWebhookRaw } = require("../services/heliusWebhookProcessor");
const {
  getWebhookScoringQueue,
  webhookWorkerEnabled,
  webhookQueuePriority
} = require("../queues/webhookScoring.queue");
const { invalidateSignalsLatestFeedCache } = require("../services/homeTerminalApi");

const router = express.Router();

const MAX_HELIUS_BODY_BYTES = 512 * 1024;

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
        queued: 0,
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
        queued: 0,
        droppedByGuard: estimatedDrops,
        guardRejected: entropy.error || "low_entropy_payload",
        reason: "entropy_guard_rejected"
      });
    }

    let emitted = 0;
    let queued = 0;
    let droppedByGuard = 0;
    let shouldInvalidateLatest = false;

    await recordWebhookIngestActivity();

    const useQueue = webhookWorkerEnabled();
    const queue = useQueue ? getWebhookScoringQueue() : null;
    if (useQueue && !queue) {
      console.warn("[webhook] FF_WEBHOOK_WORKER enabled but BullMQ Redis URL missing; processing inline");
    }

    const queuePromises = [];

    for (const raw of events) {
      const topSig = String(
        (raw && typeof raw === "object" && (raw.signature || raw.transaction?.signatures?.[0] || raw.transactionSignature)) || ""
      ).trim();

      if (topSig) {
        const claimed = await txDedupe.markTransactionProcessed(topSig);
        if (!claimed) {
          console.log(`[webhook] received signature=${topSig} deduped=true`);
          continue;
        }
        console.log(`[webhook] received signature=${topSig} deduped=false`);

        if (useQueue && queue) {
          const safeId = topSig.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
          queuePromises.push(
            queue.add(
              "process-webhook-event",
              { raw, signature: topSig },
              {
                jobId: `webhook_${safeId}`,
                priority: webhookQueuePriority(),
                attempts: 3,
                backoff: { type: "exponential", delay: 1000 },
                removeOnComplete: 500,
                removeOnFail: 200
              }
            )
          );
          queued += 1;
          continue;
        }
      } else {
        console.log("[webhook] received signature=(empty) deduped=n/a inline=true");
      }

      const out = await processHeliusWebhookRaw(raw);
      emitted += out.emitted;
      droppedByGuard += out.droppedByGuard;
      if (out.signalEmitted) shouldInvalidateLatest = true;
    }

    if (queuePromises.length) {
      await Promise.all(queuePromises);
    }

    if (shouldInvalidateLatest) {
      await invalidateSignalsLatestFeedCache();
    }

    res.status(200).json({ ok: true, emitted, queued, droppedByGuard });
  } catch (error) {
    console.error("helius webhook:", error);
    res.sendStatus(500);
  }
});

module.exports = router;
