/**
 * One-line contextual guidance for GlobalWayfinding (English, product voice).
 * Return null to hide the "Next suggested step" row.
 *
 * @param {string} pathname - Next.js `router.pathname` (e.g. `/token/[address]`)
 * @returns {string | null}
 */
export function getNextSuggestedStep(pathname) {
  if (!pathname || typeof pathname !== "string") return null;

  if (pathname === "/smart-money") {
    return "Open a wallet row for its profile (ES/EN narrative), or use Scanner if you already have a mint.";
  }
  if (pathname === "/scanner") {
    return "Paste a Solana mint (32–44 characters), then Analyze to open the full token terminal.";
  }
  if (pathname === "/watchlist") {
    return "Add mints from Home or Scanner, then open Portfolio for watchlist markets or Compare for two tokens side by side.";
  }
  if (pathname.startsWith("/token/")) {
    return "Add this mint to Watchlist to track it, check Smart money for wallets in flow, or Compare it against another token.";
  }
  if (pathname.startsWith("/wallet/")) {
    return "Return to Smart money for the full leaderboard, or Scanner if you want to pivot to a specific mint.";
  }

  return null;
}
