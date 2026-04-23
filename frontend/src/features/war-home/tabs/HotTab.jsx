import Link from "next/link";
import { BarChart3, ChevronsDown, ChevronsUp, Flame, TrendingUp, Waves } from "lucide-react";
import { formatUsdWhole } from "../../../../lib/formatStable";
import { LiveCardOverlay } from "../../../../components/home/LiveCardOverlay";
import { WatchedCardShell } from "../../../../components/home/WatchedCardShell";
import { buildJupiterSwapUrl } from "../../../../lib/jupiterSwap";
import { isProbableSolanaMint } from "../../../../lib/solanaMint";
import { AnimatedNumber } from "../../../../components/ui/AnimatedNumber";
import {
  clusterHeatEmoji,
  computeSignalStrength,
  confidenceLabel,
  confidenceTone,
  gradeClass,
  heatClass,
  suggestedAction
} from "@/lib/signalUtils";
import { redFlagsForSignal } from "@/lib/redFlags";
import { UI_CONFIG } from "@/constants/homeData";
import { RankBadge, RankDeltaChip } from "./RankIndicators";

function cockpitCardClickTargetIsInteractive(e) {
  const el = e?.target;
  if (!el || typeof el.closest !== "function") return true;
  return Boolean(el.closest("a, button"));
}

