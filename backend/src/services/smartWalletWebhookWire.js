"use strict";

/**
 * After a gated signal is persisted (signal_performance), refresh smart_wallets liveness
 * and defer heavy metrics to the existing smart-wallet-analysis queue (Fase 4 analyzeWallet).
 * Keeps webhook path light: one batched UPDATE + BullMQ adds (no full chain scan inline).
 */

const { getSupabase } = require("../lib/supabase");
const { getSmartWalletQueue } = require("../queues/smartWallet.queue");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");
const { BULLMQ_PRIORITY_WEBHOOK_INGEST } = require("../lib/eventPriority");
const { ecoModeActive } = require("./budgetGuard");

const MAX_WALLETS_PER_TX = 16;

function uniqueValidSolanaWallets(candidates) {
  const out = [];
  const seen = new Set();
  for (const w of candidates || []) {
    const a = String(w || "").trim();
    if (!a || !isProbableSolanaPubkey(a) || seen.has(a)) continue;
    seen.add(a);
    out.push(a);
    if (out.length >= MAX_WALLETS_PER_TX) break;
  }
  return out;
}

function safeJobIdSegment(s) {
  return String(s || "nosig").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
}

/**
 * @param {{ wallets: string[], signature?: string }} opts
 * @returns {Promise<void>}
 */
async function wireSmartWalletsAfterSignal(opts = {}) {
  const addrs = uniqueValidSolanaWallets(opts.wallets);
  if (!addrs.length) return;

  let supabase;
  try {
    supabase = getSupabase();
  } catch {
    return;
  }

  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("smart_wallets")
    .update({ last_seen: nowIso, updated_at: nowIso })
    .in("wallet_address", addrs);
  if (upErr) {
    console.warn("[smart-wallet-wire] last_seen batch update:", upErr.message || upErr);
  }

  if (await ecoModeActive()) {
    console.log("[smart-wallet-wire] ECO_MODE: last_seen touch only, skip analyze-wallet enqueue");
    return;
  }

  const queue = getSmartWalletQueue();
  if (!queue) return;

  const sigSeg = safeJobIdSegment(opts.signature);
  for (const addr of addrs) {
    const jobId = `webhook_sw_${safeJobIdSegment(addr)}_${sigSeg}`.slice(0, 200);
    try {
      await queue.add(
        "analyze-wallet",
        { walletAddress: addr },
        {
          jobId,
          priority: BULLMQ_PRIORITY_WEBHOOK_INGEST,
          removeOnComplete: { count: 1000, age: 3600 },
          removeOnFail: { count: 500, age: 86400 }
        }
      );
    } catch (e) {
      const msg = e?.message || String(e);
      if (/already exists|duplicate job id/i.test(msg)) continue;
      console.warn(`[smart-wallet-wire] enqueue analyze-wallet failed (${addr.slice(0, 6)}…):`, msg);
    }
  }
}

module.exports = {
  wireSmartWalletsAfterSignal,
  uniqueValidSolanaWallets
};
