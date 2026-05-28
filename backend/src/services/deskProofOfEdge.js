"use strict";

const { asRuleId } = require("../workers/validationOracle");

const MIN_SAMPLE = Math.min(500, Math.max(12, Number(process.env.DESK_POE_MIN_SAMPLE || 24)));
const CONF_BAND = Math.min(40, Math.max(4, Number(process.env.DESK_POE_CONF_BAND || 12)));
const LOOKBACK_DAYS = Math.min(180, Math.max(30, Number(process.env.DESK_POE_LOOKBACK_DAYS || 90)));
const RULE_LOOKBACK_DAYS = Math.min(90, Math.max(7, Number(process.env.DESK_POE_RULE_LOOKBACK_DAYS || 30)));
const MAX_ROWS = Math.min(2500, Math.max(200, Number(process.env.DESK_POE_MAX_ROWS || 1500)));
const WIN_OUTCOME_PCT = Math.max(0, Number(process.env.DESK_POE_WIN_OUTCOME_PCT ?? 1));

const RULE_TO_SIGNALS = {
  R01: ["whale_accumulation"],
  R02: ["liquidity_shock"],
  R03: ["cluster_buy", "cluster_probing"],
  R04: ["new_wallet_confidence"],
  R05: ["velocity_spike"]
};

