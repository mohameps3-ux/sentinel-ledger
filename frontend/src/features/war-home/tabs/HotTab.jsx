import Link from "next/link";
import { ChevronsDown, ChevronsUp, Flame, TrendingUp } from "lucide-react";
import { formatUsdWhole } from "../../../../lib/formatStable";
import { LiveCardOverlay } from "../../../../components/home/LiveCardOverlay";
import { RealtimeTokenCardShell } from "../../../../components/home/RealtimeTokenCardShell";
import { RulePerformanceBadge } from "../../../../components/signals/RulePerformanceBadge";
import { buildJupiterSwapUrl, EXTERNAL_ANCHOR_REL } from "../../../../lib/terminalLinks";
import { isProbableSolanaMint } from "../../../../lib/solanaMint.mjs";
import { AnimatedNumber } from "../../../../components/ui/AnimatedNumber";
import {
  computeSignalStrength,
  confidenceTone,
  gradeClass,
  suggestedAction
} from "@/lib/signalUtils";
import { redFlagsForSignal } from "@/lib/redFlags";
import { UI_CONFIG } from "@/constants/homeData";
import { RankBadge, RankDeltaChip } from "./RankIndicators";
import { useLocale } from "../../../../contexts/LocaleContext";

function cockpitCardClickTargetIsInteractive(e) {
  const el = e?.target;
  if (!el || typeof el.closest !== "function") return true;
  return Boolean(el.closest("a, button, summary, details"));
}

function normalizeSignalDecision(action) {
  const raw = String(action || "").trim().toUpperCase();
  if (["ACCUMULATE", "ENTER NOW", "ENTER_NOW", "BUY", "LONG"].includes(raw)) return "ACCUMULATE";
  if (["WATCH", "PREPARE"].includes(raw)) return "WATCH";
  if (["TOO_LATE", "TOO LATE", "STAY OUT", "STAY_OUT", "AVOID", "MARKET_ONLY"].includes(raw)) return "TOO_LATE";
  return raw;
}

