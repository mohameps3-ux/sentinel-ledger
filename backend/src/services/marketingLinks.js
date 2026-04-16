/**
 * Canonical public URL for deep links in Telegram / X (no trailing slash).
 * Set SENTINEL_APP_URL on Railway to your Vercel or custom domain.
 */
function appBase() {
  const raw = process.env.SENTINEL_APP_URL || "https://sentinel-ledger-ochre.vercel.app";
  return String(raw).replace(/\/$/, "");
}

function tokenPageUrl(mint) {
  return `${appBase()}/token/${mint}`;
}

function comparePageUrl() {
  return `${appBase()}/compare`;
}

module.exports = { appBase, tokenPageUrl, comparePageUrl };
