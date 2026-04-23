const redis = require("../lib/cache");
const { getMarketData, getMarketDataCircuitStatus } = require("./marketData");
const { pctFromPrices } = require("./smartWalletSignalPrices");
const { fetchTrendingList } = require("./trendingList");
const { detectNarrativeTags } = require("./narrativeTags");
const { getActiveSignalWeightMap } = require("./signalCalibrator");
const {
  combinedPerformanceWeight,
  recencyMultiplier,
  recencyDecayLabel,
  isAnomalousOutcomePct,
  clampQualityStack,
  gateDexPairAge,
  poolAgeLabelFromMs
} = require("./signalFeedQuality");
const { appendFreshnessEvent, getDataFreshnessSnapshotFromStore } = require("./freshnessHistoryStore");

const CACHE_TTL_SEC = Number(process.env.HOME_TERMINAL_CACHE_TTL_SEC || 180);
const HOT_CACHE_TTL_SEC = Math.max(30, Number(process.env.HOME_TERMINAL_HOT_CACHE_TTL_SEC || 90));
const LATEST_SIGNALS_CACHE_TTL_SEC = Math.max(30, Number(process.env.HOME_TERMINAL_LATEST_CACHE_TTL_SEC || 90));
/** War home expanded grid (56) + headroom. Lower in prod if `getMarketData` pressure matters (each card may fetch market once per cache miss). */
const SIGNAL_FEED_MAX_CARDS = Math.min(100, Math.max(16, Number(process.env.SIGNAL_FEED_MAX_CARDS || 64)));
function capSignalsLatestLimit(n) {
  return Math.min(SIGNAL_FEED_MAX_CARDS, Math.max(1, Number(n) || 10));
}
const SIGNALS_STATIC_FALLBACK_ALERT_AFTER_MS = Math.max(
  1_000,
  Math.floor(Number(process.env.SIGNALS_LATEST_STATIC_ALERT_AFTER_MINUTES || 10) * 60_000)
);
const SIGNALS_STATIC_FALLBACK_ALERT_COOLDOWN_MS = Math.max(
  5_000,
  Math.floor(Number(process.env.SIGNALS_LATEST_STATIC_ALERT_COOLDOWN_MS || 300_000))
);
const SIGNALS_SUPABASE_SLO_ALERT_ENABLED =
  String(process.env.SIGNALS_SUPABASE_SLO_ALERT_ENABLED || "true").toLowerCase() !== "false";
const SIGNALS_SUPABASE_SLO_ALERT_AFTER_MS = Math.max(
  60_000,
  Math.floor(Number(process.env.SIGNALS_SUPABASE_SLO_ALERT_AFTER_MINUTES || 20) * 60_000)
);
const SIGNALS_SUPABASE_SLO_ALERT_COOLDOWN_MS = Math.max(
  5_000,
  Math.floor(Number(process.env.SIGNALS_SUPABASE_SLO_ALERT_COOLDOWN_MS || 300_000))
);
const SIGNALS_SUPABASE_SLO_ALERT_MIN_REQUESTS_24H = Math.max(
  1,
  Math.floor(Number(process.env.SIGNALS_SUPABASE_SLO_ALERT_MIN_REQUESTS_24H || 25))
);
const SIGNALS_SUPABASE_SLO_EVAL_MS = Math.max(
  5_000,
  Math.floor(Number(process.env.SIGNALS_SUPABASE_SLO_EVAL_MS || 30_000))
);
const OPS_ALERT_WEBHOOK_URL = String(process.env.OPS_ALERT_WEBHOOK_URL || "").trim();
const latestSignalsFallbackState = {
  activeSinceMs: null,
  lastStaticSeenMs: null,
  lastRecoveryAtMs: null,
  lastSource: null,
  lastCount: 0,
  lastAlertAtMs: null,
  alertsSent: 0,
  lastIncidentDurationMs: null
};
const signalsSupabaseSloState = {
  activeSinceMs: null,
  lastAlertAtMs: null,
  alertsSent: 0,
  lastRecoveryAtMs: null,
  lastIncidentDurationMs: null,
  lastRate: null,
  lastRequests24h: 0,
  lastTopFallbackReason: null,
  lastTopProviderUsed: null
};
let signalsSupabaseSloIntervalRef = null;
const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;
const SIGNALS_SUPABASE_SLO_TARGET = Math.min(
  1,
  Math.max(0, Number(process.env.SIGNALS_LATEST_SUPABASE_SLO_TARGET || 0.8))
);
const freshnessState = {
  signalsLatest: [],
  tokensHot: []
};

function jupiterSwapUrl(mint, sol) {
  if (!mint) return "";
  const lamports = Math.round(Number(sol) * 1_000_000_000);
  return `https://jup.ag/swap/SOL-${mint}?amount=${lamports}`;
}

function decisionFromScore(score, strategy = "balanced") {
  const high = strategy === "conservative" ? 90 : strategy === "aggressive" ? 80 : 85;
  const mid = strategy === "conservative" ? 75 : strategy === "aggressive" ? 62 : 68;
  if (score >= high) return "ENTER NOW";
  if (score >= mid) return "PREPARE";
  return "STAY OUT";
}

function walletTierLabel(winRate) {
  const w = Number(winRate || 0);
  if (w >= 88) return "🐋 Whale";
  if (w >= 78) return "🧠 Smart";
  return "📡 Scout";
}

function walletDecisionFromSmartScore(score) {
  const s = Number(score || 0);
  if (s >= 82) return "FOLLOW";
  if (s >= 65) return "MONITOR";
  return "IGNORE";
}

/** Ranking score: DB smart_score if set, else spec blend win*0.4 + early*0.3 + cluster*0.2 + consistency*0.1 */
function computedSmartScore(row) {
  const wr = Number(row.win_rate || 0);
  const early = Number(row.early_entry_score);
  const cluster = Number(row.cluster_score);
  const consistency = Number(row.consistency_score);
  const db = Number(row.smart_score);
  if (Number.isFinite(db) && db > 0) return Math.min(100, Math.round(db));
  if ([early, cluster, consistency].every((n) => Number.isFinite(n))) {
    const blended = wr * 0.4 + early * 0.3 + cluster * 0.2 + consistency * 0.1;
    return Math.min(100, Math.max(35, Math.round(blended)));
  }
  return Math.min(100, Math.max(35, Math.round(wr)));
}

