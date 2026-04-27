/**
 * Reactive container that wraps any content in the Apex Obsidian
 * "live card" — pearl/silver default border, with an animated liquid
 * metal flow that intensifies as `state` escalates.
 *
 * State values:
 *   "neutral"   silver dominant, ultra-slow flow.            (default)
 *   "active"    relevant signal — gold introduced, faster, micro-pulse.
 *   "critical"  high-conviction signal — gold dominant + halo + tension.
 *
 * Convention:
 *   The page decides the state from the underlying signal. For tokens,
 *   the rule of thumb (Phase 7C):
 *     score >= 80  →  critical
 *     score >= 60  →  active
 *     else         →  neutral
 *
 * Notes:
 *   - Pure CSS (utility class + data-attribute). Zero deps, zero JS
 *     animation cost.
 *   - The card establishes a stacking context (isolate); children
 *     render naturally above the animated border.
 *   - Reduced-motion users see a static state-correct border.
 */
export function ApexCard({
  state = "neutral",
  as: Tag = "div",
  className = "",
  children,
  ...rest
}) {
  const safeState = state === "active" || state === "critical" ? state : "neutral";
  return (
    <Tag
      data-apex-state={safeState}
      className={`apex-card ${className}`.trim()}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Helper: derive a sensible apex-state from a 0..100 signal score.
 * Centralized so every page agrees on the gold threshold.
 */
export function deriveApexState(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "neutral";
  if (n >= 80) return "critical";
  if (n >= 60) return "active";
  return "neutral";
}
