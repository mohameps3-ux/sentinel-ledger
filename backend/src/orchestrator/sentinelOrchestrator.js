"use strict";

const { randomUUID } = require("crypto");
const { getSupabase } = require("../lib/supabase");
const { isProbableSolanaPubkey } = require("../lib/solanaAddress");

const POLL_MS = Math.max(10_000, Number(process.env.SENTINEL_ORCHESTRATOR_POLL_MS || 30_000));
const STALE_MS = 120_000;
const DEDUPE_MS = 5 * 60_000;
const RATE_LIMIT_PER_MIN = 10;
const NARRATIVE_TTL_MS = 30_000;
const CONVERGENCE_WINDOW_MIN = 10;

const TEMPLATES = {
  multi_wallet_entry: "{n} high-win wallets entered within {window}min",
  early_pattern: "Smart wallet re-entered — early pattern repeated ({streak} consecutive wins)",
  outlier_catch: "Low Technical Read but smart money accumulating — outlier pattern",
  momentum_warning: "Momentum exhausting — possible overheat ({change}% in {time})",
  entry_window: "Entry window: ~{timeLeft}min left · you are earlier than {percentile}% of traders",
  wallet_streak: "{short_address} buying again — {streak} consecutive wins",
  convergence: "CONVERGENCE: {n} tracked wallets on same token within {window}min",
  anomaly_liquidity: "Liquidity dropped {pct}% in {time}min — exit risk detected",
  grade_alert: "Grade {grade} signal on {symbol} — {confidence}% confidence"
};

const ALLOWED_ORIGINS = new Set(["https://jup.ag", "https://dexscreener.com", "https://solscan.io"]);

const state = {
  started: false,
  io: null,
  timer: null,
  lastSignalSeenAt: new Date(Date.now() - STALE_MS).toISOString(),
  previousScoreByMint: new Map(),
  recentSignalsByMint: new Map(),
  dedupe: new Map(),
  emittedAt: []
};

function nowIso() {
  return new Date().toISOString();
}

function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

function normalizeConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n > 1 ? clamp(n / 100, 0, 1) : clamp(n, 0, 1);
}

function normalizeScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(clamp(n, 0, 100));
}

function eventTimeMs(event) {
  const raw = event?.timestamp || event?.created_at || event?.detectedAt || event?.at;
  const ms = raw ? Date.parse(raw) : Date.now();
  return Number.isFinite(ms) ? ms : Date.now();
}

function isFresh(event) {
  return Date.now() - eventTimeMs(event) <= STALE_MS;
}

function shortAddress(address) {
  const s = String(address || "");
  return s.length > 10 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s || "?";
}

function fillTemplate(key, slots = {}) {
  const tpl = TEMPLATES[key] || "";
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(slots[k] ?? "—"));
}

function sanitizeMint(mint) {
  const m = String(mint || "").trim();
  return isProbableSolanaPubkey(m) ? m : null;
}

function buildJupiterSwapUrl(mint) {
  const m = sanitizeMint(mint);
  return m ? `https://jup.ag/swap/SOL-${encodeURIComponent(m)}` : "#";
}

function buildDexUrl(mint) {
  const m = sanitizeMint(mint);
  return m ? `https://dexscreener.com/solana/${encodeURIComponent(m)}` : "#";
}

function buildSolscanUrl(mint) {
  const m = sanitizeMint(mint);
  return m ? `https://solscan.io/token/${encodeURIComponent(m)}` : "#";
}

function validateCta(cta) {
  if (!cta || !cta.url || cta.url === "#") return null;
  try {
    const url = new URL(cta.url);
    if (!ALLOWED_ORIGINS.has(url.origin)) return null;
    return { url: url.toString(), label: String(cta.label || "Open").slice(0, 32) };
  } catch (_) {
    return null;
  }
}