function accentColorForDecision(decision, score) {
  const n = Number(score);
  if (decision === "ACCUMULATE") return "#10B981";
  if (decision === "WATCH") return "#F59E0B";
  if (decision === "TOO_LATE") return "#DC2626";
  if (n >= 60) return "#10B981";
  if (n >= 40) return "#F59E0B";
  return "#DC2626";
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
  const { t } = useLocale();

  const feedLabelTr =
    feedLabel === "SNAPSHOT"
      ? t("war.hot.feedSnapshot")
      : feedLabel === "LIVE-DEGRADED"
        ? t("war.hot.feedDegraded")
        : feedLabel === "LIVE"
          ? t("war.hot.feedLive")
          : feedLabel;

  const confidenceTr = (signalStrength) => {
    if (signalStrength >= 95) return t("war.live.confidence.strong");
    if (signalStrength >= 80) return t("war.live.confidence.build");
    return t("war.live.confidence.low");
  };

  return (
    <section className="sl-section">
      <div className="glass-card sl-glow-heat p-3 sm:p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 bg-gradient-to-br from-orange-500/25 to-amber-600/15 border border-orange-500/25 flex items-center justify-center shrink-0">
              <Flame className="text-orange-300" size={18} />
            </div>
            <div>
              <p className="sl-label text-[9px] !text-sl-muted tracking-[0.14em]">{t("war.hot.label")}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
                <h2 className="text-base sm:text-lg font-semibold text-sl-text tracking-tight leading-tight">Heat</h2>
                <button
                  type="button"
                  onClick={onToggleHeatExpanded}
                  aria-expanded={heatExpanded}
                  aria-label={heatExpanded ? t("war.live.collapseAria") : t("war.live.expandAria")}
                  title={heatExpanded ? t("war.live.collapseTitle") : t("war.live.expandTitle")}
                  className="group relative flex h-9 w-9 shrink-0 items-center justify-center border border-white/[0.12] bg-gradient-to-b from-orange-500/[0.12] to-sl-card text-orange-200/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all hover:border-orange-400/50 hover:from-orange-500/22 hover:to-amber-950/30 hover:text-orange-50 hover:shadow-[0_0_22px_rgba(251,146,60,0.2)] active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0806]"
                >
                  {heatExpanded ? (
                    <ChevronsUp className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                  ) : (
                    <ChevronsDown className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                  )}
                </button>
              </div>
              <p className="text-xs text-sl-muted mt-1 max-w-xl leading-snug">{t("war.hot.sub")}</p>
              <p className="text-[10px] text-sl-muted mt-0.5">
                {t("war.hot.visLine", { vis: heatTokensForGrid.length, pool: heatTokenPool.length })}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start md:items-end gap-1">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 border inline-flex items-center gap-1 ${
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
              {feedLabelTr}
            </span>
            <span className="text-[10px] text-sl-muted">
              {feedAgeSec === null ? t("war.hot.recently") : t("war.live.secondsAgo", { sec: feedAgeSec })} ·{" "}
              {isWarMode ? t("war.hot.pollHotWar") : t("war.hot.pollHotNormal")} · {t("war.hot.minLiq")} $
              {formatUsdWhole(trendingMinLiquidityUsd || 15000)}
            </span>
          </div>
        </div>

        <div className={UI_CONFIG.LIVE_HOT_GRID_CLASS}>
          {heatTokensForGrid.map((token, idx) => {
            const signalStrength = Number.isFinite(Number(token?.sentinelScore))
              ? Math.max(1, Math.min(100, Math.round(Number(token.sentinelScore))))
              : computeSignalStrength(token);
            const actionKey =
              token?.decision === "MERCADO" ? "MARKET_ONLY" : token?.decision || suggestedAction(signalStrength, strategyMode, "token");
            let actionLabel = actionKey;
            if (actionKey === "MARKET_ONLY") actionLabel = t("war.live.decisionMarketOnly");
            else if (actionKey === "ENTER NOW") actionLabel = t("war.live.decision.enter");
            else if (actionKey === "PREPARE") actionLabel = t("war.live.decision.prepare");
            else if (actionKey === "STAY OUT") actionLabel = t("war.live.decision.stayout");
            const decision = normalizeSignalDecision(actionKey);
            const accentColor = accentColorForDecision(decision, signalStrength);
            const confluence = Boolean(token?.confluence);
            const timeAdvantage = token?.timeAdvantage || null;
            const entryWindowLabel = token?.entryWindow || null;
            const entryWindowMinutesLeft = Number(token?.entryWindowMinutesLeft);
            const timeLeft = Number.isFinite(entryWindowMinutesLeft) ? Math.max(0, Math.round(entryWindowMinutesLeft)) : 0;
            const changeNum = Number(token?.change || 0);
            const redFlags = Array.isArray(token?.redFlags) ? token.redFlags : redFlagsForSignal({ signalStrength, token: token || {} });
            const trendingRank = trendingRankDeltas.get(token?.mint) || { rank: idx + 1, delta: 0, isNew: false };

            return (
              <RealtimeTokenCardShell
                key={`${token?.mint || "token"}-${idx}`}
                mint={token?.mint}
                staticScore={signalStrength}
                actionKey={actionKey}
                smartMoneyCount={token?.smartWallets}
                translate="no"
                title={token?.mint && isProbableSolanaMint(token.mint) ? t("war.hot.clickDesk") : undefined}
                onClick={(e) => {
                  if (!token?.mint || !isProbableSolanaMint(token.mint)) return;
                  if (cockpitCardClickTargetIsInteractive(e)) return;
                  e.preventDefault();
                  onSelectMint(token.mint, {
                    src: "hot",
                    tr: signalStrength,
                    sw: Math.max(0, Math.round(Number(token?.smartWallets || 0)))
                  });
                }}
                baseClassName={`terminal-card-interactive group mb-2 sl-home-card-compact sl-terminal-shell sl-terminal-shell--heat glass-card p-1.5 sm:p-2 flex flex-col gap-1 touch-manipulation transition-all duration-200 hover:max-h-none ${
                  token?.mint
                    ? "hover:-translate-y-[1px] hover:border-violet-400/45 hover:shadow-[0_0_16px_rgba(139,92,246,0.32)]"
                    : "opacity-75"
                } ${token?.mint && isProbableSolanaMint(token.mint) ? "cursor-pointer" : ""} ${
                  selectedMint && token?.mint === selectedMint ? "ring-2 ring-cyan-500/40" : ""
                }`}
                style={{ borderLeft: `3px solid ${accentColor}` }}
                watchedClassName="ring-1 ring-emerald-500/50 shadow-[0_0_18px_rgba(16,185,129,0.18)]"
              >
                {({ displayScore, smartMoneyCount }) => (
                  <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {token?.mint ? (
                      <div className="flex items-center gap-1 mb-0">
                        <RankBadge rank={trendingRank.rank} />
                        <RankDeltaChip delta={trendingRank.delta} isNew={trendingRank.isNew} />
                      </div>
                    ) : null}
                    <p className="text-xs font-bold text-sl-text tracking-tight truncate leading-tight">{token?.symbol || "Loading"}</p>
                  </div>
                  <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border ${gradeClass(token?.grade || "C")}`}>
                    {token?.grade || "…"}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="h-1 rounded-full bg-sl-card overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400" style={{ width: `${displayScore}%` }} />
                  </div>
                  <div className="flex flex-wrap items-center gap-0.5">
                    <span className="font-mono text-[11px] font-bold tabular-nums text-sl-text">
                      <AnimatedNumber value={displayScore} decimalPlaces={0} />/100
                    </span>
                    <span
                      className={`text-[8px] font-bold px-1 py-0.5 rounded border ${
                        signalStrength >= 85
                          ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
                          : signalStrength >= 65
                            ? "text-amber-200 bg-amber-500/10 border-amber-500/30"
                            : "text-red-300 bg-red-500/10 border-red-500/30"
                      } ${signalStrength > 90 ? "animate-pulse" : ""}`}
                    >
                      {actionLabel}
                    </span>
                    <span className={`text-[9px] px-1 py-0.5 rounded border ${confidenceTone(signalStrength)}`}>
                      {confidenceTr(signalStrength)}
                    </span>
                    {confluence ? <span className="text-[8px] text-violet-200 bg-violet-500/10 border border-violet-500/25 rounded px-1 py-0.5">multi</span> : null}
                    {smartMoneyCount > 0 ? (
                      <span className="text-[8px] px-1 py-0.5 rounded border border-indigo-400/40 bg-indigo-500/12 text-indigo-100 font-mono font-bold">
                        {smartMoneyCount} SM
                      </span>
                    ) : null}
                    <RulePerformanceBadge performance={token?.rulePerformance} compact />
                  </div>
                  <div className="score-track mx-3 mb-2">
                    <div
                      className={displayScore >= 60 ? "score-fill-high" : displayScore >= 40 ? "score-fill-mid" : "score-fill-low"}
                      style={{ width: `${Math.min(displayScore, 100)}%` }}
                    />
                  </div>
                </div>

                {token?.mint ? <LiveCardOverlay mint={token.mint} /> : null}

                <div className="flex items-baseline justify-between gap-2 text-[10px] font-mono">
                  <span className="text-sl-text truncate">
                    <AnimatedNumber value={Number(token?.price || 0)} prefix="$" decimalPlaces={6} />
                  </span>
                  <span className={changeNum >= 0 ? "text-emerald-400" : "text-red-400"}>
                    <AnimatedNumber value={changeNum} decimalPlaces={1} prefix={changeNum >= 0 ? "+" : ""} suffix="%" />
                  </span>
                </div>

                {timeAdvantage || entryWindowLabel ? (
                  <span className="font-mono text-2xs text-sl-muted">
                    {entryWindowLabel === "CLOSED" || timeLeft <= 0 ? "CLOSED" : `${timeLeft}m`}
                  </span>
                ) : null}

                {redFlags.length ? <p className="text-[9px] text-red-200/95 truncate leading-tight">⚠ {redFlags.join(" · ")}</p> : null}

                <details className="border-t border-sl-border">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 w-full font-mono text-2xs text-sl-muted hover:text-sl-sub transition-colors duration-150">
                    <span>WHY NOW</span>
                    <span className="ml-auto">▼</span>
                  </summary>
                  <div className="px-3 pb-3 space-y-1">
                    {[
                      ...(Array.isArray(token?.narrativeTags) ? token.narrativeTags : []),
                      ...(Array.isArray(token?.evidenceChips) ? token.evidenceChips : [])
                    ].slice(0, 5).map((r, i) => (
                      <div key={`${r}-${i}`} className="flex items-start gap-2">
                        <span className="text-sl-violet font-mono text-xs mt-0.5">›</span>
                        <span className="font-ui text-xs text-sl-sub">{r}</span>
                      </div>
                    ))}
                  </div>
                </details>

                <div className="mt-auto pt-0.5 space-y-1 border-t border-white/[0.04]">
                  <div className="grid grid-cols-3 gap-0.5">
                    {[0.5, 1, 5].map((size) => {
                      const canSwap = token?.mint && isProbableSolanaMint(token.mint);
                      return (
                        <a
                          key={size}
                          href={canSwap ? buildJupiterSwapUrl(token.mint, size) : "#"}
                          target="_blank"
                          rel={EXTERNAL_ANCHOR_REL}
                          aria-disabled={!canSwap}
                          onClick={(e) => {
                            if (!canSwap) e.preventDefault();
                          }}
                          className="btn-ghost-sm"
                        >
                          {size} SOL
                        </a>
                      );
                    })}
                  </div>
                  {token?.mint && isProbableSolanaMint(token.mint) ? (
                    <Link
                      href={`/token/${token.mint}`}
                      className="btn-ghost-sm ml-auto"
                    >
                      <TrendingUp size={11} />
                      Token Intel
                    </Link>
                  ) : (
                    <p
                      className="btn-ghost-sm ml-auto"
                      title="No mint on the card yet — cannot open the token terminal."
                    >
                      Token Intel · mint
                    </p>
                  )}
                </div>
                  </>
                )}
              </RealtimeTokenCardShell>
            );
          })}
        </div>
      </div>
    </section>
  );
}
