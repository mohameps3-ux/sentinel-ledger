"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLocale } from "../../contexts/LocaleContext";
import { LANGUAGE_MENU } from "../../lib/i18n";

/** Trigger label is always English via `layout.language` (flat string). */
export function LanguageMenu({ className = "", compact = false }) {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={`relative ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("layout.language_aria")}
        title={t("layout.language_aria")}
        className={compact
          ? "h-7 min-w-[3.5rem] px-2 rounded-md border border-sl-border bg-white/[0.03] text-sl-sub inline-flex items-center justify-between gap-1 text-[11px] font-semibold tracking-wide shrink-0 transition-colors hover:border-indigo-400/35 hover:text-sl-text"
          : "h-8 sm:h-9 min-w-[6.75rem] sm:min-w-[7.25rem] pl-2.5 pr-2 border border-cyan-500/25 bg-[#0a1018]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-cyan-400/40 hover:bg-[#0c121c]/95 text-sl-sub inline-flex items-center justify-between gap-1.5 text-[11px] sm:text-xs font-semibold tracking-wide shrink-0 transition-colors"}
      >
        <span className="text-sl-sub select-none" translate="no">
          {compact ? String(locale || "en").toUpperCase() : t("layout.language")}
        </span>
        <ChevronDown
          size={compact ? 12 : 16}
          className={`text-cyan-300/90 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <ul
          className="absolute right-0 mt-1.5 z-[300] w-[min(19rem,calc(100vw-1rem))] max-h-[min(22rem,60vh)] overflow-y-auto border border-cyan-500/20 bg-[#070b10]/98 backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,0.55)] py-1"
          role="listbox"
          aria-label={t("layout.language_aria")}
        >
          {LANGUAGE_MENU.map(({ code, english, native, flag }) => (
            <li key={code} role="none">
              <button
                type="button"
                role="option"
                aria-selected={locale === code}
                onClick={() => {
                  setLocale(code);
                  setOpen(false);
                }}
                className={`w-full text-left px-2.5 py-2 text-xs flex items-center gap-3 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.06] ${
                  locale === code ? "bg-cyan-500/12 text-cyan-50" : "text-sl-sub"
                }`}
              >
                <span className="text-xl leading-none w-8 flex items-center justify-center shrink-0" aria-hidden>
                  {flag}
                </span>
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-semibold truncate">{native}</span>
                  <span className="text-[10px] text-sl-muted truncate">{english}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
