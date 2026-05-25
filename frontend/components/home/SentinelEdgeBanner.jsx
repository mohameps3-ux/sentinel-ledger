import { useSentinelEdge } from "../../hooks/useSentinelEdge";

/**
 * Phase 7c — Proof-of-edge banner shown on home feed.
 *
 * Why this exists:
 *   Photon, GMGN, BullX show "smart money buying" but never prove
 *   what % of their signals actually win. Sentinel does — and prominently.
 *   This converts skeptical users by showing aggregate resolved-outcome stats.
 */
export function SentinelEdgeBanner({ className = "" }) {
  const { winRate, avgWinReturn, totalWinners, totalResolved, bestSignal, loading } = useSentinelEdge();

  if (loading) {
    return (
      <div className={`sl-edge-banner sl-edge-banner--loading ${className}`}>
        <span className="sl-edge-banner__label">SENTINEL EDGE</span>
        <span className="sl-edge-banner__loading">loading 24h proof...</span>
      </div>
    );
  }

  if (!totalResolved || totalResolved < 5) {
    return (
      <div className={`sl-edge-banner sl-edge-banner--pending ${className}`}>
        <span className="sl-edge-banner__label">SENTINEL EDGE</span>
        <span className="sl-edge-banner__pending">
          Accumulating proof — {totalResolved || 0} resolved · check back later
        </span>
      </div>
    );
  }

  const wrColor = winRate >= 25 ? "sl-edge-good" : winRate >= 18 ? "sl-edge-ok" : "sl-edge-weak";
  const avgColor = avgWinReturn >= 5 ? "sl-edge-good" : avgWinReturn >= 2 ? "sl-edge-ok" : "sl-edge-weak";

  return (
    <div className={`sl-edge-banner ${className}`}>
      <span className="sl-edge-banner__label">SENTINEL · 24h</span>
      <div className="sl-edge-banner__stats">
        <span className="sl-edge-banner__stat">
          <span className="sl-edge-banner__stat-num">{totalResolved}</span>
          <span className="sl-edge-banner__stat-label">signals</span>
        </span>
        <span className="sl-edge-banner__sep">·</span>
        <span className="sl-edge-banner__stat">
          <span className={`sl-edge-banner__stat-num ${wrColor}`}>{winRate.toFixed(1)}%</span>
          <span className="sl-edge-banner__stat-label">win rate</span>
        </span>
        <span className="sl-edge-banner__sep">·</span>
        <span className="sl-edge-banner__stat">
          <span className={`sl-edge-banner__stat-num ${avgColor}`}>+{avgWinReturn.toFixed(1)}%</span>
          <span className="sl-edge-banner__stat-label">avg winner</span>
        </span>
        {bestSignal && bestSignal.returnPct >= 5 && (
          <>
            <span className="sl-edge-banner__sep sl-edge-banner__sep--hide-mobile">·</span>
            <span className="sl-edge-banner__stat sl-edge-banner__stat--best">
              <span className="sl-edge-banner__stat-num sl-edge-good">
                +{bestSignal.returnPct.toFixed(0)}%
              </span>
              <span className="sl-edge-banner__stat-label">
                best: ${bestSignal.symbol}
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
