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
  reportEveryMs: Number(process.env.RULE_ENTROPY_REPORT_MS || 60_000),

  // Ops observability + sustained-threshold alerts.
  historyMaxPoints: Number(process.env.RULE_ENTROPY_HISTORY_POINTS || 60),
  alertDropsPerWindow: Number(process.env.RULE_ENTROPY_ALERT_DROPS_PER_WINDOW || 5000),
  alertSustainWindows: Number(process.env.RULE_ENTROPY_ALERT_SUSTAIN_WINDOWS || 3),
  memoryLimitBytes: Number(process.env.RULE_ENTROPY_MEMORY_LIMIT_BYTES || 8 * 1024 * 1024),
  memoryPressureRatio: Number(process.env.RULE_ENTROPY_MEMORY_PRESSURE_RATIO || 0.8),
  alertWebhookCooldownMs: Number(process.env.RULE_ENTROPY_ALERT_WEBHOOK_COOLDOWN_MS || 300_000),
  opsAlertWebhookUrl: String(process.env.OPS_ALERT_WEBHOOK_URL || "").trim()
};

// mint -> { tokens:number, lastRefillMs:number, attempts:number[], cooldownUntil:number, lastSeenMs:number }
const mintState = new Map();
const report = {
  startedAtMs: Date.now(),
  droppedTotal: 0,
  droppedByReason: new Map(),
  droppedByMint: new Map()
};
const cumulative = {
  totalDrops: 0,
  dropsByReason: new Map(),
  dropsByMint: new Map(), // mint -> { drops:number, lastSeen:number }
  maxDropsByMintEntries: 2000
};
const reportHistory = [];
const alertState = {
  sustainedDrops: false,
  memoryPressure: false,
  highIngestionPressure: false,
  highIngestionSince: null,
  lastTransitionAt: null,
  lastWebhookAt: null
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
  cumulative.totalDrops += 1;
  cumulative.dropsByReason.set(reason, (cumulative.dropsByReason.get(reason) || 0) + 1);
  if (mint) {
    const prev = cumulative.dropsByMint.get(mint);
    if (prev) {
      prev.drops += 1;
      prev.lastSeen = nowMs();
    } else {
      cumulative.dropsByMint.set(mint, { drops: 1, lastSeen: nowMs() });
      trimCumulativeDropsByMint();
    }
  }
}

/**
 * Bulk drop accounting for early request-level rejections (shape/entropy).
 * This keeps the Ops metrics honest even when we reject before per-tx gating.
 */
function recordGuardDrop(reason, count = 1, mint = null) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  report.droppedTotal += n;
  report.droppedByReason.set(reason, (report.droppedByReason.get(reason) || 0) + n);
  cumulative.totalDrops += n;
  cumulative.dropsByReason.set(reason, (cumulative.dropsByReason.get(reason) || 0) + n);
  if (mint) {
    report.droppedByMint.set(mint, (report.droppedByMint.get(mint) || 0) + n);
    const prev = cumulative.dropsByMint.get(mint);
    if (prev) {
      prev.drops += n;
      prev.lastSeen = nowMs();
    } else {
      cumulative.dropsByMint.set(mint, { drops: n, lastSeen: nowMs() });
      trimCumulativeDropsByMint();
    }
  }
}

function trimCumulativeDropsByMint() {
  if (cumulative.dropsByMint.size <= cumulative.maxDropsByMintEntries) return;
  const overflow = cumulative.dropsByMint.size - cumulative.maxDropsByMintEntries;
  const entries = [];
  for (const [mint, st] of cumulative.dropsByMint.entries()) {
    entries.push({ mint, lastSeen: Number(st.lastSeen) || 0 });
  }
  entries.sort((a, b) => a.lastSeen - b.lastSeen);
  for (let i = 0; i < overflow; i += 1) {
    const victim = entries[i];
    if (!victim) break;
    cumulative.dropsByMint.delete(victim.mint);
  }
}

function estimateGuardMemoryUsageBytes() {
  // Approximation by cardinality and key/value sizes; no heap scan.
  // Keeps O(1) behavior and avoids observability becoming a perf hazard.
  const trackedMints = mintState.size;
  const droppedMints = cumulative.dropsByMint.size;
  const history = reportHistory.length;
  const bytesPerTrackedMint = 320;
  const bytesPerDroppedMint = 120;
  const bytesPerHistoryPoint = 256;
  const base = 16 * 1024;
  return (
    base +
    trackedMints * bytesPerTrackedMint +
    droppedMints * bytesPerDroppedMint +
    history * bytesPerHistoryPoint
  );
}

function shortMint(mint) {
  if (!mint || typeof mint !== "string") return "none";
  return mint.length > 10 ? `${mint.slice(0, 6)}...${mint.slice(-4)}` : mint;
}

