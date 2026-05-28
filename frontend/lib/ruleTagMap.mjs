/** Maps scoring engine signal tags ↔ validation-oracle rule ids (R01–R05). */

export const RULE_ID_BY_SIGNAL = {
  whale_accumulation: "R01",
  liquidity_shock: "R02",
  cluster_buy: "R03",
  cluster_probing: "R03",
  new_wallet_confidence: "R04",
  velocity_spike: "R05"
};

const RULE_LABEL_BY_SIGNAL = {
  whale_accumulation: "R01 · Whale Acc.",
  liquidity_shock: "R02 · Liq. Shock",
  cluster_buy: "R03 · Cluster Buy",
  cluster_probing: "R03 · Cluster Probe",
  new_wallet_confidence: "R04 · Fresh Wallet",
  velocity_spike: "R05 · Velocity"
};

/**
 * @param {string | null | undefined} tag
 * @returns {string | null}
 */
export function ruleIdFromSignalTag(tag) {
  const key = String(tag || "").trim();
  if (!key) return null;
  return RULE_ID_BY_SIGNAL[key] || null;
}

/**
 * @param {string | null | undefined} tag
 * @returns {string | null}
 */
export function ruleLabelFromSignalTag(tag) {
  const key = String(tag || "").trim();
  if (!key) return null;
  return RULE_LABEL_BY_SIGNAL[key] || key;
}

/**
 * Dominant rule for a card: prefer this emission's tags, else historical rulePerformance.
 *
 * @param {string[] | null | undefined} emissionSignals
 * @param {{ ruleId?: string, signal?: string } | null | undefined} rulePerformance
 * @returns {{ label: string | null, ruleId: string | null, tag: string | null }}
 */
export function resolveDominantRule(emissionSignals, rulePerformance) {
  const tags = Array.isArray(emissionSignals)
    ? emissionSignals.map((s) => String(s).trim()).filter(Boolean)
    : [];

  if (tags.length > 0) {
    const tag = tags[0];
    const ruleId = ruleIdFromSignalTag(tag);
    const label = ruleLabelFromSignalTag(tag) || ruleId || tag;
    return { label, ruleId, tag };
  }

  if (rulePerformance?.ruleId) {
    const tag = rulePerformance.signal ? String(rulePerformance.signal) : null;
    const label =
      (tag && ruleLabelFromSignalTag(tag)) ||
      String(rulePerformance.ruleId) ||
      null;
    return { label, ruleId: String(rulePerformance.ruleId), tag };
  }

  if (tags.length > 1) {
    return { label: "Multi-rule", ruleId: null, tag: null };
  }

  return { label: null, ruleId: null, tag: null };
}

/** @param {number | null | undefined} winRate */
export function wrColorClass(winRate) {
  const wr = Number(winRate);
  if (!Number.isFinite(wr)) return "text-zinc-400";
  if (wr >= 30) return "text-emerald-300";
  if (wr >= 20) return "text-amber-300";
  return "text-rose-300/90";
}
