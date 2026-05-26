"use strict";

/** Process-local auto-discovery promotion telemetry for /health/ingestion. */

let windowStart = Date.now();
let candidates24h = 0;
let enrichedOk24h = 0;
let promoted24h = 0;
let lastPromotionAt = null;
const rejectionReasons24h = {
  bot_filter: 0,
  status_not_candidate: 0,
  candidate_score: 0,
  closed_trades: 0,
  win_rate_observed: 0,
  weighted_avg_sol_pnl: 0,
  enrichment_empty: 0,
  eligible: 0
};

function roll24hWindow() {
  const now = Date.now();
  if (now - windowStart >= 24 * 60 * 60 * 1000) {
    windowStart = now;
    candidates24h = 0;
    enrichedOk24h = 0;
    promoted24h = 0;
    for (const key of Object.keys(rejectionReasons24h)) {
      rejectionReasons24h[key] = 0;
    }
  }
}

function promotionRejectionGate(row, thresholds = {}) {
  const minScore = Number(thresholds.minScore ?? 0.65);
  const minClosed = Number(thresholds.minClosed ?? 5);
  const minWinRate = Number(thresholds.minWinRate ?? 0.55);
  const minPnl = Number(thresholds.minPnl ?? 0);
  const botTxPerHour = Number(thresholds.botTxPerHour ?? 30);

  if (row?.is_likely_bot) return "bot_filter";
  if (String(row?.status || "candidate") !== "candidate") return "status_not_candidate";
  if (Number(row?.candidate_score || 0) < minScore) return "candidate_score";
  if (Number(row?.closed_trades || 0) < minClosed) return "closed_trades";
  if (Number(row?.win_rate_observed || 0) < minWinRate) return "win_rate_observed";
  if (Number(row?.weighted_avg_sol_pnl || 0) < minPnl) return "weighted_avg_sol_pnl";
  return "eligible";
}

function autoDiscoveryCandidateInc(count = 1) {
  roll24hWindow();
  candidates24h += Math.max(0, Number(count) || 0);
}

function autoDiscoveryEnrichedOkInc(count = 1) {
  roll24hWindow();
  enrichedOk24h += Math.max(0, Number(count) || 0);
}

function autoDiscoveryPromotedInc(count = 1) {
  roll24hWindow();
  const n = Math.max(0, Number(count) || 0);
  promoted24h += n;
  if (n > 0) lastPromotionAt = Date.now();
}

function autoDiscoveryRejectionInc(gate) {
  roll24hWindow();
  const key = gate && rejectionReasons24h[gate] != null ? gate : "candidate_score";
  rejectionReasons24h[key] += 1;
}

function getAutoDiscoveryPromotionTelemetry() {
  roll24hWindow();
  return {
    auto_discovery_24h_candidates: candidates24h,
    auto_discovery_24h_enriched_ok: enrichedOk24h,
    auto_discovery_24h_promoted: promoted24h,
    auto_discovery_last_promotion_at: lastPromotionAt
      ? new Date(lastPromotionAt).toISOString()
      : null,
    auto_discovery_24h_rejection_reasons: { ...rejectionReasons24h }
  };
}

function _resetAutoDiscoveryPromotionTelemetry() {
  windowStart = Date.now();
  candidates24h = 0;
  enrichedOk24h = 0;
  promoted24h = 0;
  lastPromotionAt = null;
  for (const key of Object.keys(rejectionReasons24h)) {
    rejectionReasons24h[key] = 0;
  }
}

module.exports = {
  promotionRejectionGate,
  autoDiscoveryCandidateInc,
  autoDiscoveryEnrichedOkInc,
  autoDiscoveryPromotedInc,
  autoDiscoveryRejectionInc,
  getAutoDiscoveryPromotionTelemetry,
  _resetAutoDiscoveryPromotionTelemetry
};