async function sendOpsCriticalWebhook({
  mode,
  dropsPerWindow,
  topOffenderMint,
  topOffenderDrops,
  memoryUsageBytes
}) {
  const url = CONFIG.opsAlertWebhookUrl;
  if (!url) return;
  const now = nowMs();
  const cooldown = normalizeDurationMs(CONFIG.alertWebhookCooldownMs, 300_000);
  if (alertState.lastWebhookAt && now - alertState.lastWebhookAt < cooldown) return;
  alertState.lastWebhookAt = now;
  const msg =
    `[OPS_ALERT] ⚠️ HIGH_INGESTION_PRESSURE | Drops: ${Math.round(dropsPerWindow)} /m` +
    ` | Mode: ${mode}` +
    ` | TopOffender: ${shortMint(topOffenderMint)} (${topOffenderDrops || 0})` +
    ` | Mem: ${Math.round(memoryUsageBytes / 1024)}KB`;

  const payload = {
    text: msg,
    content: msg,
    username: "Sentinel Ops Guard",
    embeds: [
      {
        title: "HIGH_INGESTION_PRESSURE",
        description: msg,
        color: 15158332
      }
    ]
  };
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    // Silent by design: webhook transport must never affect ingestion.
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

  // Sliding-window state trimming.
  while (st.attempts.length > 0 && now - st.attempts[0] > windowMs) st.attempts.shift();

  // Fast refill based on elapsed wall-clock.
  const elapsedMs = Math.max(0, now - st.lastRefillMs);
  if (elapsedMs > 0) {
    st.tokens = Math.min(cap, st.tokens + (elapsedMs / 1000) * refillPerSec);
    st.lastRefillMs = now;
  }

  if (st.cooldownUntil > now) {
    noteDrop(mint, "cooldown");
    return { allowed: false, reason: "cooldown" };
  }

  // Window saturation check before tracking this new attempt keeps memory
  // bounded even under pathological floods while preserving strictness.
  if (st.attempts.length >= windowN) {
    st.cooldownUntil = Math.max(st.cooldownUntil, now + cooldownMs);
    noteDrop(mint, "window_saturated");
    return { allowed: false, reason: "window_saturated" };
  }

  st.attempts.push(now);
  // Hard cap to avoid unbounded arrays if thresholds are misconfigured.
  if (st.attempts.length > windowN) st.attempts.shift();

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
  const reasonsArr = [...report.droppedByReason.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topOffender = [...report.droppedByMint.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const point = {
    at: now,
    windowMs: elapsed,
    droppedTotal: report.droppedTotal,
    uniqueMintsDropped: report.droppedByMint.size,
    reasons: reasonsArr.map(([reason, count]) => ({ reason, count })),
    topOffender: topOffender ? { mint: topOffender[0], count: topOffender[1] } : null
  };
  reportHistory.push(point);
  const maxPoints = normalizeCount(CONFIG.historyMaxPoints, 180);
  while (reportHistory.length > maxPoints) reportHistory.shift();

  const sustainN = normalizeCount(CONFIG.alertSustainWindows, 3);
  const sustainThreshold = normalizeCount(CONFIG.alertDropsPerWindow, 5000);
  const memoryLimitBytes = normalizeCount(CONFIG.memoryLimitBytes, 8 * 1024 * 1024);
  const memoryPressureRatio = clamp(Number(CONFIG.memoryPressureRatio || 0.8), 0.1, 0.99);
  const memoryUsageBytes = estimateGuardMemoryUsageBytes();
  const memoryThresholdBytes = Math.floor(memoryLimitBytes * memoryPressureRatio);
  const recent = reportHistory.slice(-sustainN);
  const sustainedDropsNow =
    recent.length >= sustainN && recent.every((x) => Number(x.droppedTotal || 0) >= sustainThreshold);
  const memoryPressureNow = memoryUsageBytes >= memoryThresholdBytes;
  const highPressureNow = sustainedDropsNow || memoryPressureNow;
  const topOffenderMint = topOffender ? topOffender[0] : null;
  const topOffenderDrops = topOffender ? topOffender[1] : 0;
  const mode = sustainedDropsNow ? "SHANNON_ENTROPY_BLOCK" : "MEMORY_PRESSURE";
  if (highPressureNow !== alertState.highIngestionPressure) {
    alertState.lastTransitionAt = now;
    alertState.highIngestionPressure = highPressureNow;
    alertState.sustainedDrops = sustainedDropsNow;
    alertState.memoryPressure = memoryPressureNow;
    if (highPressureNow) alertState.highIngestionSince = now;
    if (!highPressureNow) alertState.highIngestionSince = null;
    console.warn(
      `[OPS_ALERT] ⚠️ HIGH_INGESTION_PRESSURE | Drops: ${Math.round(point.droppedTotal)} /m | Mode: ${mode}` +
        ` | TopOffender: ${shortMint(topOffenderMint)} (${topOffenderDrops})` +
        ` | Mem: ${Math.round(memoryUsageBytes / 1024)}KB`
    );
    if (highPressureNow) {
      sendOpsCriticalWebhook({
        mode,
        dropsPerWindow: point.droppedTotal,
        topOffenderMint,
        topOffenderDrops,
        memoryUsageBytes
      });
    }
  } else if (highPressureNow) {
    // If pressure is ongoing, allow periodic critical webhook (cooldown-gated).
    sendOpsCriticalWebhook({
      mode,
      dropsPerWindow: point.droppedTotal,
      topOffenderMint,
      topOffenderDrops,
      memoryUsageBytes
    });
  } else {
    alertState.sustainedDrops = sustainedDropsNow;
    alertState.memoryPressure = memoryPressureNow;
  }

  if (report.droppedTotal > 0) {
    const reasons = reasonsArr
      .slice(0, 5)
      .map(([reason, n]) => `${reason}:${n}`)
      .join(", ");
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
  const currentTop = [...report.droppedByMint.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  return {
    config: {
      maxTransfersPerTx: CONFIG.maxTransfersPerTx,
      maxTransfersPerRequest: CONFIG.maxTransfersPerRequest,
      minTransfersForEntropyCheck: CONFIG.minTransfersForEntropyCheck,
      minUniqueMintRatio: CONFIG.minUniqueMintRatio,
      minShannonBits: CONFIG.minShannonBits,
      windowMs: CONFIG.windowMs,
      windowN: CONFIG.windowN,
      bucketCapacity: CONFIG.bucketCapacity,
      bucketRefillPerSec: CONFIG.bucketRefillPerSec,
      bucketCooldownMs: CONFIG.bucketCooldownMs,
      maxTrackedMints: CONFIG.maxTrackedMints,
      reportEveryMs: CONFIG.reportEveryMs,
      historyMaxPoints: CONFIG.historyMaxPoints,
      alertDropsPerWindow: CONFIG.alertDropsPerWindow,
      alertSustainWindows: CONFIG.alertSustainWindows,
      memoryLimitBytes: CONFIG.memoryLimitBytes,
      memoryPressureRatio: CONFIG.memoryPressureRatio,
      alertWebhookCooldownMs: CONFIG.alertWebhookCooldownMs
    },
    now: Date.now(),
    trackedMints: mintState.size,
    currentWindow: {
      since: report.startedAtMs,
      droppedTotal: report.droppedTotal,
      reasons: [...report.droppedByReason.entries()].map(([reason, count]) => ({ reason, count })),
      topOffender: currentTop ? { mint: currentTop[0], count: currentTop[1] } : null
    },
    alerts: {
      sustainedDrops: alertState.sustainedDrops,
      memoryPressure: alertState.memoryPressure,
      highIngestionPressure: alertState.highIngestionPressure,
      highIngestionSince: alertState.highIngestionSince,
      lastTransitionAt: alertState.lastTransitionAt
    },
    history: reportHistory.slice()
  };
}

function getEntropyGuardOpsSnapshot() {
  const config = {
    windowMs: CONFIG.windowMs,
    bucketCapacity: CONFIG.bucketCapacity,
    entropyThreshold: CONFIG.minShannonBits
  };
  const dropsByReason = {};
  for (const [reason, n] of cumulative.dropsByReason.entries()) {
    dropsByReason[reason] = n;
  }
  const topOffenders = [...cumulative.dropsByMint.entries()]
    .sort((a, b) => b[1].drops - a[1].drops)
    .slice(0, 10)
    .map(([mint, st]) => ({
      mint,
      drops: st.drops,
      lastSeen: new Date(st.lastSeen).toISOString()
    }));

  return {
    status: "active",
    config,
    metrics: {
      trackedMints: mintState.size,
      memoryUsageBytes: estimateGuardMemoryUsageBytes(),
      totalDrops: cumulative.totalDrops,
      dropsByReason
    },
    topOffenders,
    alerts: {
      highIngestionPressure: alertState.highIngestionPressure,
      sustainedDrops: alertState.sustainedDrops,
      memoryPressure: alertState.memoryPressure,
      highIngestionSince: alertState.highIngestionSince,
      lastTransitionAt: alertState.lastTransitionAt
    }
  };
}

module.exports = {
  validateWebhookShape,
  analyzeWebhookEntropy,
  shouldAllowMint,
  recordGuardDrop,
  flushEntropyGuardReport: () => flushReport(true),
  getEntropyGuardSnapshot,
  getEntropyGuardOpsSnapshot
};