function cleanupMaps() {
  const cutoff = Date.now() - DEDUPE_MS;
  for (const [key, ts] of state.dedupe.entries()) {
    if (ts < cutoff) state.dedupe.delete(key);
  }
  for (const [mint, rows] of state.recentSignalsByMint.entries()) {
    const next = rows.filter((r) => eventTimeMs(r) >= Date.now() - CONVERGENCE_WINDOW_MIN * 60_000);
    if (next.length) state.recentSignalsByMint.set(mint, next);
    else state.recentSignalsByMint.delete(mint);
  }
}

function rateLimited() {
  const cutoff = Date.now() - 60_000;
  state.emittedAt = state.emittedAt.filter((ts) => ts >= cutoff);
  if (state.emittedAt.length >= RATE_LIMIT_PER_MIN) return true;
  state.emittedAt.push(Date.now());
  return false;
}

function deduped(mint, templateKey) {
  const key = `${mint}:${templateKey}`;
  const last = state.dedupe.get(key);
  if (last && Date.now() - last < DEDUPE_MS) return true;
  state.dedupe.set(key, Date.now());
  return false;
}

function observeSocketEvent(eventName, payload) {
  if (eventName === "sentinel:score") {
    handleObservedEvent(scoreEventFromPayload(payload));
  } else if (eventName === "sentinel:event") {
    handleObservedEvent(rawEventFromPayload(payload));
  } else if (eventName === "convergence" || eventName === "coordination:red-alert") {
    handleObservedEvent(convergenceEventFromPayload(payload));
  }
}

function scoreEventFromPayload(score) {
  if (!score || typeof score !== "object") return null;
  const mint = sanitizeMint(score.asset || score.mint || score.tokenAddress);
  if (!mint) return null;
  const currentScore = normalizeScore(score.confidence ?? score.sentinelScore ?? score.score);
  const previous = state.previousScoreByMint.get(mint);
  state.previousScoreByMint.set(mint, currentScore);
  const delta = previous != null && currentScore != null ? currentScore - previous : 0;
  const signals = Array.isArray(score.signals) ? score.signals.length : 0;
  return {
    source: "score",
    mint,
    timestamp: score.timestamp || nowIso(),
    confidence: normalizeConfidence(score.confidence),
    score: currentScore,
    scoreDelta: delta,
    signals,
    action: score.suggestedAction || score.action || score.decision || score.meta?.executionAction || "WATCH",
    entryWindowOpen: score.meta?.entryWindow === "OPEN" || score.entryWindow === "OPEN",
    symbol: score.symbol || score.meta?.symbol || "TOKEN",
    grade: score.grade || score.meta?.grade || null,
    priceChange24h: score.meta?.priceChange24h ?? score.priceChange24h ?? null
  };
}

function rawEventFromPayload(event) {
  const mint = sanitizeMint(event?.data?.asset || event?.asset || event?.mint);
  if (!mint) return null;
  return {
    source: "socket_event",
    mint,
    timestamp: event.timestamp || nowIso(),
    confidence: normalizeConfidence(event?.metadata?.confidence ?? 0.35),
    score: normalizeScore(event?.metadata?.score),
    wallet: event?.data?.actor || null,
    signals: Array.isArray(event?.metadata?.labels) ? event.metadata.labels.length : 1,
    action: "WATCH"
  };
}

function convergenceEventFromPayload(event) {
  const mint = sanitizeMint(event?.tokenAddress || event?.mint);
  if (!mint) return null;
  const wallets = Array.isArray(event?.wallets) ? event.wallets : [];
  return {
    source: "convergence",
    mint,
    timestamp: event.detectedAt || nowIso(),
    confidence: normalizeConfidence(event?.score ?? 0.75),
    score: normalizeScore(event?.score ?? 75),
    walletCount: wallets.length,
    highWinWalletCount: wallets.length,
    action: "ACCUMULATE",
    templateHint: "convergence",
    windowMinutes: Number(event.windowMinutes || CONVERGENCE_WINDOW_MIN)
  };
}

