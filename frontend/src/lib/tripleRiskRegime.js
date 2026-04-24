/**
 * Sentinel triple risk (execution / overheat) — client-side advisory layer.
 * Does not modify backend scores. ENGINE_VERSION 1: keep in sync with product notes.
 */
import { pairCreatedRawToUnixMs, poolAgeMinutesFromCreatedMs } from "./pairTime";

export const TRIPLE_RISK_ENGINE_VERSION = 1;

const POOL_AGE_FLOOR = 5;
const LIQ_SMALL_USD = 20_000;
const VOL_LIQ_INFER_RATIO = 5;
const NO_POOL_AGE_MAX_EXECUTION = 80;

/**
 * @param {unknown} n
 * @returns {number}
 */
function n$(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * @param {unknown} n
 * @returns {number}
 */
function nPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return v;
}

/**
 * @typedef {Object} TokenDeskData
 * @property {Object} [market] liquidity, volume, priceChange24h, pairCreatedAt (optional in API)
 * @property {Object} [holders] top10Percentage
 */

/**
 * @typedef {Object} NormalizedRegimeInput
 * @property {number|null} signalScore
 * @property {number} liquidityUSD
 * @property {number} top10HolderPct
 * @property {number} priceChangePct
 * @property {number} priceChange24hRaw
 * @property {number} poolAgeMinutes
 * @property {boolean} poolAgeInferred
 * @property {string[]} missing
 * @property {number} engine
 */

/**
 * @typedef {Object} RegimeAnalysis
 * @property {number} engine
 * @property {number} inputsVersion
 * @property {number} signalScore
 * @property {number} executionScore
 * @property {number} overheatScore
 * @property {'BUY' | 'WATCH' | 'SCALP' | 'AVOID'} action
 * @property {string} contextLabelId
 * @property {string[]} missing
 */

/**
 * Pass `data` from `GET /api/v1/token` (the inner `data` object, not the full response).
 * Pool age: `market.pairCreatedAt` if present; else if liq &lt; $20k and vol/liq &gt; 5 → very new pool;
 * else `missing: ['poolAge']` and execution capped in {@link capExecutionForMissingPoolAge}.
 *
 * @param {TokenDeskData | null} tokenData
 * @param {{ confidence?: number } | null} score
 * @returns {NormalizedRegimeInput}
 */
export function normalizeRegimeInput(tokenData, score) {
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

  /** @type {string[]} */
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

/**
 * @param {number} score
 * @param {{ missing?: string[] }} input
 * @returns {number}
 */
export function capExecutionForMissingPoolAge(score, input) {
  if (!Array.isArray(input?.missing) || !input.missing.includes("poolAge")) {
    return score;
  }
  return Math.min(score, NO_POOL_AGE_MAX_EXECUTION);
}

/**
 * @param {number} liquidityUSD
 * @param {number} top10Pct
 * @param {number} poolAgeMin
 * @returns {number} 0–100
 */
export function calculateExecutionScore(liquidityUSD, top10Pct, poolAgeMin) {
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

/**
 * @param {number} priceChangePct  normalized non-negative (pump heat)
 * @param {number} liquidityUSD
 * @returns {number} 0–100
 */
export function calculateOverheatScore(priceChangePct, liquidityUSD) {
  const p = Math.max(0, nPct(priceChangePct));
  const normalizedLiq = Math.max(0, n$(liquidityUSD)) / 10000;
  const heat = Math.log10(p + 1) * (120 / (normalizedLiq + 1));
  return Math.max(0, Math.min(100, Math.round(heat)));
}

/**
 * Determina la acción táctica (v1). Orden: tóxico → blow-off → scalp → buy → else watch.
 * @param {number} signal 0–100
 * @param {number} execution 0–100
 * @param {number} overheat 0–100
 * @returns {'BUY' | 'WATCH' | 'SCALP' | 'AVOID'}
 */
export function determineAction(signal, execution, overheat) {
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

/**
 * @param {number} execution
 * @param {number} overheat
 * @returns {keyof typeof CONTEXT_LABEL_IDS}
 */
export function getContextLabelId(execution, overheat) {
  const e = nPct(execution);
  const o = nPct(overheat);
  if (e < 25) return "illiquidSlippage";
  if (e < 40 && o > 80) return "parabolicIlliquid";
  if (o > 85) return "severelyOverextended";
  if (e < 50) return "thinOrderbook";
  if (o < 40 && e >= 70) return "healthyAccumulation";
  return "consolidating";
}

const EN_CONTEXT_BY_ID = {
  illiquidSlippage: "Illiquid / High Slippage",
  parabolicIlliquid: "Parabolic & Illiquid",
  severelyOverextended: "Severely Overextended",
  thinOrderbook: "Thin Orderbook",
  healthyAccumulation: "Healthy Accumulation",
  consolidating: "Consolidating Regime"
};

/**
 * English context line (v1 spec). Prefer `getContextLabelId` + i18n in UI.
 * @param {number} execution
 * @param {number} overheat
 * @returns {string}
 */
export function generateContextLabel(execution, overheat) {
  const id = getContextLabelId(execution, overheat);
  return EN_CONTEXT_BY_ID[id] || EN_CONTEXT_BY_ID.consolidating;
}

/**
 * @param {NormalizedRegimeInput | null} input
 * @returns {RegimeAnalysis | null}
 */
export function analyzeRegimeFromNormalized(input) {
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

/**
 * @param {unknown} tokenData
 * @param {unknown} score
 */
export function buildRegimeAnalysisFromDesk(tokenData, score) {
  return analyzeRegimeFromNormalized(normalizeRegimeInput(tokenData, score));
}

/**
 * Public name from product spec; identical to `analyzeRegimeFromNormalized`.
 */
export const analyzeAssetRegime = analyzeRegimeFromNormalized;

/**
 * Shapes a minimal `GET /api/v1/token` `data` object from a war-home card (`sig.token` + price change) and
 * the card’s `signalStrength` (same role as `confidence` on the socket).
 * Does not affect feed ordering — display only.
 *
 * @param {object} p
 * @returns {RegimeAnalysis | null}
 */
export function buildRegimeAnalysisForFeedContext({ signalStrength, token, priceChange24h }) {
  const sn = Math.round(Number(signalStrength));
  if (!Number.isFinite(sn) || sn < 1) return null;
  const t = token && typeof token === "object" ? token : {};
  const chg = priceChange24h != null ? nPct(priceChange24h) : nPct(t.change);
  const desk = {
    market: {
      liquidity: t.liquidity,
      volume24h: t.volume24h,
      priceChange24h: chg,
      pairCreatedAt: t.pairCreatedAt
    },
    holders: {
      top10Percentage: t.top10Percentage != null ? t.top10Percentage : t.top10HolderPct
    }
  };
  return buildRegimeAnalysisFromDesk(desk, { confidence: sn });
}

/**
 * Ids for i18n (`cockpit.desk.tripleContext.<id>`).
 * @type {Readonly<Record<string, true>>}
 */
export const CONTEXT_LABEL_IDS = {
  illiquidSlippage: true,
  parabolicIlliquid: true,
  severelyOverextended: true,
  thinOrderbook: true,
  healthyAccumulation: true,
  consolidating: true
};
