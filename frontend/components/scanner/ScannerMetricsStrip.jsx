import { BarChart3, Droplets, Gauge, RadioTower } from "lucide-react";
import { clampScore, deriveMomentumMetric, maxVolume24h } from "../../lib/scannerTerminalModel.mjs";
import { formatCompact } from "../../lib/formatStable";

const metricIcons = {
  liquidity: Droplets,
  volume: BarChart3,
  momentum: RadioTower,
  confidence: Gauge
};

function MetricCell({ tone, label, value }) {
  const Icon = metricIcons[tone] || Gauge;
  return (
    <div className="min-w-0 rounded-md border border-white/[0.08] bg-white/[0.035] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-500">{label}</p>
        <Icon size={15} className="shrink-0 text-zinc-500" />
      </div>
      <p className="truncate font-mono text-sm tabular-nums text-zinc-100 sm:text-base">{value}</p>
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
    <div className="grid gap-2 border-b border-white/10 px-4 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
      <MetricCell tone="liquidity" label={t("scanner.metric.liquidity")} value={formatCompact(liq)} />
      <MetricCell tone="volume" label={t("scanner.metric.volume")} value={formatCompact(vol)} />
      <MetricCell tone="momentum" label={t("scanner.metric.momentum")} value={String(mom)} />
      <MetricCell tone="confidence" label={t("scanner.metric.confidence")} value={String(score)} />
    </div>
  );
}
