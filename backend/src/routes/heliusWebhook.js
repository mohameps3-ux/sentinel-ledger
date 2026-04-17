const express = require("express");
const redis = require("../lib/cache");

const router = express.Router();

const DEDUPE_TTL_SEC = 120;

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
  if (!secret) return next();
  const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const header = (req.headers["x-helius-secret"] || "").trim();
  if (bearer === secret || header === secret) return next();
  return res.status(401).json({ ok: false, error: "webhook_unauthorized" });
}

router.post("/helius", heliusWebhookAuth, async (req, res) => {
  try {
    const body = req.body;
    const events = Array.isArray(body) ? body : body ? [body] : [];
    let emitted = 0;

    for (const raw of events) {
      const txs = expandHeliusPayload(raw);
      for (const tx of txs) {
        if (!tx.tokenAddress || !global.io) continue;
        const sig = tx.signature || "nosig";
        const dedupeKey = `helius:tx:${sig}:${tx.tokenAddress}:${tx.wallet}:${tx.type}:${String(tx.amount)}`;
        const first = await markFirstEmit(dedupeKey);
        if (!first) continue;
        global.io.to(tx.tokenAddress).emit("transaction", tx);
        emitted += 1;
      }
    }

    res.status(200).json({ ok: true, emitted });
  } catch (error) {
    console.error("helius webhook:", error);
    res.sendStatus(500);
  }
});

module.exports = router;
