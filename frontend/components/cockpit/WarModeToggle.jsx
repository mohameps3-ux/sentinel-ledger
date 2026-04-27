import { useWarMode } from "../../contexts/WarModeContext";

/**
 * War-mode toggle rendered as a sniper-scope reticle.
 *
 * Visual contract:
 *  - OFF: emerald ring, soft inner crosshair, calm. "Standby".
 *  - ON:  red ring, glowing center, pulse + scan animation. "Armed".
 *
 * Accessibility:
 *  - Real <button role="switch" aria-checked> so screen readers announce state.
 *  - aria-label switches between "Arm war mode" / "Disarm war mode".
 *
 * Notes:
 *  - Pure CSS animations (zero deps). Animations stop when prefers-reduced-motion is set.
 *  - No new context, no new state — wraps the existing `useWarMode()` hook.
 */
export function WarModeToggle() {
  const { isWarMode, toggleWarMode } = useWarMode();
  const armed = Boolean(isWarMode);
  const ringColor = armed ? "#ef4444" : "#10b981";
  const labelText = armed ? "ARMED" : "STANDBY";
  const labelTone = armed ? "text-red-300" : "text-emerald-300";

  return (
    <div className="flex items-center gap-2 shrink-0">
      <span
        className={`hidden xl:inline font-mono uppercase tracking-[0.18em] text-[9px] font-bold transition-colors duration-200 ${labelTone}`}
        aria-hidden
      >
        {labelText}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={armed}
        aria-label={armed ? "Disarm war mode" : "Arm war mode"}
        title={armed ? "Disarm war mode" : "Arm war mode"}
        onClick={toggleWarMode}
        data-armed={armed ? "1" : undefined}
        className={`sl-war-reticle group relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050a10] ${
          armed
            ? "border-red-500/60 bg-red-950/50 shadow-[0_0_14px_rgba(239,68,68,0.35)]"
            : "border-emerald-500/40 bg-emerald-950/35 shadow-[0_0_8px_rgba(16,185,129,0.18)]"
        } hover:scale-[1.06]`}
      >
        <svg
          viewBox="0 0 32 32"
          width="22"
          height="22"
          aria-hidden
          className="sl-war-reticle__svg"
        >
          <circle
            cx="16"
            cy="16"
            r="12"
            fill="none"
            stroke={ringColor}
            strokeWidth="1.4"
            opacity="0.85"
          />
          <circle
            cx="16"
            cy="16"
            r="7"
            fill="none"
            stroke={ringColor}
            strokeWidth="0.9"
            opacity="0.55"
          />
          <line x1="16" y1="1" x2="16" y2="6" stroke={ringColor} strokeWidth="1.2" />
          <line x1="16" y1="26" x2="16" y2="31" stroke={ringColor} strokeWidth="1.2" />
          <line x1="1" y1="16" x2="6" y2="16" stroke={ringColor} strokeWidth="1.2" />
          <line x1="26" y1="16" x2="31" y2="16" stroke={ringColor} strokeWidth="1.2" />
          <line x1="11" y1="16" x2="14" y2="16" stroke={ringColor} strokeWidth="0.8" opacity="0.7" />
          <line x1="18" y1="16" x2="21" y2="16" stroke={ringColor} strokeWidth="0.8" opacity="0.7" />
          <line x1="16" y1="11" x2="16" y2="14" stroke={ringColor} strokeWidth="0.8" opacity="0.7" />
          <line x1="16" y1="18" x2="16" y2="21" stroke={ringColor} strokeWidth="0.8" opacity="0.7" />
          <line
            className="sl-war-reticle__scan"
            x1="16"
            y1="16"
            x2="16"
            y2="4"
            stroke={ringColor}
            strokeWidth="1"
            opacity="0.9"
          />
          <circle
            className="sl-war-reticle__dot"
            cx="16"
            cy="16"
            r="1.6"
            fill={ringColor}
          />
        </svg>
      </button>
      <style jsx>{`
        .sl-war-reticle__dot {
          transform-origin: 16px 16px;
          animation: sl-war-dot 2.6s ease-in-out infinite;
        }
        .sl-war-reticle__scan {
          transform-origin: 16px 16px;
          animation: sl-war-scan 4.5s linear infinite;
          opacity: 0;
        }
        .sl-war-reticle[data-armed="1"] .sl-war-reticle__dot {
          animation-duration: 0.7s;
          filter: drop-shadow(0 0 4px rgba(239, 68, 68, 0.55));
        }
        .sl-war-reticle[data-armed="1"] .sl-war-reticle__scan {
          animation-duration: 1.4s;
          opacity: 0.55;
        }
        .sl-war-reticle:hover .sl-war-reticle__dot {
          animation-duration: 0.5s;
        }
        @keyframes sl-war-dot {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.85;
          }
          50% {
            transform: scale(1.55);
            opacity: 1;
          }
        }
        @keyframes sl-war-scan {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .sl-war-reticle__dot,
          .sl-war-reticle__scan {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
