import Link from "next/link";
import { formatUsdWhole, formatDateTime } from "../../lib/formatStable";
import { BEHAVIOR_LEGEND_EN, BEHAVIOR_LEGEND_ES, formatLatencyPostDeployMin, formatPrePumpUsd } from "../../lib/walletBehaviorDisplay";
import { useLocale } from "../../contexts/LocaleContext";

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

export function SmartWalletDetailPanel({ row, labelFor, titleFor, narrativeLang }) {
  const { locale } = useLocale();
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
    <div className="space-y-2 text-left font-mono text-[10px]">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 border border-[#1F2937] p-2 bg-[#0B0F14]">
        <div className="min-w-0 space-y-0.5">
          <p className="text-[9px] uppercase tracking-widest text-gray-500">FULL ADDRESS</p>
          <p className="text-[10px] text-indigo-400 break-all" title={titleFor?.(w.wallet)}>
            {w.wallet}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={copyAddress}
            className="text-[9px] px-2 py-0.5 border border-[#1F2937] bg-[#0D1117] text-indigo-400 hover:bg-[#111722]"
            title="Copy to clipboard"
          >
            [ COPY ]
          </button>
          <Link
            href={`/wallet/${w.wallet}?lang=${narrativeLang || "en"}`}
            className="text-[9px] px-2 py-0.5 border border-[#1F2937] bg-[#0D1117] text-indigo-400 hover:bg-[#111722]"
          >
            [ WALLET PAGE ]
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1">
        <div className="border border-[#1F2937] p-1.5 bg-[#0D1117]">
          <p className="text-[9px] text-gray-500 uppercase tracking-wide">WIN RATE (DB)</p>
          <p className="text-gray-100 tabular-nums mt-0.5">{w.winRate != null ? `${fmtNum(w.winRate)}%` : "—"}</p>
        </div>
        <div className="border border-[#1F2937] p-1.5 bg-[#0D1117]">
          <p className="text-[9px] text-gray-500 uppercase tracking-wide">SMART SCORE</p>
          <p className="text-emerald-400 tabular-nums mt-0.5">
            {w.smartScore != null && Number.isFinite(w.smartScore) ? Math.round(w.smartScore) : "—"}
          </p>
        </div>
        <div className="border border-[#1F2937] p-1.5 bg-[#0D1117]">
          <p className="text-[9px] text-gray-500 uppercase tracking-wide">UNIFIED (RANK)</p>
          <p className="text-amber-200/90 tabular-nums mt-0.5">
            {w.unifiedScore != null && Number.isFinite(Number(w.unifiedScore))
              ? fmtNum(w.unifiedScore, 1)
              : w.score != null && Number.isFinite(Number(w.score))
                ? fmtNum(w.score, 1)
                : "—"}
          </p>
        </div>
        <div className="border border-[#1F2937] p-1.5 bg-[#0D1117]">
          <p className="text-[9px] text-gray-500 uppercase tracking-wide">PROFIT FACTOR (API)</p>
          <p className="text-gray-100 tabular-nums mt-0.5">
            {w.profitFactor != null && w.profitFactor !== "" && Number.isFinite(Number(w.profitFactor))
              ? fmtNum(w.profitFactor, 2)
              : "—"}
          </p>
        </div>
        <div className="border border-[#1F2937] p-1.5 bg-[#0D1117]">
          <p className="text-[9px] text-gray-500 uppercase tracking-wide">30D PnL (EST.)</p>
          <p className="text-emerald-400 tabular-nums mt-0.5">+${formatUsdWhole(w.pnl30d || 0)}</p>
        </div>
        <div className="border border-[#1F2937] p-1.5 bg-[#0D1117]">
          <p className="text-[9px] text-gray-500 uppercase tracking-wide">30D ROI VS SIZE</p>
          <p className="text-gray-100 tabular-nums mt-0.5">
            {w.roi30dVsAvgSize != null ? `${Number(w.roi30dVsAvgSize).toFixed(2)}×` : "—"}
          </p>
        </div>
        <div className="border border-[#1F2937] p-1.5 bg-[#0D1117]">
          <p className="text-[9px] text-gray-500 uppercase tracking-wide">AVG POSITION</p>
          <p className="text-gray-100 tabular-nums mt-0.5">
            {w.avgPositionSize != null ? `$${formatUsdWhole(w.avgPositionSize)}` : "—"}
          </p>
        </div>
        <div className="border border-[#1F2937] p-1.5 bg-[#0D1117]">
          <p className="text-[9px] text-gray-500 uppercase tracking-wide">TRADES / RECENT</p>
          <p className="text-gray-100 tabular-nums mt-0.5">
            {w.totalTrades ?? "—"} <span className="text-gray-500">/ {w.recentHits ?? "—"}</span>
          </p>
        </div>
        <div className="border border-[#1F2937] p-1.5 bg-[#0D1117]">
          <p className="text-[9px] text-gray-500 uppercase tracking-wide">LAST SEEN</p>
          <p className="text-gray-300 mt-0.5">{w.lastSeen ? formatDateTime(w.lastSeen) : "—"}</p>
        </div>
        <div className="border border-[#1F2937] p-1.5 bg-[#0D1117]">
          <p className="text-[9px] text-gray-500 uppercase tracking-wide">ROW UPDATED</p>
          <p className="text-gray-300 mt-0.5">
            {w.smartWalletRowUpdatedAt ? formatDateTime(w.smartWalletRowUpdatedAt) : "—"}
          </p>
        </div>
      </div>

      <div>
        <p className="text-[9px] uppercase tracking-widest text-gray-500 mb-1">SCORES (smart_wallets)</p>
        <div className="grid grid-cols-3 gap-1 text-[10px]">
          <div className="border border-[#1F2937] p-1.5 bg-[#0D1117] text-center">
            <p className="text-[9px] text-gray-500">EARLY</p>
            <p className="text-amber-400">{w.earlyEntryScore != null ? Math.round(w.earlyEntryScore) : "—"}</p>
          </div>
          <div className="border border-[#1F2937] p-1.5 bg-[#0D1117] text-center">
            <p className="text-[9px] text-gray-500">CLUSTER</p>
            <p className="text-amber-400">{w.clusterScore != null ? Math.round(w.clusterScore) : "—"}</p>
          </div>
          <div className="border border-[#1F2937] p-1.5 bg-[#0D1117] text-center">
            <p className="text-[9px] text-gray-500">CONSISTENCY</p>
            <p className="text-amber-400">{w.consistencyScore != null ? Math.round(w.consistencyScore) : "—"}</p>
          </div>
        </div>
      </div>

      <div className="border border-[#1F2937] bg-[#0D1117] p-2">
        <p className="text-[9px] font-semibold text-gray-300 mb-1 uppercase tracking-wide">BEST RESOLVED SIGNAL</p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-gray-200">
          <span>
            MAX:{" "}
            {w.bestTradePct != null ? <span className="text-emerald-400">+{fmtNum(w.bestTradePct)}%</span> : "—"}
          </span>
          {w.bestTradeMint ? (
            <span className="min-w-0">
              TOKEN:{" "}
              <Link className="text-indigo-400 hover:text-indigo-300" href={`/token/${w.bestTradeMint}`}>
                {w.bestTradeMint}
              </Link>
            </span>
          ) : null}
          {w.bestTradeAt ? <span className="text-gray-500">@ {formatDateTime(w.bestTradeAt)}</span> : null}
        </div>
      </div>

      {p ? (
        <div className="border border-[#1F2937] bg-[#0D1117] p-2 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <p className="text-[9px] font-semibold text-gray-300 uppercase tracking-wide">BEHAVIOR (wallet_behavior_stats)</p>
            {lowSample(p) ? (
              <span className="text-[9px] px-1 py-0.5 border border-amber-700 text-amber-400">{`[!] LOW N<${MIN_H}`}</span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-[10px] text-gray-300">
            <p>
              WR FINAL: {p.winRateReal != null ? `${fmtNum(p.winRateReal)}%` : "—"}{" "}
              <span className="text-gray-600">(cierre señal)</span>
            </p>
            <p>
              5M: {p.winRateReal5m != null ? `${fmtNum(p.winRateReal5m)}%` : "—"} (N {p.resolvedSignals5m ?? 0})
            </p>
            <p>
              30M: {p.winRateReal30m != null ? `${fmtNum(p.winRateReal30m)}%` : "—"} (N {p.resolvedSignals30m ?? 0})
            </p>
            <p>
              2H: {p.winRateReal2h != null ? `${fmtNum(p.winRateReal2h)}%` : "—"} (N {p.resolvedSignals2h ?? 0})
            </p>
            <p>RESOLVED: {p.resolvedSignals ?? "—"}</p>
            <p>STYLE: {p.styleLabel || "—"}</p>
          </div>
          <p className="text-[10px] text-gray-500 leading-relaxed">
            PRE-PUMP {formatPrePumpUsd(p.avgSizePrePumpUsd || 0).text}{" "}
            <span className="text-gray-600">(solo señales ≥ +20%)</span> · LAT{" "}
            {(() => {
              const { text, unreliable } = formatLatencyPostDeployMin(p.avgLatencyPostDeployMin);
              return unreliable ? "—" : text;
            })()}{" "}
            · SOLO/GRP {Math.round(Number(p.soloBuyRatio || 0) * 100)}% / {Math.round(Number(p.groupBuyRatio || 0) * 100)}% · ANT/BRK{" "}
            {Math.round(Number(p.anticipatoryBuyRatio || 0) * 100)}% /{" "}
            {Math.round(Number(p.breakoutBuyRatio || 0) * 100)}%
          </p>
          <p className="text-[9px] text-gray-600 leading-snug border-l border-[#1F2937] pl-1.5">
            {locale === "es" ? BEHAVIOR_LEGEND_ES : BEHAVIOR_LEGEND_EN}
          </p>
          {p.computedAt ? <p className="text-[9px] text-gray-600">COMPUTED: {formatDateTime(p.computedAt)}</p> : null}
        </div>
      ) : (
        <p className="text-[10px] text-gray-500">NO wallet_behavior_stats ROW.</p>
      )}

      <p className="text-[9px] text-gray-600 leading-relaxed">
        {labelFor?.(w.wallet) != null
          ? `DISPLAY: ${labelFor(w.wallet)}. FAVORITES = LOCAL ONLY.`
          : "FAVORITES = LOCAL ONLY."}
      </p>
    </div>
  );
}
