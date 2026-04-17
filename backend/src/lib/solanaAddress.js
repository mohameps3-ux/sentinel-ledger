/** Loose validation for Solana base58 pubkeys (mints / wallets). */
function isProbableSolanaPubkey(value) {
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (s.length < 32 || s.length > 44) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

module.exports = { isProbableSolanaPubkey };
