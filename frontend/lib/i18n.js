/**
 * Lightweight i18n: FLAT_STRINGS (primary) + optional nested DICT (reserved, currently empty).
 *
 * Usage:
 *   import { t, useT } from "../lib/i18n";
 *   import { useLocale } from "../contexts/LocaleContext";
 *   const { locale, t } = useLocale();
 */

import { FLAT_STRINGS } from "./i18n/flatStrings";

const ALL_LOCALES = ["en", "es", "fr", "de", "it", "ru", "zh", "ko", "ja", "ar", "pt", "nl", "pl", "tr", "hi", "vi"];
const DEFAULT_LANG = "en";

/** Legacy nested dictionary (empty): all UI strings live in `FLAT_STRINGS`. */
const DICT = {
  en: {},
  es: {}
};

export function pickLang(lang) {
  const key = String(lang || "").toLowerCase();
  return ALL_LOCALES.includes(key) ? key : DEFAULT_LANG;
}

export function isRtlLocale(lang) {
  return pickLang(lang) === "ar";
}

function lookup(node, parts) {
  let cur = node;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function interpolate(template, vars) {
  if (typeof template !== "string" || !vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
}

/**
 * Translate a key. If missing in `lang`, fallback to English; if also missing, return the key itself.
 *
 * @param {string} key - dotted path, e.g. "wallet.summary.loading"
 * @param {string} [lang]
 * @param {Record<string, string | number>} [vars]
 */
export function t(key, lang, vars) {
  const k = String(key || "");
  const langKey = pickLang(lang);
  const flatRow = FLAT_STRINGS[k];
  if (flatRow) {
    const s = flatRow[langKey] ?? flatRow[DEFAULT_LANG];
    return interpolate(typeof s === "string" ? s : "", vars);
  }
  const parts = k.split(".").filter(Boolean);
  if (!parts.length) return "";
  const nestedSource = DICT[langKey] && Object.keys(DICT[langKey]).length ? DICT[langKey] : DICT.en;
  const localized = lookup(nestedSource, parts);
  if (localized != null) return interpolate(localized, vars);
  const fallback = lookup(DICT.en, parts);
  if (fallback != null) return interpolate(fallback, vars);
  return key;
}

/** React-style hook (no actual React state needed; just binds the language). */
export function useT(lang) {
  const langKey = pickLang(lang);
  return (key, vars) => t(key, langKey, vars);
}

export const SUPPORTED_LOCALES = ALL_LOCALES;
export const DEFAULT_LOCALE = DEFAULT_LANG;

/** Menu: English name (subtitle) + native name + flag emoji — trigger label uses `layout.language` (always English). */
export const LANGUAGE_MENU = [
  { code: "en", english: "English", native: "English", flag: "🇺🇸" },
  { code: "es", english: "Spanish", native: "Español", flag: "🇪🇸" },
  { code: "fr", english: "French", native: "Français", flag: "🇫🇷" },
  { code: "de", english: "German", native: "Deutsch", flag: "🇩🇪" },
  { code: "it", english: "Italian", native: "Italiano", flag: "🇮🇹" },
  { code: "pt", english: "Portuguese", native: "Português", flag: "🇵🇹" },
  { code: "ru", english: "Russian", native: "Русский", flag: "🇷🇺" },
  { code: "zh", english: "Chinese (Simplified)", native: "简体中文", flag: "🇨🇳" },
  { code: "ko", english: "Korean", native: "한국어", flag: "🇰🇷" },
  { code: "ja", english: "Japanese", native: "日本語", flag: "🇯🇵" },
  { code: "ar", english: "Arabic", native: "العربية", flag: "🇸🇦" },
  { code: "nl", english: "Dutch", native: "Nederlands", flag: "🇳🇱" },
  { code: "pl", english: "Polish", native: "Polski", flag: "🇵🇱" },
  { code: "tr", english: "Turkish", native: "Türkçe", flag: "🇹🇷" },
  { code: "hi", english: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { code: "vi", english: "Vietnamese", native: "Tiếng Việt", flag: "🇻🇳" }
];

export const LOCALE_STORAGE_KEY = "sentinel-ui-locale";
