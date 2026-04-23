import { useCallback, useId, useState } from "react";
import { ChevronDown } from "lucide-react";

const TONE_SUMMARY = {
  critical:
    "border-red-500/40 bg-red-500/[0.08] text-red-100 hover:bg-red-500/[0.12]",
  warn: "border-amber-500/40 bg-amber-500/[0.08] text-amber-100 hover:bg-amber-500/[0.12]",
  neutral: "border-white/[0.1] bg-white/[0.03] text-gray-200 hover:bg-white/[0.05]"
};

/**
 * Lightweight cockpit accordion: no layout animations; body mounts only while
 * open so children (and their data hooks) stay lazy until expanded.
 */
export function AccordionSection({ title, summaryTone = "neutral", defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const btnId = `${baseId}-btn`;
  const toggle = useCallback(() => setOpen((v) => !v), []);

  const toneClass = TONE_SUMMARY[summaryTone] || TONE_SUMMARY.neutral;

  return (
    <div className="rounded-lg border border-white/[0.08] overflow-hidden bg-black/20">
      <button
        id={btnId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={`w-full flex items-center justify-between gap-2 px-2.5 sm:px-3 py-2 sm:py-2.5 text-left transition-colors ${toneClass}`}
      >
        <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide leading-snug">{title}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={btnId}
          className="border-t border-white/[0.06] px-2.5 sm:px-3 py-2.5 sm:py-3 text-[11px] sm:text-[12px] text-gray-300 max-h-[min(52vh,28rem)] overflow-y-auto"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
