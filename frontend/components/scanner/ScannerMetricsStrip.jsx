import { clampScore, deriveMomentumMetric, maxVolume24h } from "../../lib/scannerTerminalModel.mjs";

function MetricCell({ label, value }) {
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums text-zinc-100">{value}</p>
    </div>
  );
}

export function ScannerMetricsStrip({ token, universeRows, t }) {
  if (!token) return null;
  const score = clampScore(token.sentinelScore);
  const liq = Number(token.liquidityUsd ?? token.liquidity ?? 0);
  const vol = Number(token.volume24h || 0);
  const mv = maxVolume24h(universeRows.length ? universeRows : [token]);
  const mom = deriveMomentumMetric(token, mv);
  return (
    <div className="grid grid-cols-2 border-b border-white/10 sm:grid-cols-4 sm:divide-x sm:divide-white/10">
      <MetricCell label={t("scanner.metric.liquidity")} value={`$${liq.toLocaleString()}`} />
      <MetricCell label={t("scanner.metric.volume")} value={`$${vol.toLocaleString()}`} />
      <MetricCell label={t("scanner.metric.momentum")} value={String(mom)} />
      <MetricCell label={t("scanner.metric.confidence")} value={String(score)} />
    </div>
  );
}
