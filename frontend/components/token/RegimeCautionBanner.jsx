/**
 * C9 FASE 7 — UI honesta.
 * Renders a contextual banner based on the token's market regime.
 *
 * VOLATILE: positive — this is the high-edge setup (WR 32%)
 * CALM:     caution — historically poor edge (WR 2%)
 * TRENDING: neutral — moderate edge
 *
 * Props:
 *   regime {string} "volatile" | "trending" | "calm" | "unknown"
 */
export function RegimeCautionBanner({ regime }) {
  if (!regime || regime === "unknown") return null;

  const config = {
    volatile: {
      icon: "⚡",
      label: "VOLATILE EDGE",
      body: "High-momentum regime — historically strongest signal setup (WR 32%+). Proceed with defined risk.",
      classes: "border-amber-400/25 bg-amber-400/06 text-amber-200"
    },
    trending: {
      icon: "→",
      label: "TRENDING REGIME",
      body: "Moderate-edge regime. Signal performance varies — confirm with smart wallet flow before entry.",
      classes: "border-sky-400/25 bg-sky-400/06 text-sky-200"
    },
    calm: {
      icon: "⚠",
      label: "OUTSIDE HIGH-EDGE REGIME",
      body: "Calm market — historically low signal edge (WR ~2%). Proceed with caution or wait for regime shift.",
      classes: "border-rose-400/25 bg-rose-400/06 text-rose-200"
    }
  };

  const c = config[regime];
  if (!c) return null;

  return (
    <div className={`tpt-regime-banner ${c.classes}`}>
      <span className="tpt-regime-banner__icon">{c.icon}</span>
      <div className="tpt-regime-banner__text">
        <span className="tpt-regime-banner__label">{c.label}</span>
        <span className="tpt-regime-banner__body">{c.body}</span>
      </div>
    </div>
  );
}
