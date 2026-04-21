import { Crosshair } from "lucide-react";
import { useWarMode } from "../../contexts/WarModeContext";

export function WarModeToggle() {
  const { isWarMode, toggleWarMode } = useWarMode();

  return (
    <div className="flex items-center gap-2 shrink-0">
      <span
        className={`hidden sm:inline font-semibold uppercase tracking-[0.12em] text-[9px] ${
          isWarMode ? "text-rose-300" : "text-gray-500"
        }`}
      >
        War mode
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isWarMode}
        aria-label={isWarMode ? "Disable war mode" : "Enable war mode"}
        onClick={toggleWarMode}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050a10] ${
          isWarMode
            ? "border-rose-500/50 bg-rose-950/80 shadow-[0_0_12px_rgba(244,63,94,0.25)]"
            : "border-white/15 bg-white/[0.04]"
        }`}
      >
        <span
          className={`pointer-events-none absolute top-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[10px] transition-[left,background-color] duration-200 ${
            isWarMode ? "left-[22px] bg-rose-500 text-white" : "left-0.5 bg-slate-700 text-slate-300"
          }`}
        >
          <Crosshair size={14} strokeWidth={2.2} aria-hidden />
        </span>
      </button>
    </div>
  );
}
