/**
 * C9 Phase 7 — Honest signal edge display.
 * Shows which rule fired + historical WR + current market regime.
 *
 * Props:
 *   rule       {string}   label, e.g. "R03 · Cluster"
 *   winRate    {number}   0-100, e.g. 32.68 — null if unknown
 *   samples    {number}   resolved row count — null if unknown
 *   regime     {string}   "volatile" | "trending" | "calm" | null
 *   calibrated {boolean}  true once ≥80 resolved rows exist
 */
export function SignalEdgeTag({ rule, winRate, samples, regime, calibrated = false }) {
  if (!rule && !regime) return null;

  const regimeMeta = {
    volatile: { label: "VOLATILE", icon: "⚡", cls: "text-amber-300 border-amber-400/40 bg-amber-400/10" },
    trending: { label: "TRENDING", icon: "↑", cls: "text-sky-300 border-sky-400/35 bg-sky-400/08" },
    calm:     { label: "CALM",     icon: "◦", cls: "text-rose-300/80 border-rose-400/25 bg-rose-400/06" }
  };
  const rm = regime ? regimeMeta[regime] : null;

  const wrNum = Number.isFinite(Number(winRate)) ? Number(winRate) : null;
  const wrColor =
    wrNum == null
      ? "text-zinc-500"
      : wrNum >= 30
        ? "text-emerald-300"
        : wrNum >= 20
          ? "text-amber-300"
          : "text-rose-300/80";

  return (
    <div className="tpt-signal-edge-tag">
      {rule && (
        <span className="tpt-signal-edge-rule">{rule}</span>
      )}
      {rule && (wrNum != null || rm) && (
        <span className="tpt-signal-edge-sep">·</span>
      )}
      {wrNum != null && (
        <span className={`tpt-signal-edge-wr ${wrColor}`}>
          WR {wrNum.toFixed(0)}%
        </span>
      )}
      {wrNum != null && samples != null && Number.isFinite(samples) && samples > 0 && (
        <>
          <span className="tpt-signal-edge-sep">·</span>
          <span className="tpt-signal-edge-n">n={Number(samples).toLocaleString()}</span>
        </>
      )}
      {rm && (
        <span className={`tpt-signal-edge-regime ${rm.cls}`} title={`Current market regime: ${regime}`}>
          {rm.icon} {rm.label}
        </span>
      )}
      {!calibrated && rule && wrNum != null && (
        <span
          className="tpt-signal-edge-uncal"
          title="Tuner accumulating samples — accuracy improves as more signals resolve"
        >
          est.
        </span>
      )}
    </div>
  );
}
