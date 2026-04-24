import { t } from "./i18n";

/**
 * One-line contextual guidance for GlobalWayfinding.
 * Returns a localized string or null when the route has no advice.
 *
 * @param {string} pathname - Next.js `router.pathname` (e.g. `/token/[address]`)
 * @param {string} [lang] - UI locale code; wayfinding steps are flat i18n strings for all supported locales.
 * @returns {string | null}
 */
export function getNextSuggestedStep(pathname, lang = "en") {
  if (!pathname || typeof pathname !== "string") return null;

  if (pathname === "/smart-money") return t("wayfinding.steps.smartMoney", lang);
  if (pathname === "/scanner") return t("wayfinding.steps.scanner", lang);
  if (pathname === "/watchlist") return t("wayfinding.steps.watchlist", lang);
  if (pathname.startsWith("/token/")) return t("wayfinding.steps.token", lang);
  if (pathname.startsWith("/wallet/")) return t("wayfinding.steps.wallet", lang);

  return null;
}
