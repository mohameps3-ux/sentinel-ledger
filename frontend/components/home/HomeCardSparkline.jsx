import { useId } from "react";
import { buildHomeCardSparklinePoints } from "../../lib/buildHomeCardSparklinePoints";

/**
 * Minimal SVG sparkline for tactical cards (no axes).
 */
export function HomeCardSparkline({
  points: pointsProp,
  mint,
  change24h,
  change5m,
  compact = false,
  className = ""
}) {
  const points =
    Array.isArray(pointsProp) && pointsProp.length >= 2
      ? pointsProp
      : buildHomeCardSparklinePoints({ mint, change24h, change5m });

  const w = compact ? 52 : 72;
  const h = compact ? 20 : 26;
  const pad = 1.5;

  if (!Array.isArray(points) || points.length < 2) {
    return (
      <div
        className={`shrink-0 rounded-md bg-black/20 ring-1 ring-white/[0.06] ${className}`}
        style={{ width: w, height: h }}
        aria-hidden
      />
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(max - min, 1e-6);
  const up = points[points.length - 1] >= points[0];
  const stroke = up ? "rgba(52,211,153,0.92)" : "rgba(248,113,113,0.92)";
  const fillGradId = `sl-spark-${gradId}`;

  const pathLine = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - 2 * pad);
      const y = pad + (1 - (p - min) / span) * (h - 2 * pad);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const pathArea = (() => {
    let d = "";
    points.forEach((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - 2 * pad);
      const y = pad + (1 - (p - min) / span) * (h - 2 * pad);
      d += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)} `;
    });
    const lastX = pad + (w - 2 * pad);
    d += `L${lastX.toFixed(2)},${(h - pad).toFixed(2)} L${pad.toFixed(2)},${(h - pad).toFixed(2)} Z`;
    return d.trim();
  })();

  return (
    <div
      className={`shrink-0 rounded-md bg-black/25 ring-1 ring-white/[0.07] overflow-hidden ${className}`}
      style={{ width: w, height: h }}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block" role="img" aria-hidden>
        <defs>
          <linearGradient id={fillGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? "rgba(16,185,129,0.22)" : "rgba(239,68,68,0.18)"} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
        </defs>
        <path d={pathArea} fill={`url(#${fillGradId})`} opacity={0.9} />
        <path d={pathLine} fill="none" stroke={stroke} strokeWidth={1.35} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
