/**
 * Deterministic pseudo sparkline from public % moves (24h + optional 5m).
 * Not OHLC — avoids N extra API calls; shape follows trend direction for UX.
 */
export function buildHomeCardSparklinePoints({
  mint = "",
  change24h,
  change5m,
  points = 24
} = {}) {
  const c24 = Number(change24h);
  const c5 = Number(change5m);
  const has24 = Number.isFinite(c24);
  const has5 = Number.isFinite(c5);
  let seed = 2166136261;
  const m = String(mint);
  for (let i = 0; i < m.length; i++) {
    seed ^= m.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  const n = Math.max(12, Math.min(32, Math.floor(Number(points) || 24)));
  const out = [];

  let dir = 0;
  if (has24 && c24 !== 0) dir = Math.sign(c24);
  else if (has5 && c5 !== 0) dir = Math.sign(c5);

  const spread = has24 ? Math.min(22, Math.max(3, Math.abs(c24) * 0.32)) : has5 ? Math.min(14, Math.abs(c5) * 0.25) : 4;
  const bump5 = has5 ? Math.sign(c5) * Math.min(7, Math.abs(c5) * 0.1) : 0;

  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const ease = t * t * (3 - 2 * t);
    let y = 50 + dir * spread * ease;
    if (t < 0.42 && has5 && bump5 !== 0) {
      y += bump5 * Math.sin((t / 0.42) * Math.PI);
    }
    const wobble = Math.sin((i + (seed & 15)) * 0.55) * (1.1 + ((seed >>> 8) % 5) * 0.06) * (1 - t * 0.5);
    out.push(y + wobble);
  }

  if (out.length >= 2 && dir !== 0) {
    const target = 50 + dir * spread;
    out[out.length - 1] = target;
  }

  return out;
}
