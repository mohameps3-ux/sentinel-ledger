import { useState } from "react";
import { useGuestTrial } from "../../hooks/useGuestTrial";

const DISMISS_KEY = "sl_guest_trial_banner_dismissed";

function readDismissed() {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function persistDismissed() {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export default function GuestTrialBanner() {
  const { trial, startTrial, isTrialActive, canStartTrial, isCritical } = useGuestTrial();
  const [starting, setStarting] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);

  function dismissBanner() {
    persistDismissed();
    setDismissed(true);
  }

  if (trial.status === "loading") return null;
  if (dismissed) return null;
  if (trial.status === "expired" && !canStartTrial) return null;

  async function handleStart() {
    setStarting(true);
    const result = await startTrial();
    if (result?.ok) setTimeout(() => window.location.reload(), 800);
    setStarting(false);
  }

  if (isTrialActive) {
    const borderClass = isCritical ? "border-[#2563EB]/60" : "border-sl-violet/30";
    const bgClass = isCritical ? "bg-[#2563EB]/5" : "bg-sl-violet/5";
    const textClass = isCritical ? "text-[#2563EB]" : "text-sl-violet";
    const dotClass = isCritical ? "bg-[#2563EB]" : "bg-sl-violet";
    const glowStyle = isCritical ? { boxShadow: "0 0 15px rgba(37,99,235,0.15)" } : {};

    return (
      <div
        className={`fixed left-0 right-0 z-40 border-b ${borderClass} ${bgClass} px-4 py-2 flex items-center justify-between gap-2`}
        style={{ top: "76px", ...glowStyle }}
        role="region"
        aria-label="Guest Pro trial"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`h-1.5 w-1.5 rounded-full animate-pulse flex-shrink-0 ${dotClass}`} />
          <span className={`font-mono text-xs uppercase tracking-wider ${textClass} flex-shrink-0`}>
            PRO TRIAL ACTIVE
          </span>
          <span className="font-mono text-xs text-sl-muted hidden sm:block truncate">
            {isCritical
              ? `${trial.minutesLeft ?? 0}m ${trial.secondsLeft ?? 0}s remaining`
              : `${trial.hoursLeft ?? 0}h ${trial.minutesLeft ?? 0}m remaining`}
          </span>
          {isCritical && (
            <span
              className="font-mono text-[9px] text-[#2563EB] uppercase 
                         tracking-widest animate-pulse hidden sm:block flex-shrink-0"
            >
              ACCESS REVOCATION IMMINENT
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href="/pricing"
            className="font-mono text-[10px] font-semibold uppercase tracking-wider
                       px-3 flex items-center flex-shrink-0
                       transition-colors duration-150"
            style={{
              height: "24px",
              borderRadius: "2px",
              background: isCritical ? "#2563EB" : "var(--sl-violet, #8B5CF6)",
              color: "#fff",
              border: "none"
            }}
          >
            SECURE PRO ACCESS
          </a>
          <button
            type="button"
            onClick={dismissBanner}
            className={`font-mono text-xs px-1 transition-colors duration-150 ${
              isCritical
                ? "text-[#2563EB]/80 hover:text-[#2563EB]"
                : "text-sl-muted hover:text-sl-sub"
            }`}
            aria-label="Dismiss trial banner"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  if (canStartTrial) {
    return (
      <div
        className="fixed left-0 right-0 z-40 bg-sl-panel border-b border-sl-border
                   px-4 py-2 flex items-center justify-between gap-2"
        style={{ top: "76px" }}
        role="region"
        aria-label="Start guest trial"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="font-mono text-xs text-sl-text uppercase tracking-wider flex-shrink-0">
            TRY SENTINEL PRO FREE
          </span>
          <span className="font-mono text-xs text-sl-muted hidden sm:block">
            24 hours · No registration · No card required
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleStart}
            disabled={starting}
            className="font-mono text-[10px] font-semibold uppercase tracking-wider
                       px-3 bg-sl-violet border border-sl-violet text-white
                       disabled:opacity-40 transition-opacity duration-150"
            style={{ height: "24px", borderRadius: "2px" }}
          >
            {starting ? "..." : "START FREE TRIAL"}
          </button>
          <button
            type="button"
            onClick={dismissBanner}
            className="font-mono text-xs text-sl-muted hover:text-sl-sub
                       transition-colors duration-150 px-1"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return null;
}
