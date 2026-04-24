/**
 * Wallet narrative API only supports `en` and `es` (see backend walletNarrative).
 * UI locale maps: Spanish UI → Spanish narrative; any other UI → English narrative.
 */

/** @param {string} [locale] */
export function walletNarrativeApiLang(locale) {
  return String(locale || "").toLowerCase() === "es" ? "es" : "en";
}

/**
 * @param {Record<string, string | string[] | undefined>} query - `router.query`
 * @param {string} locale - global UI locale from LocaleContext
 */
export function resolveWalletNarrativeLang(query, locale) {
  const raw = query?.lang;
  const s = Array.isArray(raw) ? raw[0] : raw;
  const v = String(s || "").toLowerCase();
  if (v === "en" || v === "es") return v;
  return walletNarrativeApiLang(locale);
}
