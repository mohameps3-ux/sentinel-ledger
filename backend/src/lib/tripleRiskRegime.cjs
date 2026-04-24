/**
 * Sentinel triple-risk engine (v1) — **server-side mirror** of
 * `frontend/src/lib/tripleRiskRegime.js` for future push alerts / shared truth.
 * When changing rules, update both files in the same commit.
 */
const { pairCreatedRawToUnixMs, poolAgeMinutesFromCreatedMs } = require("./pairTime");

const TRIPLE_RISK_ENGINE_VERSION = 1;
const POOL_AGE_FLOOR = 5;
const LIQ_SMALL_USD = 20_000;
const VOL_LIQ_INFER_RATIO = 5;
const NO_POOL_AGE_MAX_EXECUTION = 80;

function n$(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function nPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return v;
}

function normalizeRegimeInput(tokenData, score) {
  const t = tokenData && typeof tokenData === "object" ? tokenData : null;
  const m = t?.market && typeof t.market === "object" ? t.market : null;
  const h = t?.holders && typeof t.holders === "object" ? t.holders : null;

  const liquidityRaw =
    m?.liquidityUsd != null
      ? m.liquidityUsd
      : m?.liquidity != null
        ? m.liquidity
        : m?.liquidityUSD != null
          ? m.liquidityUSD
          : 0;
  const liquidityUSD = n$(liquidityRaw);

  const volRaw =
    m?.volume24hUsd != null
      ? m.volume24hUsd
      : m?.volume24h != null
        ? m.volume24h
        : m?.volume24H != null
          ? m.volume24H
          : 0;
  const volume24h = n$(volRaw);

  const chg24 = nPct(m?.priceChange24h);
  const priceChangePumped = Number.isFinite(chg24) && chg24 > 0 ? chg24 : 0;
  const top10HolderPct = h?.top10Percentage != null ? nPct(h.top10Percentage) : 0;
  const missing = [];

  const pairRaw = m?.pairCreatedAt ?? m?.pairCreated;
  let poolAgeMin = 60;
  let poolAgeInferred = false;

  if (pairRaw != null) {
    const tsMs = pairCreatedRawToUnixMs(pairRaw);
    if (tsMs != null) {
      poolAgeMin = poolAgeMinutesFromCreatedMs(tsMs, Date.now());
    } else {
      missing.push("poolAge");
    }
  } else if (liquidityUSD < LIQ_SMALL_USD && volume24h > VOL_LIQ_INFER_RATIO * Math.max(liquidityUSD, 0) && volume24h > 0) {
    poolAgeMin = POOL_AGE_FLOOR;
    poolAgeInferred = true;
  } else {
    missing.push("poolAge");
  }

  const cRaw = score != null && Number.isFinite(Number(score?.confidence)) ? Math.round(Number(score.confidence)) : null;

  return {
    signalScore: cRaw,
    liquidityUSD,
    top10HolderPct,
    priceChangePct: priceChangePumped,
    priceChange24hRaw: chg24,
    poolAgeMinutes: poolAgeMin,
    poolAgeInferred,
    missing,
    engine: TRIPLE_RISK_ENGINE_VERSION
  };
}

function capExecutionForMissingPoolAge(score, input) {
  if (!Array.isArray(input?.missing) || !input.missing.includes("poolAge")) {
    return score;
  }
  return Math.min(score, NO_POOL_AGE_MAX_EXECUTION);
}

function calculateExecutionScore(liquidityUSD, top10Pct, poolAgeMin) {
  let score = 100;
  if (liquidityUSD < 100000) {
    score -= Math.pow((100000 - liquidityUSD) / 1000, 0.6);
  }
  if (top10Pct > 40) {
    score -= (top10Pct - 40) * 1.2;
  }
  if (poolAgeMin < 60) {
    score -= (60 - poolAgeMin) * 0.8;
  }
  return Math.max(5, Math.min(100, Math.round(score)));
}

function calculateOverheatScore(priceChangePct, liquidityUSD) {
  const p = Math.max(0, nPct(priceChangePct));
  const normalizedLiq = Math.max(0, n$(liquidityUSD)) / 10000;
  const heat = Math.log10(p + 1) * (120 / (normalizedLiq + 1));
  return Math.max(0, Math.min(100, Math.round(heat)));
}

function determineAction(signal, execution, overheat) {
  const s = nPct(signal);
  const e = nPct(execution);
  const o = nPct(overheat);
  if (e < 25 || (e < 35 && o > 85)) {
    return "AVOID";
  }
  if (o >= 90) {
    return e >= 50 ? "WATCH" : "AVOID";
  }
  if (s >= 85 && e >= 35 && e < 60) {
    return o < 75 ? "SCALP" : "WATCH";
  }
  if (s >= 80 && e >= 60 && o <= 60) {
    return "BUY";
  }
  return "WATCH";
}

function getContextLabelId(execution, overheat) {
  const e = nPct(execution);
  const o = nPct(overheat);
  if (e < 25) return "illiquidSlippage";
  if (e < 40 && o > 80) return "parabolicIlliquid";
  if (o > 85) return "severelyOverextended";
  if (e < 50) return "thinOrderbook";
  if (o < 40 && e >= 70) return "healthyAccumulation";
  return "consolidating";
}

function analyzeRegimeFromNormalized(input) {
  if (!input || input.signalScore == null) return null;
  const raw = calculateExecutionScore(
    n$(input.liquidityUSD),
    nPct(input.top10HolderPct),
    nPct(input.poolAgeMinutes)
  );
  const execution = capExecutionForMissingPoolAge(raw, input);
  const overheat = calculateOverheatScore(input.priceChangePct, n$(input.liquidityUSD));
  const action = determineAction(input.signalScore, execution, overheat);
  const contextLabelId = getContextLabelId(execution, overheat);
  return {
    engine: TRIPLE_RISK_ENGINE_VERSION,
    inputsVersion: TRIPLE_RISK_ENGINE_VERSION,
    signalScore: input.signalScore,
    executionScore: execution,
    overheatScore: overheat,
    action,
    contextLabelId,
    missing: [...(input.missing || [])]
  };
}

function buildRegimeAnalysisFromDesk(tokenData, score) {
  return analyzeRegimeFromNormalized(normalizeRegimeInput(tokenData, score));
}

/**
 * @param {object} tokenData same shape as `GET /api/v1/token` → `data`
 * @param {{ confidence?: number }} scoreLike
 */
function buildTacticalRegimeForTokenResponse(tokenData, scoreLike) {
  return buildRegimeAnalysisFromDesk(tokenData, scoreLike);
}

module.exports = {
  TRIPLE_RISK_ENGINE_VERSION,
  normalizeRegimeInput,
  analyzeRegimeFromNormalized,
  analyzeAssetRegime: analyzeRegimeFromNormalized,
  buildRegimeAnalysisFromDesk,
  buildTacticalRegimeForTokenResponse,
  determineAction,
  calculateExecutionScore,
  calculateOverheatScore,
  getContextLabelId
};
