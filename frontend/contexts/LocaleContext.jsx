"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, LOCALE_STORAGE_KEY, isRtlLocale, pickLang, t as translate } from "../lib/i18n";

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const s = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (s) setLocaleState(pickLang(s));
    } catch (_) {
      /* ignore */
    }
  }, []);

  const setLocale = useCallback((code) => {
    const next = pickLang(code);
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch (_) {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = next === "zh" ? "zh-Hans" : next;
      document.documentElement.dir = isRtlLocale(next) ? "rtl" : "ltr";
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale === "zh" ? "zh-Hans" : locale;
    document.documentElement.dir = isRtlLocale(locale) ? "rtl" : "ltr";
  }, [locale]);

  const t = useCallback((key, vars) => translate(key, locale, vars), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key, vars) => translate(key, DEFAULT_LOCALE, vars)
    };
  }
  return ctx;
}
