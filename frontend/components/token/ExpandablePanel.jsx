import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Accordion content uses CSS grid rows (not max-height) so iOS/Android
 * reliably show expanded panels — max-h transitions often clip or stick closed.
 */
export function ExpandablePanel({ title, icon, children, defaultOpen = false, badge = null }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const Icon = icon;

  return (
    <div className="glass-card overflow-hidden">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center gap-3 sm:gap-4 px-4 py-4 sm:px-6 sm:py-5 text-left hover:bg-white/[0.025] transition active:bg-white/[0.04]"
      >
        <span className="flex flex-wrap items-center gap-2 sm:gap-4 min-w-0 flex-1">
          {Icon ? (
            <span className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-purple-600/25 to-cyan-600/15 border border-purple-500/25 flex items-center justify-center shrink-0">
              <Icon size={18} className="text-purple-200" />
            </span>
          ) : null}
          <span className="sl-h2 text-white min-w-0 text-left leading-snug">
            {title}
          </span>
          {badge ? (
            <span className="shrink-0 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full bg-purple-500/15 text-purple-200 border border-purple-500/25 max-w-full truncate">
              {badge}
            </span>
          ) : null}
        </span>
        <span className={`shrink-0 transform transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>
          <ChevronDown size={20} className="text-gray-400" />
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-[#2a2f36] px-4 py-5 sm:px-6 sm:py-6 bg-[#0e1318]/40">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
