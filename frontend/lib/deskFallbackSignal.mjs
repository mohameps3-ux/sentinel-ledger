import { isProbableSolanaMint } from "./solanaMint.mjs";
import { getLiveSignalEmittedAtMs } from "./liveFeedAccess";

function firstFinite(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function decisionFromStrength(score) {
  if (score >= 80) return "BUILD";
  if (score >= 55) return "WATCH";
  return "LOW_EDGE";
}

function tierLabelFromStrength(score) {
  if (score >= 95) return "Strong";
  if (score >= 80) return "High";
  if (score >= 55) return "Medium";
  if (score >= 30) return "Low";
  return "Minimal";
}

/**
 * Build desk fallback from a live-signal card row (feed shape).
 * @param {object | null | undefined} sig
 * @returns {object | null}
 */
export function deskFallbackFromSignal(sig) {
  if (!sig || typeof sig !== "object") return null;
  const mint = sig.mint && isProbableSolanaMint(String(sig.mint)) ? String(sig.mint) : null;
  if (!mint) return null;

  const rawScore = Number(sig.signalStrength ?? sig.sentinelScore ?? sig.heatScore ?? 0);
  if (!Number.isFinite(rawScore) || rawScore <= 0) return null;
  const confidence = Math.max(0, Math.min(100, Math.round(rawScore)));

  const sw = Number(sig.smartWallets ?? sig.smartMoneyCount ?? sig.walletCount);
  const smartWallets = Number.isFinite(sw) ? Math.max(0, Math.round(sw)) : null;

  const change24h = firstFinite(
    sig.token?.change,
    sig.change,
    sig.change24h,
    sig.priceChange24h,
    sig._api?.spotChange24h,
    sig._api?.change24h
  );

  const priceChange5m = firstFinite(sig._api?.priceChange5m, sig.priceChange5m);

  const emittedMs = getLiveSignalEmittedAtMs(sig);
  const signalAgeMinutes =
    emittedMs != null && Number.isFinite(emittedMs)
      ? Math.max(0, Math.floor((Date.now() - emittedMs) / 60_000))
      : null;

  const decisionRaw = sig._api?.decision || sig.decision || sig.action;
  const decision = decisionRaw ? String(decisionRaw).trim() : decisionFromStrength(confidence);

  return {
    mint,
    confidence,
    confidenceLabel: tierLabelFromStrength(confidence),
    decision,
    smartWallets,
    priceChange5m,
    priceChange24h: change24h,
    signalAgeMinutes,
    source: "feed_card"
  };
}

/**
 * Minimal fallback from tamper-evident desk radar hint (?ctx= tr/sw).
 * @param {{ tr?: number, sw?: number } | null | undefined} hint
 * @param {string} mint
 * @returns {object | null}
 */
export function deskFallbackFromRadarHint(hint, mint) {
  if (!hint || !mint || !isProbableSolanaMint(mint)) return null;
  if (!Number.isFinite(Number(hint.tr))) return null;
  const confidence = Math.max(0, Math.min(100, Math.round(Number(hint.tr))));
  const sw = Number(hint.sw);
  return {
    mint,
    confidence,
    confidenceLabel: tierLabelFromStrength(confidence),
    decision: decisionFromStrength(confidence),
    smartWallets: Number.isFinite(sw) ? Math.max(0, Math.round(sw)) : null,
    priceChange5m: null,
    priceChange24h: null,
    signalAgeMinutes: null,
    source: "radar_hint"
  };
}

/**
 * Resolve fallback for Intel Desk from feed rows + optional radar hint.
 * @param {string | null | undefined} selectedMint
 * @param {object[]} signalRows
 * @param {object[]} heatRows
 * @param {{ tr?: number, sw?: number } | null | undefined} radarHint
 */
export function resolveDeskFallbackSignal(selectedMint, signalRows, heatRows, radarHint) {
  if (!selectedMint || !isProbableSolanaMint(selectedMint)) return null;

  const pools = [signalRows, heatRows].filter(Array.isArray);
  for (const pool of pools) {
    const sig = pool.find((row) => row?.mint === selectedMint);
    const fromSig = deskFallbackFromSignal(sig);
    if (fromSig) return fromSig;
  }

  return deskFallbackFromRadarHint(radarHint, selectedMint);
}