function recordSignalRow(row) {
  const mint = sanitizeMint(row?.token_address);
  if (!mint) return null;
  const enriched = {
    source: "smart_wallet_signals",
    mint,
    timestamp: row.created_at || nowIso(),
    confidence: normalizeConfidence(row.confidence || 0.45),
    score: normalizeScore(row.confidence || 45),
    wallet: row.wallet_address,
    signals: 1,
    action: row.last_action === "sell" ? "TOO LATE" : "WATCH",
    resultPct: row.result_pct != null ? Number(row.result_pct) : null
  };
  const rows = state.recentSignalsByMint.get(mint) || [];
  rows.push(enriched);
  state.recentSignalsByMint.set(mint, rows.slice(-50));
  return enriched;
}

function aggregateForMint(mint) {
  const rows = (state.recentSignalsByMint.get(mint) || []).filter(
    (r) => Date.now() - eventTimeMs(r) <= CONVERGENCE_WINDOW_MIN * 60_000
  );
  const wallets = new Set(rows.map((r) => r.wallet).filter(Boolean));
  const highWin = new Set(rows.filter((r) => normalizeConfidence(r.confidence) >= 0.55).map((r) => r.wallet).filter(Boolean));
  const byWalletToken = new Map();
  for (const row of rows) {
    if (!row.wallet || row.action === "TOO LATE") continue;
    byWalletToken.set(row.wallet, (byWalletToken.get(row.wallet) || 0) + 1);
  }
  const repeatedWallet = [...byWalletToken.entries()].find(([, count]) => count >= 3);
  return {
    rows,
    walletCount: wallets.size,
    highWinWalletCount: highWin.size,
    repeatedWallet: repeatedWallet ? { wallet: repeatedWallet[0], count: repeatedWallet[1] } : null
  };
}

function classify(event) {
  const agg = aggregateForMint(event.mint);
  const score = Number(event.score || 0);
  const signalCount = Number(event.signals || 0);
  const walletCount = Math.max(Number(event.walletCount || 0), agg.walletCount);
  const highWinWalletCount = Math.max(Number(event.highWinWalletCount || 0), agg.highWinWalletCount);

  if (agg.repeatedWallet || event.liquidityDropPct >= 30) return "ANOMALY";
  if (score >= 65 && highWinWalletCount >= 3 && isFresh(event)) return "URGENT";
  if ((score >= 40 && score <= 65) || walletCount >= 2 || event.entryWindowOpen) return "TACTICAL";
  if (Math.abs(Number(event.scoreDelta || 0)) < 5 || signalCount <= 1) return "INFO";
  return "TACTICAL";
}

function chooseTemplate(event, severity) {
  const agg = aggregateForMint(event.mint);
  if (severity === "ANOMALY" && agg.repeatedWallet) {
    return {
      key: "wallet_streak",
      slots: { short_address: shortAddress(agg.repeatedWallet.wallet), streak: agg.repeatedWallet.count }
    };
  }
  if (severity === "ANOMALY" && event.liquidityDropPct) {
    return { key: "anomaly_liquidity", slots: { pct: Math.round(event.liquidityDropPct), time: "10" } };
  }
  if (event.templateHint === "convergence" || agg.walletCount >= 2) {
    return { key: "convergence", slots: { n: Math.max(event.walletCount || 0, agg.walletCount), window: CONVERGENCE_WINDOW_MIN } };
  }
  if (event.entryWindowOpen) {
    return { key: "entry_window", slots: { timeLeft: event.timeLeft || "5", percentile: event.percentile || "80" } };
  }
  if (event.grade) {
    return {
      key: "grade_alert",
      slots: { grade: event.grade, symbol: event.symbol || "TOKEN", confidence: Math.round(normalizeConfidence(event.confidence) * 100) }
    };
  }
  if (Number(event.priceChange24h) >= 25) {
    return { key: "momentum_warning", slots: { change: Math.round(Number(event.priceChange24h)), time: "24h" } };
  }
  if (severity === "TACTICAL" && agg.highWinWalletCount > 0) {
    return { key: "multi_wallet_entry", slots: { n: agg.highWinWalletCount, window: CONVERGENCE_WINDOW_MIN } };
  }
  return { key: "outlier_catch", slots: {} };
}