async function withCache(key, producer, ttlSec = CACHE_TTL_SEC) {
  try {
    const hit = await redis.get(key);
    if (hit != null) {
      const parsed = typeof hit === "string" ? JSON.parse(hit) : hit;
      return { payload: parsed, cache: "hit" };
    }
  } catch (e) {
    console.warn("[homeTerminalApi] cache get", key, e.message);
  }
  const payload = await producer();
  try {
    await redis.set(key, JSON.stringify(payload), { ex: Math.max(5, Number(ttlSec) || CACHE_TTL_SEC) });
  } catch (e) {
    console.warn("[homeTerminalApi] cache set", key, e.message);
  }
  return { payload, cache: "miss" };
}

function upstreamStatusSnapshot() {
  const market = getMarketDataCircuitStatus();
  return {
    degraded: Boolean(market?.degraded),
    reason: market?.reason || null,
    providers: market || null
  };
}

function trimFreshnessWindow(arr, now) {
  while (arr.length > 0 && now - Number(arr[0]?.at || 0) > FRESHNESS_WINDOW_MS) arr.shift();
}

function recordFreshness(endpoint, meta = {}) {
  const now = Date.now();
  const target = endpoint === "tokensHot" ? freshnessState.tokensHot : freshnessState.signalsLatest;
  target.push({
    at: now,
    source: String(meta?.source || "unknown"),
    realDataRatio: Number(meta?.realDataRatio || 0),
    fallbackReason: meta?.fallbackReason ? String(meta.fallbackReason) : null,
    providerUsed: meta?.providerUsed ? String(meta.providerUsed) : null
  });
  trimFreshnessWindow(target, now);
  // DB-first source of truth: persist every freshness event for 24h rollups
  // that survive restarts/deploys. In-memory stays as safety fallback only.
  appendFreshnessEvent({
    endpoint,
    capturedAt: now,
    source: meta?.source,
    realDataRatio: meta?.realDataRatio,
    fallbackReason: meta?.fallbackReason,
    providerUsed: meta?.providerUsed
  }).catch(() => {});
}

function summarizeFreshness(events, endpoint) {
  const total = events.length;
  if (!total) {
    return {
      requests24h: 0,
      realRatio24h: 0,
      staticFallbackRate24h: 0,
      sourceBreakdown24h: {},
      fallbackReasonBreakdown24h: {},
      providerUsedBreakdown24h: {},
      supabaseSourceRate24h: 0,
      slo: endpoint === "signalsLatest" ? { targetSupabaseRate: SIGNALS_SUPABASE_SLO_TARGET, met: false } : null
    };
  }
  let realSum = 0;
  let staticCount = 0;
  let supabaseCount = 0;
  const sourceCounts = new Map();
  const fallbackCounts = new Map();
  const providerCounts = new Map();
  for (const ev of events) {
    realSum += Number(ev.realDataRatio || 0);
    if (ev.source === "degraded_empty") staticCount += 1;
    if (ev.source === "supabase") supabaseCount += 1;
    sourceCounts.set(ev.source, (sourceCounts.get(ev.source) || 0) + 1);
    if (ev.fallbackReason) fallbackCounts.set(ev.fallbackReason, (fallbackCounts.get(ev.fallbackReason) || 0) + 1);
    if (ev.providerUsed) providerCounts.set(ev.providerUsed, (providerCounts.get(ev.providerUsed) || 0) + 1);
  }
  const sourceBreakdown24h = Object.fromEntries([...sourceCounts.entries()].sort((a, b) => b[1] - a[1]));
  const fallbackReasonBreakdown24h = Object.fromEntries([...fallbackCounts.entries()].sort((a, b) => b[1] - a[1]));
  const providerUsedBreakdown24h = Object.fromEntries([...providerCounts.entries()].sort((a, b) => b[1] - a[1]));
  const supabaseSourceRate24h = Number((supabaseCount / total).toFixed(4));
  return {
    requests24h: total,
    realRatio24h: Number((realSum / total).toFixed(4)),
    staticFallbackRate24h: Number((staticCount / total).toFixed(4)),
    sourceBreakdown24h,
    fallbackReasonBreakdown24h,
    providerUsedBreakdown24h,
    supabaseSourceRate24h,
    slo:
      endpoint === "signalsLatest"
        ? {
            targetSupabaseRate: SIGNALS_SUPABASE_SLO_TARGET,
            met: supabaseSourceRate24h >= SIGNALS_SUPABASE_SLO_TARGET
          }
        : null
  };
}

async function getDataFreshnessSnapshot() {
  const dbSnapshot = await getDataFreshnessSnapshotFromStore({
    hours: 24,
    targetSupabaseRate: SIGNALS_SUPABASE_SLO_TARGET
  });
  if (dbSnapshot?.ok && dbSnapshot.data) {
    return dbSnapshot.data;
  }
  const now = Date.now();
  trimFreshnessWindow(freshnessState.signalsLatest, now);
  trimFreshnessWindow(freshnessState.tokensHot, now);
  return {
    generatedAt: now,
    signalsLatest: summarizeFreshness(freshnessState.signalsLatest, "signalsLatest"),
    tokensHot: summarizeFreshness(freshnessState.tokensHot, "tokensHot")
  };
}

function computeRealDataRatio(source, count, limit) {
  const n = Math.max(0, Number(count) || 0);
  const lim = Math.max(1, Number(limit) || 1);
  if (source === "degraded_empty") return 0;
  return Math.min(1, Number((n / lim).toFixed(3)));
}

function enrichSignalsMeta(payload, { limit, fallbackReason = null }) {
  const source = String(payload?.meta?.source || "unknown");
  const count = Array.isArray(payload?.data) ? payload.data.length : Number(payload?.meta?.count || 0);
  const upstreamStatus = upstreamStatusSnapshot();
  return {
    ...payload,
    meta: {
      ...(payload?.meta || {}),
      count,
      upstreamStatus,
      fallbackReason,
      providerUsed: payload?.meta?.providerUsed || source,
      attempts: Number(payload?.meta?.attempts || 1),
      circuitState: payload?.meta?.circuitState || null,
      realDataRatio: computeRealDataRatio(source, count, limit)
    }
  };
}

function emergencyHotPayload(limit, reason = "upstream_unavailable") {
  const data = [];
  return {
    ok: true,
    data,
    meta: {
      source: "degraded_empty",
      providerUsed: "none",
      attempts: 1,
      circuitState: null,
      degraded: true,
      fallbackReason: reason,
      endpoint: "tokens/hot",
      count: data.length,
      upstreamStatus: upstreamStatusSnapshot(),
      realDataRatio: 0
    }
  };
}

