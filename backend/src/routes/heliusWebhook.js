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
const { createClient } = require("@supabase/supabase-js");
const { recordHeliusWebhookReceipt } = require("../lib/heliusWebhookTelemetry");

const router = express.Router();

const MAX_HELIUS_BODY_BYTES = 512 * 1024;

// ── USDC PRO subscription constants ────────────────────────────────────────
// DEPRECATED: legacy auto-activation kept disabled below. The canonical PRO
// activation path is now POST /api/v1/subscription/verify (10 USDC = 7d trial,
// 29 USDC = 30d pro) verified server-side via subscriptionVerifier.js.
const USDC_MINT = process.env.USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const OWNER_WALLET = process.env.OWNER_WALLET_ADDRESS || "";
const PRO_PRICE_LAMPORTS = 19_000_000; // legacy 19 USDC — no longer auto-grants PRO
const PRO_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

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
    const authRaw = String(req.headers.authorization || "").trim();
    const header = (req.headers["x-helius-secret"] || "").trim();
    if (bearer === secret || authRaw === secret || header === secret) return next();
    return res.status(401).json({ ok: false, error: "webhook_unauthorized" });
}

function assertOpsAuth(req, res, next) {
    const expected = process.env.OMNI_BOT_OPS_KEY;
    if (!expected) return res.status(503).json({ ok: false, error: "ops_key_not_configured" });
    const provided = String(req.headers["x-ops-key"] || "").trim();
    if (!provided || provided !== expected) return res.status(401).json({ ok: false, error: "unauthorized" });
    return next();
}

// ── USDC PRO activation helper ─────────────────────────────────────────────
async function maybeActivateProSubscription(events) {
    if (!OWNER_WALLET) return; // env not configured — skip silently
  const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) return;

  for (const event of events) {
        try {
                const transfers = event?.tokenTransfers || [];
                for (const tx of transfers) {
                          // Must be USDC, exact 19 USDC amount, destination = owner wallet
                  if (
                              tx.mint !== USDC_MINT ||
                              tx.toUserAccount !== OWNER_WALLET ||
                              Number(tx.tokenAmount) !== PRO_PRICE_LAMPORTS
                            ) {
                              continue;
                  }

                  const senderWallet = tx.fromUserAccount;
                          if (!senderWallet) continue;

                  const txSignature = String(event?.signature || event?.transactionSignature || "").trim();
                  if (!txSignature) {
                              console.warn("[usdc-pro] missing transaction signature — skipping subscription insert");
                              continue;
                  }

                  console.log(`[usdc-pro] detected 19 USDC payment from ${senderWallet} — activating PRO`);

                  const supabase = createClient(supabaseUrl, supabaseKey);
                          const now = new Date();
                          const expiresAt = new Date(now.getTime() + PRO_DURATION_MS);

                  const { data: existingSub, error: dupErr } = await supabase
                            .from("subscriptions")
                            .select("id")
                            .eq("tx_signature", txSignature)
                            .maybeSingle();

                  if (dupErr) {
                              console.error("[usdc-pro] subscription dup lookup error:", dupErr.message);
                              continue;
                  }
                  if (existingSub?.id) {
                              console.warn(`[usdc-pro] tx_signature already used: ${txSignature}`);
                              continue;
                  }

                  const { error: subError } = await supabase.from("subscriptions").insert({
                            wallet_address: senderWallet,
                            tx_signature: txSignature,
                            amount_usdc: PRO_PRICE_LAMPORTS / 1_000_000,
                            plan: "pro",
                            expires_at: expiresAt.toISOString()
                  });

                  if (subError) {
                              console.error("[usdc-pro] subscription insert error:", subError.message);
                              continue;
                  }

                  const { data: user } = await supabase
                            .from("users")
                            .select("id")
                            .eq("wallet_address", senderWallet)
                            .maybeSingle();

                  if (!user) {
                              console.log(
                                `[usdc-pro] PRO subscription stored for wallet ${senderWallet} until ${expiresAt.toISOString()} (no users row)`
                              );
                              continue;
                  }

                  const { error: userError } = await supabase
                            .from("users")
                            .update({ pro_alerts_enabled: true, updated_at: now.toISOString() })
                            .eq("id", user.id);

                  if (userError) {
                              console.error("[usdc-pro] user update error:", userError.message);
                  } else {
                              console.log(`[usdc-pro] PRO activated for user ${user.id} until ${expiresAt.toISOString()}`);
                  }
                }
        } catch (err) {
                console.error("[usdc-pro] unexpected error processing event:", err.message);
        }
  }
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
          recordHeliusWebhookReceipt({ events: events.length, signalsWritten: 0 });
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

      // ── PRO activation no longer runs from this webhook ─────────────────────
      // PRO subscriptions are activated exclusively via POST /api/v1/subscription/verify
      // after the user pays through the SubscriptionModal (10 USDC = 7d, 29 USDC = 30d).
      // The maybeActivateProSubscription helper below is kept for reference / rollback only.

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
                                                              removeOnComplete: true,
                                                              removeOnFail: 100
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

      const logPayload = {
        received_at: new Date().toISOString(),
        source: "helius",
        wallets_in_payload: events.length,
        signals_written: emitted,
        queued,
        dropped_by_guard: droppedByGuard
      };
      recordHeliusWebhookReceipt({
        events: events.length,
        signalsWritten: emitted,
        walletsInPayload: events.length
      });
      console.log(JSON.stringify({ event: "helius_webhook_processed", ...logPayload }));

      res.status(200).json({ ok: true, emitted, queued, droppedByGuard });
    } catch (error) {
          recordHeliusWebhookReceipt({ events: 0, signalsWritten: 0, error: error?.message || error });
          console.error("helius webhook:", error);
          res.sendStatus(500);
    }
});

module.exports = router;
