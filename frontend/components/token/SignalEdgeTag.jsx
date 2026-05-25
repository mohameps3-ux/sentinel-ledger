/**
 * C9 FASE 7 — UI honesta.
 * Shows which signal rule fired + its historical win-rate and sample count.
 *
 * Props:
 *   rule       {string}  e.g. "cluster_buy"
 *   winRate    {number}  0-100, e.g. 32.68
 *   samples    {number}  resolved row count, e.g. 713
 *   regime     {string}  "volatile" | "trending" | "calm" | "unknown"
 *   calibrated {boolean} true once tuner has ≥80 resolved rows (post-C9)
 */
export function SignalEdgeTag({ rule, winRate, samples, regime, calibrated = false }) {
  if (!rule) return null;

  const label = rule.replace(/_/g, " ").toUpperCase();

  const regimeColor =
    regime === "volatile"
      ? "text-amber-300 border-amber-400/30 bg-amber-400/08"
      : regime === "trending"
        ? "text-sky-300 border-sky-400/30 bg-sky-400/08"
        : regime === "calm"
          ? "text-rose-300 border-rose-400/30 bg-rose-400/08"
          : "text-zinc-400 border-white/10 bg-white/04";

  const wrColor =
    winRate >= 30
      ? "text-emerald-300"
      : winRate >= 20
        ? "text-amber-300"
        : "text-rose-300";

  return (
    <div className="tpt-signal-edge-tag">
      <span className="tpt-signal-edge-rule">{label}</span>
      <span className="tpt-signal-edge-sep">·</span>
      <span className={`tpt-signal-edge-wr ${wrColor}`}>
        WR {Number.isFinite(winRate) ? `${winRate.toFixed(0)}%` : "—"}
      </span>
      {Number.isFinite(samples) && samples > 0 && (
        <>
          <span className="tpt-signal-edge-sep">·</span>
          <span className="tpt-signal-edge-n">n={samples}</span>
        </>
      )}
      {regime && regime !== "unknown" && (
        <span className={`tpt-signal-edge-regime ${regimeColor}`}>
          {regime.toUpperCase()}
        </span>
      )}
      {!calibrated && (
        <span className="tpt-signal-edge-uncal" title="Tuner accumulating sample — stats will improve over time">
          est.
        </span>
      )}
    </div>
  );
}
