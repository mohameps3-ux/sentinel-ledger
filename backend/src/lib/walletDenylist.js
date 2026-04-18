/**
 * Skip scoring for known infra / vault / manually-listed wallets (comma-separated base58 in env).
 * Example: SMART_WALLET_SKIP_ANALYSIS=addr1,addr2
 */
function parseSkipList() {
  const raw = process.env.SMART_WALLET_SKIP_ANALYSIS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function shouldSkipWalletAnalysis(walletAddress) {
  if (!walletAddress) return true;
  return parseSkipList().has(walletAddress);
}

module.exports = { shouldSkipWalletAnalysis, parseSkipList };
