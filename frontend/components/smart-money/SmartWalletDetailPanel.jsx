import Link from "next/link";
import { Copy, ExternalLink } from "lucide-react";
import { formatUsdWhole, formatDateTime } from "../../lib/formatStable";

const MIN_H = 5;

function lowSample(p) {
  if (!p) return false;
  return (
    Number(p.resolvedSignals5m || 0) < MIN_H ||
    Number(p.resolvedSignals30m || 0) < MIN_H ||
    Number(p.resolvedSignals2h || 0) < MIN_H
  );
}

function fmtNum(v, d = 1) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toFixed(d);
}

export function SmartWalletDetailPanel({ row, labelFor, titleFor, narrativeLang, afterStats = null }) {
  const w = row;
  const p = w.profile;

  async function copyAddress() {
    if (!w.wallet) return;
    try {
      await navigator.clipboard.writeText(w.wallet);
    } catch {
      /* clipboard denied — ignore */
    }
  }

  return (
    <div className="space-y-4 text-left">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border border-white/10 rounded-xl p-3 bg-white/[0.02]">
        <div className="min-w-0 space-y-1">
          <p className="text-xs uppercase tracking-wide text-gray-500">Dirección completa</p>
          <p className="font-mono text-xs text-cyan-200/90 break-all" title={titleFor?.(w.wallet)}>
            {w.wallet}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={copyAddress}
            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10"
            title="Copiar dirección (solo se guarda en el portapapeles local)"
          >
            <Copy size={12} className="opacity-70" />
            Copiar
          </button>
          <Link
            href={`/wallet/${w.wallet}?lang=${narrativeLang || "en"}`}
            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
          >
            <ExternalLink size={12} className="opacity-70" />
            Ficha wallet
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
        <div className="rounded-lg border border-white/10 p-2.5 bg-white/[0.02]">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Win rate (DB)</p>
          <p className="text-white font-mono tabular-nums mt-0.5">{w.winRate != null ? `${fmtNum(w.winRate)}%` : "—"}</p>
        </div>
        <div className="rounded-lg border border-white/10 p-2.5 bg-white/[0.02]">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Smart score</p>
          <p className="text-violet-200 font-mono tabular-nums mt-0.5">
            {w.smartScore != null && Number.isFinite(w.smartScore) ? Math.round(w.smartScore) : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 p-2.5 bg-white/[0.02]">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">30d PnL (est.)</p>
          <p className="text-emerald-200 font-mono tabular-nums mt-0.5">+${formatUsdWhole(w.pnl30d || 0)}</p>
        </div>
        <div className="rounded-lg border border-white/10 p-2.5 bg-white/[0.02]">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">30d ROI vs ticket†</p>
          <p className="text-cyan-200/90 font-mono tabular-nums mt-0.5">
            {w.roi30dVsAvgSize != null ? `${Number(w.roi30dVsAvgSize).toFixed(2)}×` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 p-2.5 bg-white/[0.02]">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Tamaño medio posición</p>
          <p className="text-gray-200 font-mono tabular-nums mt-0.5">
            {w.avgPositionSize != null ? `$${formatUsdWhole(w.avgPositionSize)}` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-white/10 p-2.5 bg-white/[0.02]">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Trades / recientes</p>
          <p className="text-gray-200 font-mono tabular-nums mt-0.5">
            {w.totalTrades ?? "—"} <span className="text-gray-500">/ {w.recentHits ?? "—"}</span>
          </p>
        </div>
        <div className="rounded-lg border border-white/10 p-2.5 bg-white/[0.02]">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Last seen (DB)</p>
          <p className="text-gray-300 text-xs mt-0.5">{w.lastSeen ? formatDateTime(w.lastSeen) : "—"}</p>
        </div>
        <div className="rounded-lg border border-white/10 p-2.5 bg-white/[0.02]">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Fila actualizada</p>
          <p className="text-gray-300 text-xs mt-0.5">
            {w.smartWalletRowUpdatedAt ? formatDateTime(w.smartWalletRowUpdatedAt) : "—"}
          </p>
        </div>
      </div>

      {afterStats}

      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">Puntuaciones (smart_wallets)</p>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="rounded-lg border border-white/10 p-2 bg-white/[0.02] text-center">
            <p className="text-[10px] text-gray-500">Early</p>
            <p className="text-amber-200/90 font-mono">{w.earlyEntryScore != null ? Math.round(w.earlyEntryScore) : "—"}</p>
          </div>
          <div className="rounded-lg border border-white/10 p-2 bg-white/[0.02] text-center">
            <p className="text-[10px] text-gray-500">Cluster</p>
            <p className="text-amber-200/90 font-mono">{w.clusterScore != null ? Math.round(w.clusterScore) : "—"}</p>
          </div>
          <div className="rounded-lg border border-white/10 p-2 bg-white/[0.02] text-center">
            <p className="text-[10px] text-gray-500">Consistency</p>
            <p className="text-amber-200/90 font-mono">{w.consistencyScore != null ? Math.round(w.consistencyScore) : "—"}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
        <p className="text-xs font-semibold text-emerald-200/90 mb-2">Mejor señal resuelta (result_pct)</p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-gray-200">
          <span>
            Máx:{" "}
            {w.bestTradePct != null ? <span className="text-emerald-300 font-mono">+{fmtNum(w.bestTradePct)}%</span> : "—"}
          </span>
          {w.bestTradeMint ? (
            <span className="min-w-0">
              Token:{" "}
              <Link className="text-cyan-300 hover:underline mono text-xs" href={`/token/${w.bestTradeMint}`}>
                {w.bestTradeMint}
              </Link>
            </span>
          ) : null}
          {w.bestTradeAt ? (
            <span className="text-gray-500 text-xs">En {formatDateTime(w.bestTradeAt)}</span>
          ) : null}
        </div>
      </div>

      {p ? (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-violet-200">Comportamiento (wallet_behavior_stats)</p>
            {lowSample(p) ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/35 bg-amber-500/10 text-amber-200">
                Muestra baja n&lt;{MIN_H}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-gray-300">
            <p>WR real (agg): {p.winRateReal != null ? `${fmtNum(p.winRateReal)}%` : "—"}</p>
            <p>5m: {p.winRateReal5m != null ? `${fmtNum(p.winRateReal5m)}%` : "—"} (n {p.resolvedSignals5m ?? 0})</p>
            <p>30m: {p.winRateReal30m != null ? `${fmtNum(p.winRateReal30m)}%` : "—"} (n {p.resolvedSignals30m ?? 0})</p>
            <p>2h: {p.winRateReal2h != null ? `${fmtNum(p.winRateReal2h)}%` : "—"} (n {p.resolvedSignals2h ?? 0})</p>
            <p>Resueltos: {p.resolvedSignals ?? "—"}</p>
            <p>Estilo: {p.styleLabel || "—"}</p>
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed">
            Pre-pump ~${formatUsdWhole(p.avgSizePrePumpUsd || 0)} · latencia despliegue{" "}
            {p.avgLatencyPostDeployMin != null ? `${fmtNum(p.avgLatencyPostDeployMin, 1)}m` : "—"} · solo / grupo{" "}
            {Math.round(Number(p.soloBuyRatio || 0) * 100)}% / {Math.round(Number(p.groupBuyRatio || 0) * 100)}% · ant. /
            brk {Math.round(Number(p.anticipatoryBuyRatio || 0) * 100)}% /{" "}
            {Math.round(Number(p.breakoutBuyRatio || 0) * 100)}%
          </p>
          {p.computedAt ? <p className="text-[10px] text-gray-600">Computado: {formatDateTime(p.computedAt)}</p> : null}
        </div>
      ) : (
        <p className="text-xs text-gray-500">Sin fila en wallet_behavior_stats (perfil aún no calculado).</p>
      )}

      <p className="text-[10px] text-gray-600 leading-relaxed">
        {labelFor?.(w.wallet) != null
          ? `Mostrado como: ${labelFor(w.wallet)}. Los favoritos viven solo en este dispositivo (localStorage) y no se
        envían al servidor.`
          : "Los favoritos viven solo en este dispositivo (localStorage) y no se envían al servidor."}
      </p>
    </div>
  );
}
