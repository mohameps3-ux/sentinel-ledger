import { buildRegimeAnalysisForFeedContext, generateContextLabel } from "@/lib/tripleRiskRegime";
import { useLocale } from "../../contexts/LocaleContext";

function chipClass(action) {
  if (action === "BUY") return "text-emerald-200 border-emerald-500/40 bg-emerald-500/10";
  if (action === "WATCH") return "text-amber-200 border-amber-500/40 bg-amber-500/10";
  if (action === "SCALP") return "text-orange-200 border-orange-500/40 bg-orange-500/10";
  return "text-rose-200 border-rose-500/40 bg-rose-500/10";
}

/**
 * Compact tactical regime (same v1 engine as TokenDesk) for war-home cards.
 * Feed order is unchanged — display-only per product decision (see `pages/index.js` near `liveSignalPool`).
 */
export function TacticalRegimePill({ signalStrength, token, priceChange24h, className = "" }) {
  const { t } = useLocale();
  const regime = buildRegimeAnalysisForFeedContext({ signalStrength, token, priceChange24h });
  if (!regime) return null;
  const ctx = t(`cockpit.desk.tripleContext.${regime.contextLabelId}`) || generateContextLabel(regime.executionScore, regime.overheatScore);
  return (
    <span
      data-testid="sl-tactical-regime-pill"
      className={`text-[7px] sm:text-[8px] font-mono font-bold px-1 py-0.5 rounded border shrink-0 max-w-full truncate ${chipClass(
        regime.action
      )} ${className}`}
      title={`Tactical: ${String(regime.action)} · v${regime.inputsVersion} · ${ctx}`}
    >
      {String(regime.action)}
    </span>
  );
}
