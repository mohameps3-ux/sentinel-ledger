/**
 * Pure derivations for Token Scanner terminal UI (no React).
 */

/** @param {unknown} n */
export function clampScore(n) {
  const x = Math.round(Number(n) || 0);
  return Math.max(0, Math.min(100, x));
}

/** @returns {"high" | "neutral" | "avoid"} */
export function convictionStatusKey(score) {
  if (score >= 80) return "high";
  if (score >= 40) return "neutral";
  return "avoid";
}

/**
 * Momentum 0–100: blend relative volume (vs universe max) and magnitude of 24h move.
 * @param {Record<string, unknown>} token
 * @param {number} maxVolume24h
 */
export function deriveMomentumMetric(token, maxVolume24h) {
  const vol = Number(token.volume24h || 0);
  const chg = Number(token.change ?? token.change24h ?? token.priceChange24h ?? 0);
  const denom = Math.max(maxVolume24h, 1);
  const volNorm = Math.min(1, vol / denom);
  const move = Math.min(30, Math.abs(chg) * 2.2);
  return Math.round(Math.min(100, volNorm * 70 + move));
}

/** @returns {"high" | "medium" | "low"} */
export function deriveRiskKey(token, score) {
  const liq = Number(token.liquidityUsd ?? token.liquidity ?? 0);
  if (score < 45 || liq < 25_000) return "high";
  if (score >= 72 && liq >= 100_000) return "low";
  return "medium";
}

/** @returns {"longBias" | "neutralStance" | "avoidExposure"} */
export function systemSignalKey(score, change) {
  const chg = Number(change);
  if (score >= 55 && (!Number.isFinite(chg) || chg >= -3)) return "longBias";
  if (score < 40 || (Number.isFinite(chg) && chg <= -15)) return "avoidExposure";
  return "neutralStance";
}

/**
 * @returns {{ kind: "minutes"; m: number } | { kind: "preset"; key: "10m" | "4h" | "24h" }}
 */
export function timeHorizonFromToken(token, change, volume24h) {
  const ew = token.entryWindowMinutesLeft;
  if (ew != null && Number.isFinite(Number(ew))) {
    const m = Math.max(1, Math.min(9999, Math.round(Number(ew))));
    return { kind: "minutes", m };
  }
  const chg = Number(change);
  const vol = Number(volume24h || 0);
  if (Math.abs(chg) > 25 && vol > 150_000) return { kind: "preset", key: "10m" };
  if (vol > 400_000) return { kind: "preset", key: "10m" };
  if (vol < 50_000 && Math.abs(chg) < 8) return { kind: "preset", key: "24h" };
  return { kind: "preset", key: "4h" };
}

/**
 * @param {Record<string, unknown>} token
 * @param {(k: string) => string} t
 * @returns {string[]}
 */
export function buildNarrativeLines(token, t) {
  const lines = [];
  const seen = new Set();
  const push = (s) => {
    const x = String(s).trim();
    if (!x || seen.has(x.toLowerCase())) return;
    seen.add(x.toLowerCase());
    lines.push(x);
  };

  for (const tag of token.narrativeTags || []) {
    push(String(tag));
  }

  const tagsBlob = (token.narrativeTags || []).map((x) => String(x).toLowerCase()).join(" ");
  const dex = String(token.dex || token.launchpad || "").toLowerCase();
  if (tagsBlob.includes("pump") || dex.includes("pump")) {
    push(t("scanner.narrative.line.pumpOrigin"));
  }

  const h = Number(token.poolAgeHours ?? token.ageHours);
  const label = String(token.poolAgeLabel || token.poolAge || "").toLowerCase();
  const looksNew =
    (Number.isFinite(h) && h < 24) ||
    (label.length > 0 && (label.includes("min") || label.includes("hour") || label.includes("h")) && !label.includes("day"));
  if (looksNew) push(t("scanner.narrative.line.new24h"));

  const vol = Number(token.volume24h || 0);
  const liq = Number(token.liquidityUsd ?? token.liquidity ?? 1);
  if (vol > 80_000 && vol > liq * 0.4) push(t("scanner.narrative.line.highVelocity"));

  if (lines.length === 0) push(t("scanner.narrative.line.fallback"));

  return lines.slice(0, 8);
}

/**
 * @param {Record<string, unknown>[]} rows
 */
export function maxVolume24h(rows) {
  let m = 0;
  for (const r of rows) {
    const v = Number(r.volume24h || 0);
    if (v > m) m = v;
  }
  return m;
}
