/** Relative tiers for wallet rows (mint snapshot; not global reputation). */
function tierFromScore(confidence) {
  const c = Number(confidence) || 0;
  if (c >= 80) return { tier: 1, tierLabel: "Elite" };
  if (c >= 60) return { tier: 2, tierLabel: "Active" };
  return { tier: 3, tierLabel: "Scout" };
}

module.exports = { tierFromScore };
