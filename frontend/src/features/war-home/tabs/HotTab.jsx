import { Fragment, useMemo } from "react";
import { ChevronsDown, ChevronsUp, Flame } from "lucide-react";
import { formatUsdWhole } from "../../../../lib/formatStable";
import { UI_CONFIG } from "@/constants/homeData";
import { mapTrendRowToLiveSignal } from "@/lib/signalUtils";
import { useLocale } from "../../../../contexts/LocaleContext";
import { useWarMode } from "../../../../contexts/WarModeContext";
import { LiveSignalCard } from "../LiveSignalCard";

export function HotTab({
  heatExpanded,
  onToggleHeatExpanded,
  heatTokensForGrid,
  heatTokenPool,
  feedStatus,
  feedIsLive,
  feedLabel,
  feedAgeSec,
  trendingMinLiquidityUsd,
  strategyMode,
  signalCursor,
  trendingRankDeltas,
  tickerByMint = {},
  quotesPricesFetching = false,
  entryCountdownByMint,
  selectedMint,
  deskCoordination = null,
  isWarMode,
  onSelectMint
}) {
  const { t } = useLocale();
  const heatContext = t("home.context.heat");

  const displaySignals = useMemo(() => {
    let list = heatTokensForGrid
      .map((row) => mapTrendRowToLiveSignal(row, heatContext))
      .filter(Boolean);
    if (isWarMode) {
      list = [...list]
        .sort(
          (a, b) =>
            (Number(b.signalStrength) || 0) - (Number(a.signalStrength) || 0)
        )
        .slice(0, 6);
    }
    return list;
  }, [heatTokensForGrid, heatContext, isWarMode]);

  const feedLabelTr =
    feedLabel === "SNAPSHOT"
      ? t("war.hot.feedSnapshot")
      : feedLabel === "LIVE-DEGRADED"
        ? t("war.hot.feedDegraded")
        : feedLabel === "LIVE"
          ? t("war.hot.feedLive")
          : feedLabel;

  return (
    <section className={`sl-section${isWarMode ? " war-mode-active" : ""}`}>
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="sl-label text-[9px] inline-flex items-center gap-1.5 !text-sl-muted">
              <Flame size={12} className="text-orange-300/90 shrink-0" aria-hidden />
              <span className="tracking-[0.14em]">{t("war.hot.label")}</span>
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-semibold text-sl-text tracking-tight leading-tight">
                HOT TRACKED
              </h2>
              <button
                type="button"
                onClick={onToggleHeatExpanded}
                aria-expanded={heatExpanded}
                aria-label={heatExpanded ? t("war.live.collapseAria") : t("war.live.expandAria")}
                title={heatExpanded ? t("war.live.collapseTitle") : t("war.live.expandTitle")}
                className="group relative flex h-9 w-9 shrink-0 items-center justify-center border border-[rgba(209,213,219,0.16)] bg-gradient-to-b from-white/[0.05] to-sl-card text-[#d1d5db] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:border-[rgba(250,204,21,0.5)] hover:from-[rgba(250,204,21,0.10)] hover:to-[rgba(250,204,21,0.04)] hover:text-[#fef08a] hover:shadow-[0_0_22px_rgba(250,204,21,0.20)] active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(250,204,21,0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]"
              >
                {heatExpanded ? (
                  <ChevronsUp className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                ) : (
                  <ChevronsDown className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                )}
              </button>
            </div>
            <p className="text-[10px] text-sl-muted mt-0.5 leading-snug max-w-[min(100%,28rem)]">
              {t("war.hot.sub")} · {t("war.hot.visLine", { vis: displaySignals.length, pool: heatTokenPool.length })}
            </p>
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
      </div>

      {displaySignals.length === 0 ? (
        <p className="text-sm text-sl-muted py-6">{t("war.hot.sub")}</p>
      ) : (
        <div className={UI_CONFIG.LIVE_HOT_GRID_CLASS}>
          {displaySignals.map((sig, idx) => (
            <Fragment key={`${sig.mint}-${idx}`}>
              <LiveSignalCard
                sig={sig}
                idx={idx}
                strategyMode={strategyMode}
                signalCursor={signalCursor}
                displaySignalCount={displaySignals.length}
                selectedMint={selectedMint}
                deskCoordination={deskCoordination}
                signalsRankDeltas={trendingRankDeltas}
                tickerByMint={tickerByMint}
                entryCountdownByMint={entryCountdownByMint}
                onSelectMint={onSelectMint}
                quotesPricesFetching={quotesPricesFetching}
                isWarMode={isWarMode}
              />
            </Fragment>
          ))}
        </div>
      )}
    </section>
  );
}
