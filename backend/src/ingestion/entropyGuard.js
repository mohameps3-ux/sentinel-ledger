"use strict";

const { isProbableSolanaPubkey } = require("../lib/solanaAddress");

const CONFIG = {
  // Layer 1: cheap body-shape caps.
  maxTransfersPerTx: Number(process.env.RULE_ENTROPY_MAX_TRANSFERS_PER_TX || 64),
  maxTransfersPerRequest: Number(process.env.RULE_ENTROPY_MAX_TRANSFERS_PER_REQUEST || 500),

  // Layer 2: request-level entropy checks.
  minTransfersForEntropyCheck: Number(process.env.RULE_ENTROPY_MIN_TRANSFERS_CHECK || 50),
  minUniqueMintRatio: Number(process.env.RULE_ENTROPY_MIN_UNIQUE_RATIO || 0.05),
  minShannonBits: Number(process.env.RULE_ENTROPY_MIN_SHANNON_BITS || 0.5),

  // Layer 3: per-mint hybrid limiter (sliding window + token bucket).
  windowMs: Number(process.env.RULE_ENTROPY_WINDOW_MS || 10_000),
  windowN: Number(process.env.RULE_ENTROPY_WINDOW_N || 80),
  bucketCapacity: Number(process.env.RULE_ENTROPY_BUCKET_CAPACITY || 80),
  bucketRefillPerSec: Number(process.env.RULE_ENTROPY_BUCKET_REFILL || 12),
  bucketCooldownMs: Number(process.env.RULE_ENTROPY_COOLDOWN_MS || 30_000),

  // Memory safety.
  maxTrackedMints: Number(process.env.RULE_ENTROPY_MAX_TRACKED_MINTS || 5_000),

  // Aggregated reporting (silent defense; no per-event spam).
  reportEveryMs: Number(process.env.RULE_ENTROPY_REPORT_MS || 60_000)
};

// mint -> { tokens:number, lastRefillMs:number, attempts:number[], cooldownUntil:number, lastSeenMs:number }
const mintState = new Map();
const report = {
  startedAtMs: Date.now(),
  droppedTotal: 0,
  droppedByReason: new Map(),
  droppedByMint: new Map()
};

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

