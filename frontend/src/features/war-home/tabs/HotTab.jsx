import Link from "next/link";
import { BarChart3, Flame, TrendingUp, Waves } from "lucide-react";
import { formatUsdWhole } from "../../../../lib/formatStable";
import { LiveCardOverlay } from "../../../../components/home/LiveCardOverlay";
import { WatchedCardShell } from "../../../../components/home/WatchedCardShell";
import { buildJupiterSwapUrl } from "../../../../lib/jupiterSwap";
import { isProbableSolanaMint } from "../../../../lib/solanaMint";
import { AnimatedNumber } from "../../../../components/ui/AnimatedNumber";
import {
  actionTone,
  clusterHeatEmoji,
  computeSignalStrength,
  confidenceLabel,
  confidenceTone,
  entryWindowFromCountdown,
  evidenceChipsEmoji,
  gradeClass,
  heatClass,
  suggestedAction
} from "@/lib/signalUtils";
import { redFlagsForSignal } from "@/lib/redFlags";
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
  entryCountdownByMint,
  trendingRankDeltas,
  selectedMint,
  onSelectMint
}) {
  return (
    <section className="sl-section">
      <div className="glass-card sl-inset">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500/25 to-amber-600/15 border border-orange-500/25 flex items-center justify-center shrink-0">
              <Flame className="text-orange-300" size={22} />
            </div>
            <div>
              <p className="sl-label">Hot Tokens</p>
              <button
                type="button"
                onClick={onToggleHeatExpanded}
                className="sl-h2 text-white mt-0.5 text-left hover:text-orange-200 transition-colors"
              >
                Heat-ranked · decision-ready {heatExpanded ? "[-]" : "[+]"}
              </button>
              <p className="sl-body sl-muted mt-2 max-w-xl text-sm">Score, window, chips, one-click buy — scan fast.</p>
              <p className="text-[11px] text-gray-500 mt-1">
                {heatTokensForGrid.length} cards visible · {heatTokenPool.length} ranked
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start md:items-end gap-1.5">
            <button
              type="button"
              onClick={onToggleHeatExpanded}
              className="text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border border-orange-500/35 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20"
            >
              {heatExpanded ? "Compact view" : "Expand heat board"}
            </button>
            <span
              className={`text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${
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
            <span className="text-[11px] text-gray-500">
              {feedAgeSec === null ? "fresh" : `${feedAgeSec}s ago`} · refresh {isWarMode ? "5s" : "25s"} · min liq $
              {formatUsdWhole(trendingMinLiquidityUsd || 15000)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
          {heatTokensForGrid.map((token, idx) => {
            const signalStrength = computeSignalStrength(token);
            const action = suggestedAction(signalStrength, strategyMode, "token");
            const confluence = signalStrength >= 85 && Number(token?.change || 0) > 5;
            const timeAdvantage = Math.max(52, Math.min(97, 100 - Math.round(signalStrength / 2)));
            const tokenWindow = entryWindowFromCountdown(entryCountdownByMint[token?.mint] || 0);
            const changeNum = Number(token?.change || 0);
            const redFlags = redFlagsForSignal({ signalStrength, token: token || {} });
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
                baseClassName={`glass-card p-3 rounded-xl flex flex-col gap-2 transition-transform duration-200 ${
                  token?.mint ? "hover:scale-[1.01] hover:shadow-[0_0_10px_rgba(139,92,246,0.4)]" : "opacity-75"
                } ${token?.mint && isProbableSolanaMint(token.mint) ? "cursor-pointer" : ""} ${
                  selectedMint && token?.mint === selectedMint ? "ring-2 ring-cyan-500/40" : ""
                }`}
                watchedClassName="ring-1 ring-emerald-500/50 shadow-[0_0_18px_rgba(16,185,129,0.18)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {token?.mint ? (
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <RankBadge rank={trendingRank.rank} />
                        <RankDeltaChip delta={trendingRank.delta} isNew={trendingRank.isNew} />
                      </div>
                    ) : null}
                    <p className="text-base font-bold text-white tracking-tight truncate">{token?.symbol || "Loading"}</p>
                    <p className="text-[10px] text-gray-500 font-mono truncate">
                      {token?.mint ? `${token.mint.slice(0, 4)}…${token.mint.slice(-4)}` : "…"}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full border ${gradeClass(token?.grade || "C")}`}>
                    {token?.grade || "…"}
                  </span>
                </div>

                {(token?.narrativeTags || []).length ? (
                  <div className="flex flex-wrap gap-1">
                    {(token?.narrativeTags || []).slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-violet-500/30 bg-violet-500/10 text-violet-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-2 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[9px] uppercase tracking-wider text-gray-500">Score</span>
                    <span className="text-emerald-300 font-bold font-mono tabular-nums text-xs">{signalStrength}/100</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-900 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400" style={{ width: `${signalStrength}%` }} />
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${actionTone(signalStrength)} ${signalStrength > 90 ? "animate-pulse" : ""}`}>
                      {action}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${confidenceTone(signalStrength)}`}>
                      {confidenceLabel(signalStrength)}
                    </span>
                    {confluence ? (
                      <span className="text-[10px] text-violet-200 bg-violet-500/10 border border-violet-500/25 rounded px-1.5 py-0.5">
                        🧬
                      </span>
                    ) : null}
                  </div>
                </div>

                {token?.mint ? <LiveCardOverlay mint={token.mint} /> : null}

                <div className="flex items-baseline justify-between gap-2 text-[11px] font-mono">
                  <span className="text-white truncate">
                    <AnimatedNumber value={Number(token?.price || 0)} prefix="$" decimalPlaces={6} />
                  </span>
                  <span className={changeNum >= 0 ? "text-emerald-400" : "text-red-400"}>
                    <AnimatedNumber value={changeNum} decimalPlaces={1} prefix={changeNum >= 0 ? "+" : ""} suffix="%" />
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                  <div className="flex items-center gap-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] px-2 py-1.5">
                    <BarChart3 size={12} className="text-cyan-400 shrink-0" />
                    <span className="text-gray-100 truncate">${formatUsdWhole(token?.volume24h || 0)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] px-2 py-1.5">
                    <Waves size={12} className="text-purple-300 shrink-0" />
                    <span className="text-gray-200 truncate">{token?.flowLabel || "flow…"}</span>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[10px] text-gray-500">
                    <span>Heat</span>
                    <span className="leading-none">{clusterHeatEmoji(Math.min(99, signalStrength - 4))}</span>
                  </div>
                  <div className="h-1 rounded-full bg-gray-900 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${heatClass(Math.min(99, signalStrength - 4))}`}
                      style={{ width: `${Math.min(99, signalStrength - 4)}%` }}
                    />
                  </div>
                </div>

                <p className="text-[10px] text-gray-500 truncate">
                  Earlier than {timeAdvantage}% · <span className={tokenWindow.tone}>{tokenWindow.label}</span>
                </p>

                {redFlags.length ? <p className="text-[10px] text-red-200 truncate">⚠ {redFlags.join(" · ")}</p> : null}

                <div className="flex flex-wrap gap-1">
                  {evidenceChipsEmoji(signalStrength, token || {})
                    .slice(0, 4)
                    .map((chip) => (
                      <span key={chip} className="text-[10px] px-1.5 py-0.5 rounded-full border border-white/12 bg-white/[0.03] text-gray-300">
                        {chip}
                      </span>
                    ))}
                </div>

                <div className="mt-auto pt-1 space-y-1.5 border-t border-white/[0.04]">
                  <div className="grid grid-cols-3 gap-1">
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
                          className={`text-[10px] text-center px-1.5 py-1 rounded-md border font-mono ${
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
                      className="w-full py-1.5 text-center bg-purple-600/20 rounded-md text-[11px] hover:bg-purple-600/40 transition-transform hover:scale-[1.01] inline-flex items-center justify-center gap-1.5 text-gray-100 no-underline"
                    >
                      <TrendingUp size={12} />
                      Scout →
                    </Link>
                  ) : (
                    <p
                      className="w-full py-1.5 text-center rounded-md border border-white/10 bg-white/[0.02] text-[10px] text-gray-500"
                      title="No mint on the card yet — cannot open the token terminal."
                    >
                      Scout · mint pending
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
