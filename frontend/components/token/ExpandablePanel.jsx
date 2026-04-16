import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function ExpandablePanel({ title, icon, children, defaultOpen = false, badge = null }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const Icon = icon;

  return (
    <div className="glass-card overflow-hidden transition-all duration-300">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center gap-4 px-6 py-5 text-left hover:bg-white/[0.025] transition"
      >
        <span className="flex flex-wrap items-center gap-3 sm:gap-4 min-w-0">
          {Icon ? (
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600/25 to-cyan-600/15 border border-purple-500/25 flex items-center justify-center shrink-0">
              <Icon size={19} className="text-purple-200" />
            </span>
          ) : null}
          <span className="sl-h2 text-white min-w-0">
            {title}
          </span>
          {badge ? (
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-200 border border-purple-500/25">
              {badge}
            </span>
          ) : null}
        </span>
        <span className={`shrink-0 transform transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>
          <ChevronDown size={20} className="text-gray-400" />
        </span>
      </button>
      <div
        className={`transition-all duration-300 overflow-hidden ${isOpen ? "max-h-[1200px]" : "max-h-0"}`}
      >
        <div className="border-t border-[#2a2f36] px-6 py-6 bg-[#0e1318]/40">
          {children}
        </div>
      </div>
    </div>
  );
}