function normalizeCount(n, fallback) {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function normalizeDurationMs(n, fallback) {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(100, Math.floor(n));
}

function nowMs() {
  return Date.now();
}

function countTransfers(raw) {
  if (!raw || typeof raw !== "object") return 0;
  const transfers = Array.isArray(raw.tokenTransfers) ? raw.tokenTransfers : [];
  return transfers.length;
}

function listMints(raw) {
  if (!raw || typeof raw !== "object") return [];
  const transfers = Array.isArray(raw.tokenTransfers) ? raw.tokenTransfers : [];
  const out = [];
  for (let i = 0; i < transfers.length; i += 1) {
    const mint = String(transfers[i]?.mint || "").trim();
    if (!mint) continue;
    if (!isProbableSolanaPubkey(mint)) continue;
    out.push(mint);
  }
  return out;
}

function safeEvents(body) {
  return Array.isArray(body) ? body : body ? [body] : [];
}

/**
 * Layer 1: request shape guard.
 * Rejects pathological payloads before expansion/normalization/scoring.
 */
function validateWebhookShape(body) {
  const events = safeEvents(body);
  const maxPerTx = normalizeCount(CONFIG.maxTransfersPerTx, 64);
  const maxPerReq = normalizeCount(CONFIG.maxTransfersPerRequest, 500);
  let totalTransfers = 0;
  for (let i = 0; i < events.length; i += 1) {
    const txTransfers = countTransfers(events[i]);
    if (txTransfers > maxPerTx) {
      return {
        ok: false,
        error: "payload_shape_invalid",
        reason: "tx_transfer_cap_exceeded",
        txIndex: i,
        txTransfers,
        maxTransfersPerTx: maxPerTx
      };
    }
    totalTransfers += txTransfers;
    if (totalTransfers > maxPerReq) {
      return {
        ok: false,
        error: "payload_shape_invalid",
        reason: "request_transfer_cap_exceeded",
        totalTransfers,
        maxTransfersPerRequest: maxPerReq
      };
    }
  }
  return { ok: true, totalTransfers, txCount: events.length };
}

function shannonEntropyBits(counts, total) {
  if (!Array.isArray(counts) || !counts.length || !Number.isFinite(total) || total <= 0) return 0;
  let h = 0;
  for (let i = 0; i < counts.length; i += 1) {
    const c = Number(counts[i]);
    if (!Number.isFinite(c) || c <= 0) continue;
    const p = c / total;
    h += -p * Math.log2(p);
  }
  return h;
}

/**
 * Layer 2: body-level entropy screen.
 * High-volume low-entropy payloads are synthetic-flood shaped and get dropped.
 */
function analyzeWebhookEntropy(body) {
  const events = safeEvents(body);
  const freq = new Map();
  let totalTransfers = 0;
  for (let i = 0; i < events.length; i += 1) {
    const mints = listMints(events[i]);
    for (let j = 0; j < mints.length; j += 1) {
      const mint = mints[j];
      freq.set(mint, (freq.get(mint) || 0) + 1);
      totalTransfers += 1;
    }
  }
  const uniqueMints = freq.size;
  if (totalTransfers <= 0) {
    return {
      ok: true,
      totalTransfers,
      uniqueMints,
      uniqueMintRatio: 1,
      shannonBits: 0,
      topMint: null,
      topMintCount: 0
    };
  }

  const minTransfers = normalizeCount(CONFIG.minTransfersForEntropyCheck, 50);
  const counts = [...freq.values()];
  const topMintCount = counts.length ? Math.max(...counts) : 0;
  let topMint = null;
  if (topMintCount > 0) {
    for (const [mint, c] of freq.entries()) {
      if (c === topMintCount) {
        topMint = mint;
        break;
      }
    }
  }
  const uniqueMintRatio = uniqueMints / totalTransfers;
  const shannonBits = shannonEntropyBits(counts, totalTransfers);
  const minRatio = clamp(Number(CONFIG.minUniqueMintRatio || 0.05), 0, 1);
  const minBits = Math.max(0, Number(CONFIG.minShannonBits || 0.5));

  // Intentionally skip entropy checks for small payloads to avoid false
  // positives on tiny legitimate batches.
  if (totalTransfers < minTransfers) {
    return {
      ok: true,
      totalTransfers,
      uniqueMints,
      uniqueMintRatio,
      shannonBits,
      topMint,
      topMintCount,
      entropyCheckSkipped: true
    };
  }

  if (uniqueMintRatio < minRatio || shannonBits < minBits) {
    return {
      ok: false,
      error: "low_entropy_payload",
      totalTransfers,
      uniqueMints,
      uniqueMintRatio,
      shannonBits,
      topMint,
      topMintCount,
      minUniqueMintRatio: minRatio,
      minShannonBits: minBits
    };
  }

  return {
    ok: true,
    totalTransfers,
    uniqueMints,
    uniqueMintRatio,
    shannonBits,
    topMint,
    topMintCount
  };
}

function noteDrop(mint, reason) {
  report.droppedTotal += 1;
  report.droppedByReason.set(reason, (report.droppedByReason.get(reason) || 0) + 1);
  if (mint) {
    report.droppedByMint.set(mint, (report.droppedByMint.get(mint) || 0) + 1);
  }
}

function trimMintState(now) {
  const maxTracked = normalizeCount(CONFIG.maxTrackedMints, 5_000);
  if (mintState.size <= maxTracked) return;
  const overflow = mintState.size - maxTracked;
  if (overflow <= 0) return;
  const evict = [];
  for (const [mint, st] of mintState.entries()) {
    evict.push({ mint, lastSeenMs: Number(st.lastSeenMs) || 0 });
  }
  evict.sort((a, b) => a.lastSeenMs - b.lastSeenMs);
  for (let i = 0; i < overflow; i += 1) {
    const victim = evict[i];
    if (!victim) break;
    mintState.delete(victim.mint);
  }
}

function getMintState(mint, now) {
  let st = mintState.get(mint);
  if (!st) {
    const cap = normalizeCount(CONFIG.bucketCapacity, 80);
    st = {
      tokens: cap,
      lastRefillMs: now,
      attempts: [],
      cooldownUntil: 0,
      lastSeenMs: now
    };
    mintState.set(mint, st);
    trimMintState(now);
  } else {
    st.lastSeenMs = now;
  }
  return st;
}

/**
 * Layer 3: per-mint hybrid limiter.
 * Returns { allowed:boolean, reason?:string }.
 */
function shouldAllowMint(mint, now = nowMs()) {
  if (!isProbableSolanaPubkey(mint)) {
    return { allowed: false, reason: "invalid_mint" };
  }

  const st = getMintState(mint, now);
  const windowMs = normalizeDurationMs(CONFIG.windowMs, 10_000);
  const windowN = normalizeCount(CONFIG.windowN, 80);
  const cap = normalizeCount(CONFIG.bucketCapacity, 80);
  const refillPerSec = Math.max(0.01, Number(CONFIG.bucketRefillPerSec || 12));
  const cooldownMs = normalizeDurationMs(CONFIG.bucketCooldownMs, 30_000);

  // Sliding-window attempt tracking.
  while (st.attempts.length > 0 && now - st.attempts[0] > windowMs) st.attempts.shift();
  st.attempts.push(now);

  // Fast refill based on elapsed wall-clock.
  const elapsedMs = Math.max(0, now - st.lastRefillMs);
  if (elapsedMs > 0) {
    st.tokens = Math.min(cap, st.tokens + (elapsedMs / 1000) * refillPerSec);
    st.lastRefillMs = now;
  }

  if (st.attempts.length > windowN) {
    st.cooldownUntil = Math.max(st.cooldownUntil, now + cooldownMs);
    noteDrop(mint, "window_saturated");
    return { allowed: false, reason: "window_saturated" };
  }

  if (st.cooldownUntil > now) {
    noteDrop(mint, "cooldown");
    return { allowed: false, reason: "cooldown" };
  }

  if (st.tokens < 1) {
    st.cooldownUntil = Math.max(st.cooldownUntil, now + cooldownMs);
    noteDrop(mint, "bucket_empty");
    return { allowed: false, reason: "bucket_empty" };
  }

  st.tokens -= 1;
  return { allowed: true };
}

function flushReport(force = false) {
  const now = nowMs();
  const elapsed = now - report.startedAtMs;
  const threshold = normalizeDurationMs(CONFIG.reportEveryMs, 60_000);
  if (!force && elapsed < threshold) return;
  if (report.droppedTotal > 0) {
    const reasons = [...report.droppedByReason.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, n]) => `${reason}:${n}`)
      .join(", ");
    const topOffender = [...report.droppedByMint.entries()].sort((a, b) => b[1] - a[1])[0] || null;
    console.warn(
      `[GUARD_REPORT] window_ms=${elapsed} dropped=${report.droppedTotal} mints=${report.droppedByMint.size} top=${topOffender ? `${topOffender[0]}:${topOffender[1]}` : "none"} reasons=${reasons || "none"}`
    );
  }
  report.startedAtMs = now;
  report.droppedTotal = 0;
  report.droppedByReason.clear();
  report.droppedByMint.clear();
}

const reportTimer = setInterval(() => flushReport(false), normalizeDurationMs(CONFIG.reportEveryMs, 60_000));
if (reportTimer && typeof reportTimer.unref === "function") reportTimer.unref();

function getEntropyGuardSnapshot() {
  return {
    config: { ...CONFIG },
    trackedMints: mintState.size,
    droppedTotalCurrentWindow: report.droppedTotal,
    reasonsCurrentWindow: [...report.droppedByReason.entries()]
  };
}

module.exports = {
  validateWebhookShape,
  analyzeWebhookEntropy,
  shouldAllowMint,
  flushEntropyGuardReport: () => flushReport(true),
  getEntropyGuardSnapshot
};

