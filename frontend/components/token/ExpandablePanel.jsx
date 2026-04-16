import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function ExpandablePanel({ title, icon, children, defaultOpen = false, badge = null }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const Icon = icon;

  return (
    <div className="glass-card overflow-hidden transition-all duration-300">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex justify-between items-center px-5 py-4 text-left hover:bg-white/[0.02] transition"
      >
        <span className="flex items-center gap-3">
          {Icon ? (
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600/25 to-blue-600/20 border border-purple-500/20 flex items-center justify-center">
              <Icon size={18} className="text-purple-300" />
            </span>
          ) : null}
          <span className="font-semibold text-gray-100">
            {title}
          </span>
          {badge ? (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300">
              {badge}
            </span>
          ) : null}
        </span>
        <span className={`transform transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>
          <ChevronDown size={18} className="text-gray-400" />
        </span>
      </button>
      <div
        className={`transition-all duration-300 overflow-hidden ${isOpen ? "max-h-[1200px]" : "max-h-0"}`}
      >
        <div className="border-t soft-divider p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