function clusterHeatFromScore(score) {
  const s = Number(score || 0);
  if (s >= 88) return "🔥🔥🔥";
  if (s >= 72) return "🔥🔥";
  return "🔥";
}

function evidenceChipsFor(score) {
  const chips = ["🐋 Whale", "🧠 Smart"];
  if (score >= 80) chips.push("🔥 Cluster");
  else chips.push("💧 Flow");
  return chips.slice(0, 5);
}

function topBreakdownEntry(obj = {}) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return null;
  entries.sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));
  return entries[0];
}

async function sendStaticFallbackOpsAlert(durationMs, count) {
  if (!OPS_ALERT_WEBHOOK_URL) return;
  const mins = Math.max(0, Math.round(durationMs / 60000));
  const msg =
    `[OPS_ALERT] ⚠️ SIGNALS_LATEST_STATIC_FALLBACK_SUSTAINED` +
    ` | Duration: ${mins}m` +
    ` | Count: ${count}` +
    ` | Threshold: ${Math.round(SIGNALS_STATIC_FALLBACK_ALERT_AFTER_MS / 60000)}m`;
  const payload = {
    text: msg,
    content: msg,
    username: "Sentinel Ops Guard",
    embeds: [
      {
        title: "SIGNALS_LATEST_STATIC_FALLBACK_SUSTAINED",
        description: msg,
        color: 15158332
      }
    ]
  };
  try {
    await fetch(OPS_ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    // Silent by design: fallback observability must never impact API response path.
  }
}

async function sendSupabaseSloOpsAlert(summary, durationMs) {
  if (!OPS_ALERT_WEBHOOK_URL) return;
  const mins = Math.max(0, Math.round(durationMs / 60000));
  const rate = Number(summary?.supabaseSourceRate24h || 0);
  const target = Number(summary?.slo?.targetSupabaseRate || SIGNALS_SUPABASE_SLO_TARGET);
  const requests = Number(summary?.requests24h || 0);
  const topFallback = topBreakdownEntry(summary?.fallbackReasonBreakdown24h || {});
  const topProvider = topBreakdownEntry(summary?.providerUsedBreakdown24h || {});
  const msg =
    `[OPS_ALERT] ⚠️ SIGNALS_SUPABASE_SLO_BREACH` +
    ` | Duration: ${mins}m` +
    ` | supabaseRate24h=${rate.toFixed(4)}` +
    ` | target=${target.toFixed(4)}` +
    ` | requests24h=${requests}` +
    ` | topFallback=${topFallback ? `${topFallback[0]}:${topFallback[1]}` : "n/a"}` +
    ` | topProvider=${topProvider ? `${topProvider[0]}:${topProvider[1]}` : "n/a"}`;
  const payload = {
    text: msg,
    content: msg,
    username: "Sentinel Ops Guard",
    embeds: [
      {
        title: "SIGNALS_SUPABASE_SLO_BREACH",
        description: msg,
        color: 15105570
      }
    ]
  };
  try {
    await fetch(OPS_ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    // Silent by design: alert transport must not affect API path.
  }
}

function trackSignalsSupabaseSlo(summary = {}) {
  if (!SIGNALS_SUPABASE_SLO_ALERT_ENABLED) return;
  const now = Date.now();
  const requests24h = Number(summary?.requests24h || 0);
  const rate = Number(summary?.supabaseSourceRate24h || 0);
  const target = Number(summary?.slo?.targetSupabaseRate || SIGNALS_SUPABASE_SLO_TARGET);
  const topFallback = topBreakdownEntry(summary?.fallbackReasonBreakdown24h || {});
  const topProvider = topBreakdownEntry(summary?.providerUsedBreakdown24h || {});
  signalsSupabaseSloState.lastRate = Number.isFinite(rate) ? rate : 0;
  signalsSupabaseSloState.lastRequests24h = requests24h;
  signalsSupabaseSloState.lastTopFallbackReason = topFallback ? `${topFallback[0]}:${topFallback[1]}` : null;
  signalsSupabaseSloState.lastTopProviderUsed = topProvider ? `${topProvider[0]}:${topProvider[1]}` : null;

  const enoughVolume = requests24h >= SIGNALS_SUPABASE_SLO_ALERT_MIN_REQUESTS_24H;
  const breach = enoughVolume && rate < target;
  if (breach) {
    if (!signalsSupabaseSloState.activeSinceMs) {
      signalsSupabaseSloState.activeSinceMs = now;
      console.warn(
        `[OPS_ALERT] signals/latest supabase SLO breach started rate=${rate.toFixed(4)} target=${target.toFixed(4)}`
      );
      return;
    }
    const durationMs = now - signalsSupabaseSloState.activeSinceMs;
    const cooldownOk =
      !signalsSupabaseSloState.lastAlertAtMs ||
      now - signalsSupabaseSloState.lastAlertAtMs >= SIGNALS_SUPABASE_SLO_ALERT_COOLDOWN_MS;
    if (durationMs >= SIGNALS_SUPABASE_SLO_ALERT_AFTER_MS && cooldownOk) {
      signalsSupabaseSloState.lastAlertAtMs = now;
      signalsSupabaseSloState.alertsSent += 1;
      sendSupabaseSloOpsAlert(summary, durationMs);
    }
    return;
  }

  if (signalsSupabaseSloState.activeSinceMs) {
    signalsSupabaseSloState.lastIncidentDurationMs = now - signalsSupabaseSloState.activeSinceMs;
    signalsSupabaseSloState.lastRecoveryAtMs = now;
    signalsSupabaseSloState.activeSinceMs = null;
    console.warn(
      `[OPS_ALERT] signals/latest supabase SLO recovered after ${Math.round(
        signalsSupabaseSloState.lastIncidentDurationMs / 1000
      )}s`
    );
  }
}

function getSignalsSupabaseSloOpsSnapshot() {
  const now = Date.now();
  const activeForMs = signalsSupabaseSloState.activeSinceMs ? now - signalsSupabaseSloState.activeSinceMs : 0;
  return {
    status: signalsSupabaseSloState.activeSinceMs ? "slo_breach_active" : "healthy",
    enabled: SIGNALS_SUPABASE_SLO_ALERT_ENABLED,
    config: {
      targetSupabaseRate: SIGNALS_SUPABASE_SLO_TARGET,
      alertAfterMs: SIGNALS_SUPABASE_SLO_ALERT_AFTER_MS,
      alertCooldownMs: SIGNALS_SUPABASE_SLO_ALERT_COOLDOWN_MS,
      minRequests24h: SIGNALS_SUPABASE_SLO_ALERT_MIN_REQUESTS_24H
    },
    latest: {
      supabaseRate24h: signalsSupabaseSloState.lastRate,
      requests24h: signalsSupabaseSloState.lastRequests24h,
      topFallbackReason: signalsSupabaseSloState.lastTopFallbackReason,
      topProviderUsed: signalsSupabaseSloState.lastTopProviderUsed
    },
    breach: {
      active: Boolean(signalsSupabaseSloState.activeSinceMs),
      activeSince: signalsSupabaseSloState.activeSinceMs
        ? new Date(signalsSupabaseSloState.activeSinceMs).toISOString()
        : null,
      activeForMs,
      lastRecoveryAt: signalsSupabaseSloState.lastRecoveryAtMs
        ? new Date(signalsSupabaseSloState.lastRecoveryAtMs).toISOString()
        : null,
      lastIncidentDurationMs: signalsSupabaseSloState.lastIncidentDurationMs,
      alertsSent: signalsSupabaseSloState.alertsSent,
      lastAlertAt: signalsSupabaseSloState.lastAlertAtMs
        ? new Date(signalsSupabaseSloState.lastAlertAtMs).toISOString()
        : null
    }
  };
}

async function runSignalsSupabaseSloEvaluation() {
  const snapshot = await getDataFreshnessSnapshot();
  const summary = snapshot?.signalsLatest || summarizeFreshness([], "signalsLatest");
  trackSignalsSupabaseSlo(summary);
}

function startSignalsSupabaseSloEvaluationLoop() {
  if (signalsSupabaseSloIntervalRef) return;
  runSignalsSupabaseSloEvaluation().catch(() => {});
  signalsSupabaseSloIntervalRef = setInterval(() => {
    runSignalsSupabaseSloEvaluation().catch(() => {});
  }, SIGNALS_SUPABASE_SLO_EVAL_MS);
  if (signalsSupabaseSloIntervalRef && typeof signalsSupabaseSloIntervalRef.unref === "function") {
    signalsSupabaseSloIntervalRef.unref();
  }
}

function trackLatestSignalsSource(meta = {}) {
  const now = Date.now();
  const source = String(meta?.source || "unknown");
  const count = Number(meta?.count || 0);
  latestSignalsFallbackState.lastSource = source;
  latestSignalsFallbackState.lastCount = count;

  if (source === "degraded_empty") {
    latestSignalsFallbackState.lastStaticSeenMs = now;
    if (!latestSignalsFallbackState.activeSinceMs) {
      latestSignalsFallbackState.activeSinceMs = now;
      console.warn("[OPS_ALERT] signals/latest switched to degraded_empty");
      return;
    }
    const durationMs = now - latestSignalsFallbackState.activeSinceMs;
    const cooldownOk =
      !latestSignalsFallbackState.lastAlertAtMs ||
      now - latestSignalsFallbackState.lastAlertAtMs >= SIGNALS_STATIC_FALLBACK_ALERT_COOLDOWN_MS;
    if (durationMs >= SIGNALS_STATIC_FALLBACK_ALERT_AFTER_MS && cooldownOk) {
      latestSignalsFallbackState.lastAlertAtMs = now;
      latestSignalsFallbackState.alertsSent += 1;
      sendStaticFallbackOpsAlert(durationMs, count);
    }
    return;
  }

  if (latestSignalsFallbackState.activeSinceMs) {
    latestSignalsFallbackState.lastIncidentDurationMs = now - latestSignalsFallbackState.activeSinceMs;
    latestSignalsFallbackState.lastRecoveryAtMs = now;
    latestSignalsFallbackState.activeSinceMs = null;
    console.warn(
      `[OPS_ALERT] signals/latest recovered from degraded_empty after ${Math.round(
        latestSignalsFallbackState.lastIncidentDurationMs / 1000
      )}s`
    );
  }
}

function withLatestSignalsSourceTracking(payload) {
  trackLatestSignalsSource(payload?.meta || {});
  return payload;
}

function getLatestSignalsFallbackOpsSnapshot() {
  const now = Date.now();
  const activeForMs = latestSignalsFallbackState.activeSinceMs ? now - latestSignalsFallbackState.activeSinceMs : 0;
  return {
    status: latestSignalsFallbackState.activeSinceMs ? "degraded_empty_active" : "healthy",
    config: {
      alertAfterMs: SIGNALS_STATIC_FALLBACK_ALERT_AFTER_MS,
      alertCooldownMs: SIGNALS_STATIC_FALLBACK_ALERT_COOLDOWN_MS
    },
    latest: {
      source: latestSignalsFallbackState.lastSource,
      count: latestSignalsFallbackState.lastCount
    },
    staticFallback: {
      active: Boolean(latestSignalsFallbackState.activeSinceMs),
      activeSince: latestSignalsFallbackState.activeSinceMs
        ? new Date(latestSignalsFallbackState.activeSinceMs).toISOString()
        : null,
      activeForMs,
      lastStaticSeenAt: latestSignalsFallbackState.lastStaticSeenMs
        ? new Date(latestSignalsFallbackState.lastStaticSeenMs).toISOString()
        : null,
      lastRecoveryAt: latestSignalsFallbackState.lastRecoveryAtMs
        ? new Date(latestSignalsFallbackState.lastRecoveryAtMs).toISOString()
        : null,
      lastIncidentDurationMs: latestSignalsFallbackState.lastIncidentDurationMs,
      alertsSent: latestSignalsFallbackState.alertsSent,
      lastAlertAt: latestSignalsFallbackState.lastAlertAtMs
        ? new Date(latestSignalsFallbackState.lastAlertAtMs).toISOString()
        : null
    }
  };
}

function redFlagsFromMarket(md, score) {
  const liq = Number(md?.liquidity || 0);
  const out = [];
  if (liq > 0 && liq < 50000) out.push(`Low liquidity: $${Math.round(liq).toLocaleString("en-US")}`);
  else if (liq <= 0) out.push("Liquidity unknown — size smaller");
  if (score < 72) out.push("Sentinel score below conviction band");
  if (Number(md?.priceChange24h || 0) < -12) out.push("24h momentum negative");
  return out.slice(0, 4);
}

function entryWindowFromAge(createdAt) {
  const ageMin = (Date.now() - new Date(createdAt).getTime()) / 60000;
  if (!Number.isFinite(ageMin) || ageMin < 0) {
    return { entryWindow: "OPEN", entryWindowMinutesLeft: 6 };
  }
  if (ageMin <= 6) return { entryWindow: "OPEN", entryWindowMinutesLeft: Math.max(1, Math.round(8 - ageMin)) };
  if (ageMin <= 14) return { entryWindow: "CLOSING", entryWindowMinutesLeft: Math.max(1, Math.round(14 - ageMin)) };
  return { entryWindow: "CLOSED", entryWindowMinutesLeft: 0 };
}

function whyNowLines({ walletCount, entryWindowMinutesLeft, sentinelScore, symbol }) {
  return [
    `${walletCount} high-win wallets entered within a tight window`,
    `Entry window ${entryWindowMinutesLeft ? "open" : "closing"}: ~${Math.max(1, entryWindowMinutesLeft)} min left`,
    `Similar ${symbol || "setup"} structures historically returned +${Math.max(18, Math.round(sentinelScore * 0.72))}% avg (model est.)`
  ];
}

async function fetchWalletRows(supabase, addresses) {
  const uniq = [...new Set((addresses || []).filter(Boolean))].slice(0, 40);
  if (!uniq.length) return [];
  const { data, error } = await supabase.from("smart_wallets").select("*").in("wallet_address", uniq);
  if (error) throw error;
  return data || [];
}

function avgWalletSentinel(wallets) {
  if (!wallets.length) return null;
  const scores = wallets.map((w) => {
    const early = Number(w.early_entry_score);
    const cluster = Number(w.cluster_score);
    const consistency = Number(w.consistency_score);
    if ([early, cluster, consistency].every((n) => Number.isFinite(n))) {
      return (early + cluster + consistency) / 3;
    }
    return computedSmartScore(w);
  });
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.min(100, Math.max(35, Math.round(avg)));
}

/**
 * Latest signals → one card per token (most recent signal per mint).
 */
async function fetchLatestSignalRowsSupabase(supabase, since, limitRows) {
  const { data: rawSignals, error: signalsError } = await supabase
    .from("smart_wallet_signals")
    .select(
      "id, token_address, wallet_address, confidence, created_at, entry_price_usd, price_1h_usd, price_4h_usd, result_pct"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limitRows);
  if (signalsError) throw signalsError;
  if ((rawSignals || []).length > 0) {
    const rows = (rawSignals || []).map((row) => ({ ...row, signal_tags: [] }));
    return {
      rows,
      sourceTable: "smart_wallet_signals"
    };
  }

  const { data: perfRows, error: perfError } = await supabase
    .from("signal_performance")
    .select("id, asset, emitted_at, confidence, entry_price_usd, outcome_pct, signals")
    .gte("emitted_at", since)
    .order("emitted_at", { ascending: false })
    .limit(limitRows);
  if (perfError) throw perfError;

  const synthetic = (perfRows || [])
    .filter((row) => row?.asset)
    .map((row) => ({
      id: row.id,
      token_address: row.asset,
      wallet_address: `perf:${String(row.id || "").slice(0, 8) || "seed"}`,
      confidence: Number(row.confidence || 0),
      created_at: row.emitted_at || new Date().toISOString(),
      entry_price_usd: row.entry_price_usd,
      price_1h_usd: null,
      price_4h_usd: null,
      result_pct: row.outcome_pct,
      signal_tags: Array.isArray(row.signals) ? row.signals.map((s) => String(s)).filter(Boolean).slice(0, 16) : []
    }));
  return {
    rows: synthetic,
    sourceTable: "signal_performance"
  };
}

async function buildLatestSignalsFeed(supabase, { limit = 10, strategy = "balanced" } = {}) {
  const lim = capSignalsLatestLimit(limit);
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { rows: raw, sourceTable } = await fetchLatestSignalRowsSupabase(supabase, since, 400);
  const anomalyAbsPct = Number(process.env.SIGNAL_FEED_EXCLUDE_ABS_OUTCOME_PCT || 0);
  const minLiquidityUsd = Number(process.env.SIGNAL_FEED_MIN_LIQUIDITY_USD || 0);
  const minPairAgeMin = Number(process.env.SIGNAL_FEED_MIN_PAIR_AGE_MINUTES || 0);
  const maxPairAgeDays = Number(process.env.SIGNAL_FEED_MAX_PAIR_AGE_DAYS || 0);
  const weightMap = getActiveSignalWeightMap();

  const seen = new Set();
  const picks = [];
  let excludedAnomalies = 0;
  let excludedLowLiquidity = 0;
  let excludedPairTooYoung = 0;
  let excludedPairTooOld = 0;
  for (const row of raw || []) {
    const pctProbe =
      row.result_pct != null ? Number(row.result_pct) : pctFromPrices(row.entry_price_usd, row.price_1h_usd);
    if (isAnomalousOutcomePct(pctProbe, anomalyAbsPct)) {
      excludedAnomalies += 1;
      continue;
    }
    if (seen.has(row.token_address)) continue;
    seen.add(row.token_address);
    picks.push(row);
    if (picks.length >= lim) break;
  }

  const walletsByToken = new Map();
  for (const row of raw || []) {
    if (!walletsByToken.has(row.token_address)) walletsByToken.set(row.token_address, new Set());
    walletsByToken.get(row.token_address).add(row.wallet_address);
  }

  const out = [];
  for (const row of picks) {
    const mint = row.token_address;
    const walletSet = walletsByToken.get(mint) || new Set();
    const walletList = [...walletSet];
    let md = {};
    try {
      md = (await getMarketData(mint)) || {};
    } catch (_) {
      md = {};
    }
    const liqUsd = Number(md?.liquidity);
    if (
      minLiquidityUsd > 0 &&
      Number.isFinite(liqUsd) &&
      liqUsd > 0 &&
      liqUsd < minLiquidityUsd
    ) {
      excludedLowLiquidity += 1;
      continue;
    }
    const pairGate = gateDexPairAge(md?.pairCreatedAt, minPairAgeMin, maxPairAgeDays);
    if (pairGate.exclude) {
      if (pairGate.reason === "pair_too_young") excludedPairTooYoung += 1;
      else if (pairGate.reason === "pair_too_old") excludedPairTooOld += 1;
      continue;
    }
    const symbol = md.symbol || mint.slice(0, 4).toUpperCase();
    let wallets = [];
    try {
      wallets = await fetchWalletRows(supabase, walletList);
    } catch (_) {
      wallets = [];
    }
    let sentinelScore = avgWalletSentinel(wallets);
    if (sentinelScore == null) {
      sentinelScore = Math.min(100, Math.max(40, Math.round(Number(row.confidence || 70) * 0.92)));
    }
    const baseSentinelScore = sentinelScore;
    const perfW = combinedPerformanceWeight(row.signal_tags, weightMap);
    const recW = recencyMultiplier(row.created_at);
    const stack = clampQualityStack(perfW, recW);
    sentinelScore = Math.round(
      Math.min(100, Math.max(35, baseSentinelScore * stack))
    );
    const decision = decisionFromScore(sentinelScore, strategy);
    const { entryWindow, entryWindowMinutesLeft } = entryWindowFromAge(row.created_at);
    const walletCount = Math.max(walletSet.size, 2);
    const pct =
      row.result_pct != null ? Number(row.result_pct) : pctFromPrices(row.entry_price_usd, row.price_1h_usd);
    const contextHistory =
      pct != null && Number.isFinite(pct)
        ? `Last tracked move on this mint → ${pct >= 0 ? "+" : ""}${Number(pct).toFixed(1)}% (price worker est.)`
        : `Wallet hit rate in window: ${Math.min(walletCount, 6)}/6 last signals clustered`;

    out.push({
      token: symbol.startsWith("$") ? symbol : `$${symbol}`,
      tokenAddress: mint,
      smartWallets: walletCount,
      sentinelScore,
      degraded: !md?.symbol,
      providerUsed: md?._provider || null,
      decision,
      whyNow: whyNowLines({
        walletCount,
        entryWindowMinutesLeft,
        sentinelScore,
        symbol: symbol.startsWith("$") ? symbol : `$${symbol}`
      }),
      redFlags: redFlagsFromMarket(md, sentinelScore),
      entryWindow,
      entryWindowMinutesLeft,
      timeAdvantage: `You are earlier than ${Math.min(97, 52 + Math.round(sentinelScore / 2))}% of traders`,
      signalDecay: recencyDecayLabel(row.created_at, recW),
      poolAgeLabel: poolAgeLabelFromMs(md?.pairCreatedAt) || null,
      confluence: sentinelScore >= 88 && walletCount >= 3,
      evidenceChips: evidenceChipsFor(sentinelScore),
      contextHistory,
      createdAt: row.created_at,
      signalQuality: {
        baseSentinelScore,
        performanceWeight: Math.round(perfW * 10000) / 10000,
        recencyWeight: Math.round(recW * 10000) / 10000,
        stack: Math.round(stack * 10000) / 10000
      }
    });
  }

  out.sort((a, b) => (b.sentinelScore || 0) - (a.sentinelScore || 0));

  return {
    ok: true,
    data: out,
    meta: {
      source: "supabase",
      count: out.length,
      strategy,
      providerUsed: sourceTable,
      signalQuality: {
        excludedAnomalies,
        excludedLowLiquidity,
        excludedPairTooYoung,
        excludedPairTooOld,
        anomalyAbsThreshold: anomalyAbsPct > 0 ? anomalyAbsPct : null,
        minLiquidityUsd: minLiquidityUsd > 0 ? minLiquidityUsd : null,
        minPairAgeMinutes: minPairAgeMin > 0 ? minPairAgeMin : null,
        maxPairAgeDays: maxPairAgeDays > 0 ? maxPairAgeDays : null
      }
    }
  };
}

async function buildLatestSignalsFallback({ limit = 10 } = {}) {
  const lim = capSignalsLatestLimit(limit);
  return {
    ok: true,
    data: [],
    meta: {
      source: "degraded_empty",
      count: 0,
      providerUsed: "none",
      attempts: 1,
      circuitState: null,
      fallbackReason: "no_real_signal_data",
      endpoint: "signals/latest",
      limit: lim
    }
  };
}

/**
 * Proof of edge — only rows with non-null result_pct (worker-filled).
 */
async function buildOutcomesProof(supabase, { hours = 168, recentN = 10 } = {}) {
  const windowH = Math.min(168, Math.max(24, Number(hours) || 168));
  const since = new Date(Date.now() - windowH * 3600 * 1000).toISOString();
  const { data: raw, error } = await supabase
    .from("smart_wallet_signals")
    .select("token_address, result_pct, created_at, entry_price_usd, price_1h_usd")
    .not("result_pct", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(250);
  if (error) throw error;

  const rows = (raw || [])
    .map((r) => ({
      tokenMint: r.token_address,
      resultPct: Number(r.result_pct),
      createdAt: r.created_at
    }))
    .filter((r) => Number.isFinite(r.resultPct));

  const wins = rows.filter((r) => r.resultPct > 0);
  const losses = rows.filter((r) => r.resultPct < 0);
  const winPcts = wins.map((r) => r.resultPct);
  const lossPcts = losses.map((r) => r.resultPct);
  const avgWin = winPcts.length ? winPcts.reduce((a, b) => a + b, 0) / winPcts.length : null;
  const avgLoss = lossPcts.length ? lossPcts.reduce((a, b) => a + b, 0) / lossPcts.length : null;
  const netReturn =
    winPcts.length || lossPcts.length
      ? winPcts.reduce((a, b) => a + b, 0) + lossPcts.reduce((a, b) => a + b, 0)
      : null;

  const recentSlice = rows.slice(0, Math.min(25, Math.max(1, Number(recentN) || 10)));
  const mints = [...new Set(recentSlice.map((r) => r.tokenMint))];
  const symByMint = new Map();
  for (const m of mints) {
    try {
      const md = await getMarketData(m);
      symByMint.set(m, md?.symbol || m.slice(0, 4).toUpperCase());
    } catch (_) {
      symByMint.set(m, m.slice(0, 4).toUpperCase());
    }
  }

  const recentOutcomes = recentSlice.map((r) => ({
    token: symByMint.get(r.tokenMint) || "TOKEN",
    resultPct: Math.round(r.resultPct * 10) / 10,
    hoursLater: Math.abs(r.resultPct) >= 20 ? 4 : 2
  }));

  const bestRecent =
    wins.length > 0
      ? [...wins].sort((a, b) => b.resultPct - a.resultPct)[0]
      : null;

  const flat = {
    ok: true,
    wins: wins.length,
    losses: losses.length,
    avgWin: avgWin != null ? Math.round(avgWin * 10) / 10 : null,
    avgLoss: avgLoss != null ? Math.round(avgLoss * 10) / 10 : null,
    netReturn: netReturn != null ? Math.round(netReturn * 10) / 10 : null,
    recentOutcomes,
    summary: {
      windowHours: windowH,
      resolved: wins.length + losses.length,
      wins: wins.length,
      losses: losses.length,
      pending: 0,
      avgWinPct: avgWin != null ? Math.round(avgWin * 10) / 10 : null,
      avgLossPct: avgLoss != null ? Math.round(avgLoss * 10) / 10 : null,
      netReturnPct: netReturn != null ? Math.round(netReturn * 10) / 10 : null
    },
    bestRecent: bestRecent
      ? {
          token: bestRecent.tokenMint,
          outcomePct: Math.round(bestRecent.resultPct * 10) / 10,
          signalAt: bestRecent.createdAt,
          confidence: null
        }
      : null,
    recent: rows.slice(0, 20).map((r) => ({
      token: r.tokenMint,
      resultPct: r.resultPct,
      signalAt: r.createdAt,
      status: r.resultPct > 0 ? "WIN" : "LOSS"
    })),
    meta: { source: "supabase", filter: "result_pct_not_null" }
  };
  return flat;
}

const SMART_WALLETS_TOP_SIGNAL_MIN = Math.min(100, Math.max(1, Number(process.env.SMART_WALLETS_TOP_SIGNAL_MIN || 2)));
const SIGNAL_AGG_LOOKBACK_LIMIT = 8000;

/**
 * Ranks wallets from recent resolved `smart_wallet_signals` when `smart_wallets` has no rows
 * (common before the cron has populated the leaderboard table).
 */
async function buildSmartWalletsTopFromSignals(supabase, { limit }) {
  const { data, error } = await supabase
    .from("smart_wallet_signals")
    .select("wallet_address, result_pct, created_at")
    .not("result_pct", "is", null)
    .not("wallet_address", "is", null)
    .order("created_at", { ascending: false })
    .limit(SIGNAL_AGG_LOOKBACK_LIMIT);
  if (error) {
    console.warn("[homeTerminalApi] buildSmartWalletsTopFromSignals query failed", error.message);
    return [];
  }
  const by = new Map();
  for (const s of data || []) {
    const addr = String(s.wallet_address || "").trim();
    if (addr.length < 32) continue;
    const p = Number(s.result_pct);
    if (!Number.isFinite(p)) continue;
    if (!by.has(addr)) {
      by.set(addr, { wins: 0, total: 0, sum: 0, best: p, lastAt: s.created_at || null });
    }
    const u = by.get(addr);
    u.total += 1;
    u.sum += p;
    if (p > 0) u.wins += 1;
    if (p > u.best) u.best = p;
  }
  const out = [];
  for (const [addr, u] of by) {
    if (u.total < SMART_WALLETS_TOP_SIGNAL_MIN) continue;
    const wr = (u.wins / u.total) * 100;
    const early = Math.round(Math.min(99, Math.max(40, wr * 0.92)));
    const clusterV = Math.round(Math.min(99, Math.max(40, wr * 0.88)));
    const consistencyV = Math.round(Math.min(99, Math.max(40, wr * 0.95)));
    const smartScore = Math.min(100, Math.max(35, Math.round(
      wr * 0.4 + early * 0.3 + clusterV * 0.2 + consistencyV * 0.1
    )));
    const pnl30d = Math.round(Math.max(0, u.sum) * 12 + u.wins * 180);
    const lastBigWin = `${u.total} resolved · best ${u.best > 0 ? u.best.toFixed(1) : "—"}% · WR ${wr.toFixed(1)}%`;
    out.push({
      wallet: addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr,
      walletAddress: addr,
      address: addr,
      walletLabel: walletTierLabel(wr),
      winRate: Math.round(wr * 10) / 10,
      earlyEntry: early,
      cluster: clusterV,
      consistency: consistencyV,
      decision: walletDecisionFromSmartScore(smartScore),
      pnl30d,
      lastBigWin,
      smartScore,
      signalStrength: smartScore,
      recentHits: u.total,
      tooltip: lastBigWin,
      lastSeen: u.lastAt
    });
  }
  out.sort((a, b) => b.smartScore - a.smartScore || b.recentHits - a.recentHits);
  return out.slice(0, limit);
}

async function buildSmartWalletsTop(supabase, { limit = 20 } = {}) {
  const lim = Math.min(50, Math.max(1, Number(limit) || 20));
  const { data, error } = await supabase
    .from("smart_wallets")
    .select("*")
    .order("win_rate", { ascending: false })
    .limit(200);
  if (!error && (data || []).length) {
    const rows = (data || [])
      .map((r) => {
        const smartScore = computedSmartScore(r);
        const wr = Number(r.win_rate || 0);
        const addr = String(r.wallet_address || "");
        const early = Number.isFinite(Number(r.early_entry_score)) ? Math.round(Number(r.early_entry_score)) : Math.round(wr * 0.92);
        const cluster = Number.isFinite(Number(r.cluster_score)) ? Math.round(Number(r.cluster_score)) : Math.round(wr * 0.88);
        const consistency = Number.isFinite(Number(r.consistency_score))
          ? Math.round(Number(r.consistency_score))
          : Math.round(wr * 0.95);
        const lastBigWin = `Win rate leader · ${wr.toFixed(1)}% tracked`;
        return {
          wallet: addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr,
          walletAddress: addr,
          address: addr,
          walletLabel: walletTierLabel(wr),
          winRate: Math.round(wr * 10) / 10,
          earlyEntry: Math.min(99, Math.max(40, early)),
          cluster: Math.min(99, Math.max(40, cluster)),
          consistency: Math.min(99, Math.max(40, consistency)),
          decision: walletDecisionFromSmartScore(smartScore),
          pnl30d: Math.round(Number(r.pnl_30d || 0) * 100) / 100,
          lastBigWin,
          smartScore,
          signalStrength: smartScore,
          recentHits: Number(r.recent_hits || 0),
          tooltip: lastBigWin,
          lastSeen: r.last_seen || null
        };
      })
      .sort((a, b) => b.smartScore - a.smartScore)
      .slice(0, lim);
    return { ok: true, data: rows, rows, meta: { source: "supabase:smart_wallets", count: rows.length } };
  }

  if (error) {
    console.warn("[homeTerminalApi] buildSmartWalletsTop smart_wallets", error.message, "→ signal aggregates");
  }
  const fromSignals = await buildSmartWalletsTopFromSignals(supabase, { limit: lim });
  if (fromSignals.length) {
    return {
      ok: true,
      data: fromSignals,
      rows: fromSignals,
      meta: { source: "supabase:signal_aggregates", count: fromSignals.length }
    };
  }
  if (error) {
    throw error;
  }
  return { ok: true, data: [], rows: [], meta: { source: "empty", count: 0 } };
}

function computeHotSentinel(token) {
  const liq = Number(token?.liquidity || 0);
  const vol = Number(token?.volume24h || 0);
  const chg = Math.max(0, Number(token?.change || 0));
  const base = Math.min(100, liq / 8000 + vol / 25000 + chg * 1.8);
  return Math.max(35, Math.round(base));
}

async function buildHotTokens({ limit = 10, supabase = null } = {}) {
  const lim = Math.min(24, Math.max(1, Number(limit) || 10));
  let payload;
  try {
    payload = await fetchTrendingList(lim);
  } catch (error) {
    return emergencyHotPayload(lim, String(error?.message || "fetch_trending_failed"));
  }
  const list = Array.isArray(payload?.data) ? payload.data : [];
  if (!list.length) return emergencyHotPayload(lim, "upstream_empty");
  const iaByMint = new Map();
  if (supabase && list.length) {
    try {
      const mints = [...new Set(list.map((t) => t.mint).filter(Boolean))].slice(0, 24);
      if (mints.length) {
        const { data: analyzed, error } = await supabase
          .from("tokens_analyzed")
          .select("token_address, ia_score")
          .in("token_address", mints);
        if (!error && analyzed?.length) {
          analyzed.forEach((r) => {
            const v = Number(r.ia_score);
            if (Number.isFinite(v)) iaByMint.set(r.token_address, v);
          });
        }
      }
    } catch (_) {
      /* tokens_analyzed optional */
    }
  }
  const data = list.map((t) => {
    const mint = t.mint;
    const flowScore = computeHotSentinel(t);
    const ia = iaByMint.get(mint);
    const sentinelScore =
      ia != null && Number.isFinite(ia) ? Math.min(100, Math.max(flowScore, Math.round(ia))) : flowScore;
    const decision = decisionFromScore(sentinelScore, "balanced");
    const { entryWindow, entryWindowMinutesLeft } = { entryWindow: "OPEN", entryWindowMinutesLeft: 5 };
    return {
      ...t,
      token: t.symbol || "TOKEN",
      tokenAddress: mint,
      sentinelScore,
      decision,
      entryWindow,
      entryWindowMinutesLeft,
      clusterHeat: clusterHeatFromScore(sentinelScore),
      evidenceChips: evidenceChipsFor(sentinelScore).map((s) => s.split(" ")[0]),
      quickBuy: {
        "0.5Sol": jupiterSwapUrl(mint, 0.5),
        "1Sol": jupiterSwapUrl(mint, 1),
        "5Sol": jupiterSwapUrl(mint, 5)
      },
      iaScore: ia != null ? Math.round(ia) : null,
      narrativeTags: detectNarrativeTags({ name: t.name, symbol: t.symbol }),
      degraded: Boolean(t?.degraded)
    };
  });
  data.sort((a, b) => (b.sentinelScore || 0) - (a.sentinelScore || 0));
  return {
    ok: true,
    data,
    meta: {
      ...(payload.meta || {}),
      endpoint: "tokens/hot",
      count: data.length,
      tokensAnalyzedMerged: iaByMint.size > 0,
      degraded: Boolean(payload?.meta?.source !== "dexscreener"),
      providerUsed: payload?.meta?.providerUsed || payload?.meta?.source || "unknown",
      attempts: Number(payload?.meta?.attempts || 1),
      circuitState: payload?.meta?.circuitState || null,
      upstreamStatus: upstreamStatusSnapshot(),
      realDataRatio: computeRealDataRatio(String(payload?.meta?.source || "unknown"), data.length, lim)
    }
  };
}

async function getLatestSignalsFeedCached(supabase, limit, strategy) {
  if (!supabase) {
    throw new Error("supabase_unconfigured");
  }
  const key = `terminal:signals:latest:v6:${limit}:${strategy}`;
  let payload;
  let cache;
  try {
    const out = await withCache(
      key,
      () => buildLatestSignalsFeed(supabase, { limit, strategy }),
      LATEST_SIGNALS_CACHE_TTL_SEC
    );
    payload = out.payload;
    cache = out.cache;
  } catch (error) {
    throw new Error(error?.message || "supabase_query_failed");
  }
  const hasRows = Array.isArray(payload?.data) && payload.data.length > 0;
  const out = withLatestSignalsSourceTracking(
    enrichSignalsMeta(
      {
        ...(hasRows
          ? payload
          : {
              ok: true,
              data: [],
              meta: {
                source: "supabase",
                count: 0,
                strategy,
                providerUsed: "supabase"
              }
            }),
        meta: { ...((hasRows ? payload.meta : { source: "supabase", count: 0, strategy, providerUsed: "supabase" }) || {}), cache }
      },
      { limit, fallbackReason: null }
    )
  );
  recordFreshness("signalsLatest", out?.meta || {});
  return out;
}

async function getOutcomesProofCached(supabase, hours, recentN) {
  if (!supabase) {
    throw new Error("supabase_unconfigured");
  }
  const key = `terminal:signals:outcomes:v2:${hours}:${recentN}`;
  const { payload, cache } = await withCache(key, () => buildOutcomesProof(supabase, { hours, recentN }));
  return { ...payload, meta: { ...(payload.meta || {}), cache } };
}

async function getSmartWalletsTopCached(supabase, limit) {
  if (!supabase) throw new Error("supabase_unconfigured");
  const key = `terminal:smartwallets:top:v3:${limit}`;
  const { payload, cache } = await withCache(key, () => buildSmartWalletsTop(supabase, { limit }));
  return { ...payload, meta: { ...(payload.meta || {}), cache } };
}

async function getHotTokensCached(limit, supabase) {
  const key = `terminal:tokens:hot:v3:${limit}`;
  const { payload, cache } = await withCache(key, () => buildHotTokens({ limit, supabase }), HOT_CACHE_TTL_SEC);
  const out = { ...payload, meta: { ...(payload.meta || {}), cache } };
  recordFreshness("tokensHot", out?.meta || {});
  return out;
}

startSignalsSupabaseSloEvaluationLoop();

module.exports = {
  CACHE_TTL_SEC,
  SIGNAL_FEED_MAX_CARDS,
  capSignalsLatestLimit,
  buildLatestSignalsFeed,
  buildOutcomesProof,
  buildSmartWalletsTop,
  buildHotTokens,
  getLatestSignalsFeedCached,
  getOutcomesProofCached,
  getSmartWalletsTopCached,
  getHotTokensCached,
  getLatestSignalsFallbackOpsSnapshot,
  getSignalsSupabaseSloOpsSnapshot,
  getDataFreshnessSnapshot,
  jupiterSwapUrl,
  decisionFromScore
};