function planCta(event, severity) {
  const action = String(event.action || "WATCH").toUpperCase();
  if (action === "TOO LATE" || action === "TOO_LATE" || action === "STAY OUT") return null;
  if (severity === "URGENT" && (action === "ACCUMULATE" || action === "BUY" || action === "ENTER NOW")) {
    return validateCta({ url: buildJupiterSwapUrl(event.mint), label: "Trade on Jupiter" });
  }
  if (severity === "ANOMALY") {
    return validateCta({ url: buildSolscanUrl(event.mint), label: "Inspect on Solscan" });
  }
  if (severity === "TACTICAL" || action === "WATCH") {
    return validateCta({ url: buildDexUrl(event.mint), label: "Open chart" });
  }
  return null;
}

function handleObservedEvent(event) {
  if (!state.io || !event?.mint) return false;
  cleanupMaps();
  if (!isFresh(event)) return false;
  if (normalizeConfidence(event.confidence) < 0.25) return false;

  const severity = classify(event);
  const { key, slots } = chooseTemplate(event, severity);
  if (deduped(event.mint, key)) return false;
  if (rateLimited()) return false;

  const cta = planCta(event, severity);
  const payload = {
    id: randomUUID(),
    mint: event.mint,
    severity,
    message: fillTemplate(key, slots),
    cta,
    timestamp: nowIso(),
    expiresAt: new Date(Date.now() + NARRATIVE_TTL_MS).toISOString()
  };
  state.io.emit("sentinel:narrative", payload);
  return true;
}

async function pollSmartWalletSignals() {
  const supabase = getSupabase();
  let query = supabase
    .from("smart_wallet_signals")
    .select("id, token_address, wallet_address, last_action, confidence, result_pct, created_at")
    .gt("created_at", state.lastSignalSeenAt)
    .order("created_at", { ascending: false })
    .limit(80);
  const { data, error } = await query;
  if (error) {
    console.warn("[sentinel-orchestrator] smart_wallet_signals poll:", error.message);
    return;
  }
  const rows = (data || []).reverse();
  if (!rows.length) return;
  state.lastSignalSeenAt = rows[rows.length - 1]?.created_at || state.lastSignalSeenAt;
  for (const row of rows) {
    const event = recordSignalRow(row);
    handleObservedEvent(event);
  }
}

function patchSocketObserver(io) {
  if (io.__sentinelOrchestratorPatched) return;
  const originalEmit = io.emit.bind(io);
  io.emit = function patchedIoEmit(eventName, ...args) {
    observeSocketEvent(eventName, args[0]);
    return originalEmit(eventName, ...args);
  };
  const originalTo = io.to.bind(io);
  io.to = function patchedIoTo(...rooms) {
    const operator = originalTo(...rooms);
    if (!operator || operator.__sentinelOrchestratorPatched) return operator;
    const opEmit = operator.emit.bind(operator);
    operator.emit = function patchedOperatorEmit(eventName, ...args) {
      observeSocketEvent(eventName, args[0]);
      return opEmit(eventName, ...args);
    };
    operator.__sentinelOrchestratorPatched = true;
    return operator;
  };
  io.__sentinelOrchestratorPatched = true;
}

function start(io) {
  if (state.started) return { ok: true, alreadyStarted: true };
  if (!io) return { ok: false, reason: "missing_io" };
  state.started = true;
  state.io = io;
  patchSocketObserver(io);
  state.timer = setInterval(() => {
    pollSmartWalletSignals().catch((error) => {
      console.warn("[sentinel-orchestrator] poll failed:", error?.message || error);
    });
  }, POLL_MS);
  state.timer.unref?.();
  pollSmartWalletSignals().catch(() => {});
  console.log(`[sentinel-orchestrator] started pollMs=${POLL_MS}`);
  return { ok: true };
}

function stop() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  state.started = false;
}

module.exports = {
  start,
  stop,
  _internal: {
    classify,
    chooseTemplate,
    fillTemplate,
    normalizeConfidence,
    planCta,
    validateCta
  }
};