export function HotTab({
  heatExpanded,
  onToggleHeatExpanded,
  heatTokensForGrid,
  heatTokenPool,
  feedStatus,
  feedIsLive,
  feedLabel,
  feedAgeSec,
  isWarMode,
  trendingMinLiquidityUsd,
  strategyMode,
  trendingRankDeltas,
  selectedMint,
  onSelectMint
}) {
  return (
    <section className="sl-section">
      <div className="glass-card sl-glow-heat p-3 sm:p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500/25 to-amber-600/15 border border-orange-500/25 flex items-center justify-center shrink-0">
              <Flame className="text-orange-300" size={18} />
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest text-gray-500 font-semibold">Hot Tokens</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
                <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">Heat</h2>
                <button
                  type="button"
                  onClick={onToggleHeatExpanded}
                  aria-expanded={heatExpanded}
                  aria-label={heatExpanded ? "Contraer cuadrícula" : "Ampliar cuadrícula"}
                  title={heatExpanded ? "Contraer" : "Ampliar feed"}
                  className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.12] bg-gradient-to-b from-orange-500/[0.12] to-white/[0.02] text-orange-200/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all hover:border-orange-400/50 hover:from-orange-500/22 hover:to-amber-950/30 hover:text-orange-50 hover:shadow-[0_0_22px_rgba(251,146,60,0.2)] active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0806]"
                >
                  {heatExpanded ? (
                    <ChevronsUp className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                  ) : (
                    <ChevronsDown className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1 max-w-xl leading-snug">
                Ranking en vivo por score del API: mejor token arriba. Métricas reales, swap y ficha en un clic.
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {heatTokensForGrid.length} vis · {heatTokenPool.length} ranked
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start md:items-end gap-1">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border inline-flex items-center gap-1 ${
                feedStatus === "SNAPSHOT"
                  ? "bg-slate-500/15 text-slate-200 border-slate-400/30"
                  : feedIsLive
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-200 border-amber-500/30"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  feedStatus === "SNAPSHOT"
                    ? "bg-slate-300"
                    : feedIsLive
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-amber-400"
                }`}
              />
              {feedLabel}
            </span>
            <span className="text-[10px] text-gray-500">
              {feedAgeSec === null ? "recién" : `hace ${feedAgeSec}s`} · {isWarMode ? "cada 5s" : "cada 25s"} · liq min $
              {formatUsdWhole(trendingMinLiquidityUsd || 15000)}
            </span>
          </div>
        </div>

        <div className={UI_CONFIG.LIVE_HOT_GRID_CLASS}>
          {heatTokensForGrid.map((token, idx) => {
            const signalStrength = Number.isFinite(Number(token?.sentinelScore))
              ? Math.max(1, Math.min(100, Math.round(Number(token.sentinelScore))))
              : computeSignalStrength(token);
            const action =
              token?.decision === "MERCADO"
                ? "Solo mercado"
                : token?.decision || suggestedAction(signalStrength, strategyMode, "token");
            const confluence = Boolean(token?.confluence);
            const timeAdvantage = token?.timeAdvantage || null;
            const entryWindowLabel = token?.entryWindow || null;
            const entryWindowMinutesLeft = Number(token?.entryWindowMinutesLeft);
            const changeNum = Number(token?.change || 0);
            const redFlags = Array.isArray(token?.redFlags) ? token.redFlags : redFlagsForSignal({ signalStrength, token: token || {} });
            const trendingRank = trendingRankDeltas.get(token?.mint) || { rank: idx + 1, delta: 0, isNew: false };

            return (
              <WatchedCardShell
                key={`${token?.mint || "token"}-${idx}`}
                mint={token?.mint}
                translate="no"
                title={token?.mint && isProbableSolanaMint(token.mint) ? "Click to show on desk (?t=)" : undefined}
                onClick={(e) => {
                  if (!token?.mint || !isProbableSolanaMint(token.mint)) return;
                  if (cockpitCardClickTargetIsInteractive(e)) return;
                  e.preventDefault();
                  onSelectMint(token.mint);
                }}
                baseClassName={`glass-card sl-glow-heat p-1.5 sm:p-2 rounded-lg flex flex-col gap-1 touch-manipulation transition-all duration-200 ${
                  token?.mint
                    ? "hover:-translate-y-[1px] hover:border-violet-400/45 hover:shadow-[0_0_16px_rgba(139,92,246,0.32)]"
                    : "opacity-75"
                } ${token?.mint && isProbableSolanaMint(token.mint) ? "cursor-pointer" : ""} ${
                  selectedMint && token?.mint === selectedMint ? "ring-2 ring-cyan-500/40" : ""
                }`}
                watchedClassName="ring-1 ring-emerald-500/50 shadow-[0_0_18px_rgba(16,185,129,0.18)]"
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    {token?.mint ? (
                      <div className="flex items-center gap-1 mb-0">
                        <RankBadge rank={trendingRank.rank} />
                        <RankDeltaChip delta={trendingRank.delta} isNew={trendingRank.isNew} />
                      </div>
                    ) : null}
                    <p className="text-xs font-bold text-white tracking-tight truncate leading-tight">{token?.symbol || "Loading"}</p>
                    <p className="text-[9px] text-gray-500 font-mono truncate">
                      {token?.mint ? `${token.mint.slice(0, 4)}…${token.mint.slice(-4)}` : "…"}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${gradeClass(token?.grade || "C")}`}>
                    {token?.grade || "…"}
                  </span>
                </div>

                {(token?.narrativeTags || []).length ? (
                  <div className="flex flex-wrap gap-0.5">
                    {(token?.narrativeTags || []).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[9px] px-1 py-0.5 rounded border border-violet-500/30 bg-violet-500/10 text-violet-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="rounded border border-white/[0.08] bg-white/[0.02] px-1.5 py-1 space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[7px] uppercase tracking-wider text-gray-500">Score</span>
                    <span className="text-emerald-300 font-bold font-mono tabular-nums text-[10px]">{signalStrength}/100</span>
                  </div>
                  <div className="h-0.5 sm:h-1 rounded-full bg-gray-900 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400" style={{ width: `${signalStrength}%` }} />
                  </div>
                  <div className="flex flex-wrap items-center gap-0.5">
                    <span
                      className={`text-[8px] font-bold px-1 py-0.5 rounded border ${
                        signalStrength >= 85
                          ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
                          : signalStrength >= 65
                            ? "text-amber-200 bg-amber-500/10 border-amber-500/30"
                            : "text-red-300 bg-red-500/10 border-red-500/30"
                      } ${signalStrength > 90 ? "animate-pulse" : ""}`}
                    >
                      {action}
                    </span>
                    <span className={`text-[9px] px-1 py-0.5 rounded border ${confidenceTone(signalStrength)}`}>
                      {confidenceLabel(signalStrength)}
                    </span>
                    {confluence ? (
                      <span className="text-[9px] text-violet-200 bg-violet-500/10 border border-violet-500/25 rounded px-1 py-0.5">
                        🧬
                      </span>
                    ) : null}
                  </div>
                </div>

                {token?.mint ? <LiveCardOverlay mint={token.mint} /> : null}

                <div className="flex items-baseline justify-between gap-2 text-[10px] font-mono">
                  <span className="text-white truncate">
                    <AnimatedNumber value={Number(token?.price || 0)} prefix="$" decimalPlaces={6} />
                  </span>
                  <span className={changeNum >= 0 ? "text-emerald-400" : "text-red-400"}>
                    <AnimatedNumber value={changeNum} decimalPlaces={1} prefix={changeNum >= 0 ? "+" : ""} suffix="%" />
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1 text-[9px]">
                  <div className="flex items-center gap-1 rounded bg-white/[0.03] border border-white/[0.06] px-1.5 py-1">
                    <BarChart3 size={11} className="text-cyan-400 shrink-0" />
                    <span className="text-gray-100 truncate">${formatUsdWhole(token?.volume24h || 0)}</span>
                  </div>
                  <div className="flex items-center gap-1 rounded bg-white/[0.03] border border-white/[0.06] px-1.5 py-1">
                    <Waves size={11} className="text-purple-300 shrink-0" />
                    <span className="text-gray-200 truncate">{token?.flowLabel || "—"}</span>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[9px] text-gray-500">
                    <span>Heat</span>
                    <span className="leading-none">{clusterHeatEmoji(Math.min(99, signalStrength - 4))}</span>
                  </div>
                  <div className="h-0.5 rounded-full bg-gray-900 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${heatClass(Math.min(99, signalStrength - 4))}`}
                      style={{ width: `${Math.min(99, signalStrength - 4)}%` }}
                    />
                  </div>
                </div>

                {timeAdvantage || entryWindowLabel ? (
                  <p className="text-[9px] text-gray-500 truncate">
                    {timeAdvantage ? `${timeAdvantage}` : ""}
                    {timeAdvantage && entryWindowLabel ? " · " : ""}
                    {entryWindowLabel ? (
                      <>
                        <span className="text-slate-300">{entryWindowLabel}</span>
                        {Number.isFinite(entryWindowMinutesLeft) ? ` (${Math.max(0, Math.round(entryWindowMinutesLeft))}m)` : ""}
                      </>
                    ) : null}
                  </p>
                ) : null}

                {redFlags.length ? <p className="text-[9px] text-red-200/95 truncate leading-tight">⚠ {redFlags.join(" · ")}</p> : null}

                <div className="flex flex-wrap gap-0.5">
                  {(Array.isArray(token?.evidenceChips) ? token.evidenceChips : [])
                    .slice(0, 5)
                    .map((chip) => (
                      <span key={chip} className="text-[9px] px-1 py-0.5 rounded border border-white/10 bg-white/[0.02] text-gray-300">
                        {chip}
                      </span>
                    ))}
                </div>

                <div className="mt-auto pt-0.5 space-y-1 border-t border-white/[0.04]">
                  <div className="grid grid-cols-3 gap-0.5">
                    {[0.5, 1, 5].map((size) => {
                      const canSwap = token?.mint && isProbableSolanaMint(token.mint);
                      return (
                        <a
                          key={size}
                          href={canSwap ? buildJupiterSwapUrl(token.mint, size) : "#"}
                          target="_blank"
                          rel="noreferrer"
                          aria-disabled={!canSwap}
                          onClick={(e) => {
                            if (!canSwap) e.preventDefault();
                          }}
                          className={`text-[9px] text-center px-1 py-0.5 rounded border font-mono ${
                            canSwap
                              ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
                              : "border-white/10 bg-white/[0.03] text-gray-600 cursor-not-allowed pointer-events-none"
                          }`}
                        >
                          {size} SOL
                        </a>
                      );
                    })}
                  </div>
                  {token?.mint && isProbableSolanaMint(token.mint) ? (
                    <Link
                      href={`/token/${token.mint}`}
                      className="w-full py-1 text-center bg-purple-600/20 rounded border border-purple-500/20 text-[10px] hover:bg-purple-600/40 transition-transform hover:scale-[1.01] inline-flex items-center justify-center gap-1 text-gray-100 no-underline"
                    >
                      <TrendingUp size={11} />
                      Scout
                    </Link>
                  ) : (
                    <p
                      className="w-full py-1 text-center rounded border border-white/10 bg-white/[0.02] text-[9px] text-gray-500"
                      title="No mint on the card yet — cannot open the token terminal."
                    >
                      Scout · mint
                    </p>
                  )}
                </div>
              </WatchedCardShell>
            );
          })}
        </div>
      </div>
    </section>
  );
}
