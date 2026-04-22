"use strict";

/**
 * Fase A.1 + A.2: capa "alpha" de solo observación (EV proxy, riesgo de slippage,
 * confianza calibrada, heurística "cluster tarde" + meta-labeling).
 * El gating estricto se activa vía env en signalEmissionGate; por defecto no bloquea.
 */

function clamp(n, lo, hi) {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

const ENABLED = String(process.env.SIGNAL_ALPHA_LAYER_ENABLED || "true").toLowerCase() !== "false";
const CALIB = clamp(Number(process.env.SIGNAL_CONFIDENCE_CALIBRATION || 1), 0.5, 1.05);
const LATE_WALLETS = Math.max(2, Math.floor(Number(process.env.SIGNAL_ALPHA_LATE_MIN_WALLETS || 4)));
const LATE_TX_BASELINE_MULT = Math.max(1, Number(process.env.SIGNAL_ALPHA_LATE_TX_TO_BASELINE_MULT || 3));
const LATE_EVENTS = Math.max(3, Math.floor(Number(process.env.SIGNAL_ALPHA_LATE_MIN_EVENTS || 8)));

function qualityFromScore(scores) {
  const risk = clamp(Number(scores?.risk || 0), 0, 100);
  const smart = clamp(Number(scores?.smart || 0), 0, 100);
  const momentum = clamp(Number(scores?.momentum || 0), 0, 100);
  const riskInv = 100 - risk;
  return clamp((smart * 0.4 + momentum * 0.35 + riskInv * 0.25) / 100, 0, 1);
}

/**
 * @param {object} score - scoring result (engine)
 * @param {object} ctx - buildScoringContext: liquidityUsd, amountUsd, priceChange24h, volume24h, ...
 * @returns {object|null}
 */
function buildAlphaLayer(score, ctx) {
  if (!ENABLED) return null;
  if (!score || typeof score !== "object") return null;

  const liq = Number(ctx?.liquidityUsd);
  const amt = Number(ctx?.amountUsd);
  const vol = Number(ctx?.volume24h);
  const volLiq = Number.isFinite(liq) && liq > 0 && Number.isFinite(vol) ? vol / liq : null;
  const chg = ctx?.priceChange24h;
  const absChg = Number.isFinite(Number(chg)) ? Math.abs(Number(chg)) : null;

  // Impacto relativo a la pool (0..1)
  const impact = Number.isFinite(amt) && Number.isFinite(liq) && liq > 0
    ? clamp(amt / liq, 0, 0.2) / 0.2
    : 0.15;

  const hot = volLiq != null ? clamp(volLiq / 20, 0, 1) : 0.2;
  const highVolReg = absChg != null && absChg >= 10 ? 0.35 : absChg != null && absChg >= 5 ? 0.2 : 0.05;
  const slippageRisk = Number(
    clamp(0.4 * impact + 0.35 * hot + 0.2 * highVolReg + 0.05, 0, 1).toFixed(4)
  );

  const confRaw = clamp(Number(score.confidence || 0), 0, 100);
  const calibratedConfidence = Math.round(clamp(confRaw * CALIB, 0, 100));
  const q = qualityFromScore(score.scores);
  const cNorm = confRaw / 100;
  const w = Number(score?.meta?.signalQuality?.performanceWeight);
  const perfN = !Number.isFinite(w) || w <= 0 ? 0.75 : clamp(w / 1.25, 0, 1);
  const evProxy = Number(
    clamp(q * cNorm * perfN * (1 - slippageRisk), 0, 1).toFixed(4)
  );

  const m = score.meta || {};
  const eiw = Number(m.uniqueWalletsInWindow) || 0;
  const eIn = Number(m.eventsInWindow) || 0;
  const txLast = Number(m.txLastMin) || 0;
  const base = Number(m.baselinePerMin) || 0;
  const baseSafe = Math.max(0.08, base);
  const burst = txLast / baseSafe;
  const lateByBurst = eiw >= LATE_WALLETS && eIn >= LATE_EVENTS && burst >= LATE_TX_BASELINE_MULT;
  const lateByEvents = eIn >= LATE_EVENTS * 1.2 && eiw >= LATE_WALLETS;
  const isLate = lateByBurst || lateByEvents;
  const lateClusterScore = Number(
    clamp(
      0.5 * (lateByBurst ? 1 : 0) + 0.3 * (lateByEvents ? 1 : 0) + 0.2 * clamp((eIn - 3) / 20, 0, 1),
      0,
      1
    ).toFixed(4)
  );
  const signals = Array.isArray(score.signals) ? score.signals : [];
  const hasCluster = signals.includes("cluster_buy");
  const slipBad = slippageRisk > 0.5;

  let metaLabel = "follow";
  if (isLate && hasCluster) metaLabel = "skip";
  else if (slipBad || (isLate && eiw >= LATE_WALLETS) || (lateClusterScore > 0.5 && eiw >= LATE_WALLETS)) {
    metaLabel = "caution";
  }

  return {
    version: 1,
    evProxy,
    slippageRisk,
    calibratedConfidence,
    confidenceRaw: confRaw,
    lateClusterScore,
    metaLabel,
    inputs: {
      uniqueWalletsInWindow: eiw,
      eventsInWindow: eIn,
      txLastMin: txLast,
      baselinePerMin: base,
      burstToBaseline: Number(burst.toFixed(2)),
      hasClusterBuy: hasCluster
    }
  };
}

module.exports = {
  buildAlphaLayer,
  isAlphaLayerEnabled: () => ENABLED
};