function num(v, fb = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function hitRate(arr, threshold) {
  if (!arr.length) return null;
  return arr.filter((x) => x >= threshold).length / arr.length;
}

function winsorizePct(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return null;
  return Math.min(200, Math.max(-200, n));
}

/** Map archive resolve horizon (minutes) to display buckets (+5m / +30m / +2h intent). */
function horizonBucket(h) {
  if (h >= 3 && h <= 18) return "m5";
  if (h >= 19 && h <= 55) return "m30";
  if (h >= 85 && h <= 240) return "m2h";
  return null;
}

function signalTagsForRule(ruleParam) {
  const raw = String(ruleParam || "").trim();
  if (!raw) return [];
  const upper = raw.toUpperCase();
  if (RULE_TO_SIGNALS[upper]) return RULE_TO_SIGNALS[upper];
  const fromTag = asRuleId(raw);
  if (fromTag && RULE_TO_SIGNALS[fromTag]) return RULE_TO_SIGNALS[fromTag];
  return [raw];
}

function normalizeRuleApplied(ruleParam) {
  const raw = String(ruleParam || "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (/^R0[1-5]$/.test(upper)) return upper;
  const rid = asRuleId(raw);
  return rid || upper.slice(0, 16);
}

function rowHasRuleTag(signals, tags) {
  const set = new Set((Array.isArray(signals) ? signals : []).map((s) => String(s).trim()).filter(Boolean));
  return tags.some((t) => set.has(t));
}

function computeRuleCohortStats(rows) {
  const pcts = rows.map((r) => winsorizePct(r.outcomePct)).filter((n) => n != null);
  const n = pcts.length;
  if (!n) return null;
  const wins = pcts.filter((p) => p >= WIN_OUTCOME_PCT);
  const losses = pcts.filter((p) => p < WIN_OUTCOME_PCT);
  const wrPct = Math.round((wins.length / n) * 1000) / 10;
  const avgOutcome = mean(pcts);
  const avgWinner = wins.length ? mean(wins) : null;
  const avgLoser = losses.length ? mean(losses) : null;
  return {
    wrPct,
    avgOutcomePct: avgOutcome != null ? Math.round(avgOutcome * 100) / 100 : null,
    avgWinnerPct: avgWinner != null ? Math.round(avgWinner * 100) / 100 : null,
    avgLoserPct: avgLoser != null ? Math.round(avgLoser * 100) / 100 : null,
    n
  };
}

/**
 * Cohort stats from resolved `signal_performance` for the Intelligence Desk.
 * Rule+regime mode (preferred): filter by emission tag + emission_regime.
 * Legacy mode: confidence band ± CONF_BAND, optional regime if enough sample.
 */
async function buildDeskProofOfEdge(supabase, { mint, confidence, regime, rule } = {}) {
  const ruleParam = String(rule || "").trim();
  const ruleMode = Boolean(ruleParam);
  const lookbackDays = ruleMode ? RULE_LOOKBACK_DAYS : LOOKBACK_DAYS;
  const since = new Date(Date.now() - lookbackDays * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from("signal_performance")
    .select("horizon_min, outcome_pct, confidence, emission_regime, signals, asset")
    .eq("status", "resolved")
    .not("outcome_pct", "is", null)
    .gte("emitted_at", since)
    .order("emitted_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) throw error;

  let rows = (data || [])
    .map((r) => ({
      horizonMin: num(r.horizon_min, 0),
      outcomePct: num(r.outcome_pct),
      conf: r.confidence != null ? num(r.confidence) : null,
      regime: r.emission_regime != null ? String(r.emission_regime).trim().toLowerCase() : null,
      signals: Array.isArray(r.signals) ? r.signals.map((s) => String(s).trim()).filter(Boolean) : [],
      asset: String(r.asset || "")
    }))
    .filter((r) => Number.isFinite(r.outcomePct) && r.horizonMin > 0);

  const mintU = mint ? String(mint).trim() : "";
  if (mintU.length >= 32) {
    rows = rows.filter((r) => r.asset.toUpperCase() !== mintU.toUpperCase());
  }

  const regimeStr = regime ? String(regime).trim().toLowerCase().slice(0, 48) : "";
  let regimeApplied = null;
  let ruleApplied = null;
  let cohortMode = "confidence_band";
  let confidenceBandLegacy = null;

  if (ruleMode) {
    cohortMode = "rule_regime";
    const tags = signalTagsForRule(ruleParam);
    ruleApplied = normalizeRuleApplied(ruleParam);
    if (tags.length) {
      rows = rows.filter((r) => rowHasRuleTag(r.signals, tags));
    }
    if (regimeStr) {
      rows = rows.filter((r) => r.regime === regimeStr);
      regimeApplied = regimeStr;
    }
  } else {
    const c0 = num(confidence, null);
    let bandLow = null;
    let bandHigh = null;
    if (c0 != null) {
      bandLow = Math.max(0, c0 - CONF_BAND);
      bandHigh = Math.min(100, c0 + CONF_BAND);
      rows = rows.filter((r) => r.conf == null || (r.conf >= bandLow && r.conf <= bandHigh));
      confidenceBandLegacy = [Math.round(bandLow), Math.round(bandHigh)];
    }

    if (regimeStr) {
      const withReg = rows.filter((r) => r.regime && r.regime === regimeStr);
      if (withReg.length >= MIN_SAMPLE) {
        rows = withReg;
        regimeApplied = regimeStr;
      }
    }
  }

  const comparableCount = rows.length;
  const allPcts = rows.map((r) => r.outcomePct);
  const medianPct = median(allPcts);
  const ruleStats = ruleMode ? computeRuleCohortStats(rows) : null;

  const byBucket = { m5: [], m30: [], m2h: [] };
  for (const r of rows) {
    const b = horizonBucket(r.horizonMin);
    if (b) byBucket[b].push(r.outcomePct);
  }

  const m5avg = mean(byBucket.m5);
  const m30avg = mean(byBucket.m30);
  const m2havg = mean(byBucket.m2h);
  const hit40 = hitRate(byBucket.m30, 40);
  const hit100 = hitRate(byBucket.m2h, 100);

  const bucketNs = { m5: byBucket.m5.length, m30: byBucket.m30.length, m2h: byBucket.m2h.length };
  const anyBucket = bucketNs.m5 > 0 || bucketNs.m30 > 0 || bucketNs.m2h > 0;
  const sufficient = ruleMode ? comparableCount >= MIN_SAMPLE : comparableCount >= MIN_SAMPLE && anyBucket;

  const parts = [];
  if (ruleMode) {
    parts.push(`rule · ${ruleApplied || ruleParam}`);
    parts.push(regimeApplied ? `market regime · ${regimeApplied}` : "market regime · any");
    parts.push(`lookback · ${lookbackDays}d`);
  } else if (confidenceBandLegacy) {
    parts.push(`score range ${confidenceBandLegacy[0]}–${confidenceBandLegacy[1]}`);
    parts.push("smart wallet count · entry timing");
    parts.push(regimeApplied ? `market regime · ${regimeApplied}` : "market regime · blended");
  } else {
    parts.push("score range · full cohort");
    parts.push("smart wallet count · entry timing");
    parts.push(regimeApplied ? `market regime · ${regimeApplied}` : "market regime · blended");
  }

  return {
    ok: true,
    sufficient,
    cohortMode,
    updatedAt: new Date().toISOString(),
    comparableCount,
    confidenceBand: ruleMode ? null : confidenceBandLegacy,
    regimeApplied,
    ruleApplied,
    ruleStats,
    horizons: {
      m5: { label: "+5m", avgPct: m5avg, n: bucketNs.m5, band: "3–18m archive" },
      m30: { label: "+30m", avgPct: m30avg, n: bucketNs.m30, band: "19–55m" },
      m2h: { label: "+2h", avgPct: m2havg, n: bucketNs.m2h, band: "85–240m" }
    },
    hits: {
      hit40m30Pct: hit40 != null ? Math.round(hit40 * 1000) / 10 : null,
      hit100m2hPct: hit100 != null ? Math.round(hit100 * 1000) / 10 : null
    },
    medianPct: medianPct != null ? Math.round(medianPct * 10) / 10 : null,
    criteriaLine: parts.join(" · "),
    meta: {
      minSample: MIN_SAMPLE,
      lookbackDays,
      source: "signal_performance",
      winOutcomePct: WIN_OUTCOME_PCT
    }
  };
}

module.exports = { buildDeskProofOfEdge };
