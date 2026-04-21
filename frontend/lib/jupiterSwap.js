/**
 * Jupiter deep link for SOL → mint (amount in lamports).
 * @param {string} mint
 * @param {number} amountSol
 */
export function buildJupiterSwapUrl(mint, amountSol) {
  if (!mint) return "#";
  const n = Number(amountSol);
  const sol = Number.isFinite(n) && n > 0 ? n : 1;
  const amountLamports = Math.round(sol * 1_000_000_000);
  return `https://jup.ag/swap/SOL-${mint}?amount=${amountLamports}`;
}
