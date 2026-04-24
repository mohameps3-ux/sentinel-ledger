"use strict";

const MIN_SAMPLE = Math.min(500, Math.max(12, Number(process.env.DESK_POE_MIN_SAMPLE || 24)));
const CONF_BAND = Math.min(40, Math.max(4, Number(process.env.DESK_POE_CONF_BAND || 12)));
const LOOKBACK_DAYS = Math.min(180, Math.max(30, Number(process.env.DESK_POE_LOOKBACK_DAYS || 90)));
const MAX_ROWS = Math.min(2500, Math.max(200, Number(process.env.DESK_POE_MAX_ROWS || 1500)));

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

/** Map archive resolve horizon (minutes) to display buckets (+5m / +30m / +2h intent). */
function horizonBucket(h) {
  if (h >= 3 && h <= 18) return "m5";
  if (h >= 19 && h <= 55) return "m30";
  if (h >= 85 && h <= 240) return "m2h";
  return null;
}

/**
 * Cohort stats from resolved `signal_performance` for the Intelligence Desk.
 * Excludes the current mint from the cohort to avoid self-reinforcement.
 */
async function buildDeskProofOfEdge(supabase, { mint, confidence, regime } = {}) {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
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
      regime: r.emission_regime != null ? String(r.emission_regime).trim() : null,
      walletTags: Array.isArray(r.signals) ? r.signals.length : 0,
      asset: String(r.asset || "")
    }))
    .filter((r) => Number.isFinite(r.outcomePct) && r.horizonMin > 0);

  const mintU = mint ? String(mint).trim() : "";
  if (mintU.length >= 32) {
    rows = rows.filter((r) => r.asset.toUpperCase() !== mintU.toUpperCase());
  }

  const c0 = num(confidence, null);
  let bandLow = null;
  let bandHigh = null;
  if (c0 != null) {
    bandLow = Math.max(0, c0 - CONF_BAND);
    bandHigh = Math.min(100, c0 + CONF_BAND);
    rows = rows.filter((r) => r.conf == null || (r.conf >= bandLow && r.conf <= bandHigh));
  }

  const regimeStr = regime ? String(regime).trim().slice(0, 48) : "";
  let regimeApplied = null;
  if (regimeStr) {
    const withReg = rows.filter((r) => r.regime && r.regime === regimeStr);
    if (withReg.length >= MIN_SAMPLE) {
      rows = withReg;
      regimeApplied = regimeStr;
    }
  }

  const comparableCount = rows.length;
  const allPcts = rows.map((r) => r.outcomePct);
  const medianPct = median(allPcts);

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
  const sufficient = comparableCount >= MIN_SAMPLE && anyBucket;

  const parts = [];
  if (c0 != null && bandLow != null) {
    parts.push(`score range ${Math.round(bandLow)}–${Math.round(bandHigh)}`);
  } else {
    parts.push("score range · full cohort");
  }
  parts.push("smart wallet count · entry timing");
  parts.push(regimeApplied ? `market regime · ${regimeApplied}` : "market regime · blended");

  return {
    ok: true,
    sufficient,
    updatedAt: new Date().toISOString(),
    comparableCount,
    confidenceBand: c0 != null && bandLow != null ? [Math.round(bandLow), Math.round(bandHigh)] : null,
    regimeApplied,
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
    meta: { minSample: MIN_SAMPLE, lookbackDays: LOOKBACK_DAYS, source: "signal_performance" }
  };
}

module.exports = { buildDeskProofOfEdge };
