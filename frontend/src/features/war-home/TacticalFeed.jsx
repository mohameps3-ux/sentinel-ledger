import { useMemo } from "react";
import { TacticalTabs } from "../../../components/cockpit/TacticalTabs";
import { HistoryTab } from "./tabs/HistoryTab";
import { HotTab } from "./tabs/HotTab";
import { LiveTab } from "./tabs/LiveTab";
import { TerminalActionIcons } from "../../../components/terminal/TerminalActionIcons";
import { TokenCardAvatar } from "../../../components/home/TokenCardAvatar";
import { HomeCardSparkline } from "../../../components/home/HomeCardSparkline";
import { isProbableSolanaMint } from "../../../lib/solanaMint.mjs";
import { useLocale } from "../../../contexts/LocaleContext";

function scoreOutlier(row) {
  return Math.max(
    Number(row?.signalStrength || 0),
    Number(row?.heatScore || 0),
    Math.abs(Number(row?.change || row?.change24h || 0))
  );
}

export default function TacticalFeed({
  tacticalTab,
  onTabChange,
  panelVelocity,
  historyRows,
  liveExpanded,
  onToggleLiveExpanded,
  liveSignalsForGrid,
  liveSignalPool,
  liveFeedPool,
  isProFeed = false,
  signalsFeedIsError,
  signalsFeedIsDegraded = false,
  signalsFeedIsLoading,
  signalsAgeSec,
  isWarMode,
  liveUseVirtualizedLayout = false,
  liveVirtuosoRows,
  entryCountdownByMint,
  strategyMode,
  signalCursor,
  signalsRankDeltas,
  tickerByMint,
  quotesPricesFetching,
  selectedMint,
  deskCoordination = null,
  onSelectMint,
  heatExpanded,
  onToggleHeatExpanded,
  heatTokensForGrid,
  heatTokenPool,
  feedStatus,
  feedIsLive,
  feedLabel,
  feedAgeSec,
  trendingMinLiquidityUsd,
  trendingRankDeltas
}) {
  const { t } = useLocale();
  const outliers = useMemo(() => {
    const seen = new Set();
    const rows = [...(liveSignalPool || []), ...(heatTokenPool || [])]
      .filter((row) => row?.mint && isProbableSolanaMint(row.mint))
      .map((row) => ({
        mint: row.mint,
        label: row.symbol || row.ticker || row.name || "TOKEN",
        source: row._liveSource === "hot_fill" || row.heatScore != null || row.change != null ? "HOT" : "LIVE",
        score: scoreOutlier(row),
        tokenLike: { ...row, ...row._api }
      }))
      .filter((row) => {
        if (seen.has(row.mint)) return false;
        seen.add(row.mint);
        return true;
      })
      .sort((a, b) => b.score - a.score);
    return rows.slice(0, 4);
  }, [liveSignalPool, heatTokenPool]);

  return (
    <TacticalTabs
      activeTab={tacticalTab}
      onTabChange={onTabChange}
      panelVelocity={panelVelocity}
      panelTrack={
        <section className="sl-section">
          <div className="glass-card p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="sl-label text-[9px] !text-sl-muted tracking-[0.14em]">{t("terminal.lexicon.verifiedTrackRecord")}</p>
                <p className="text-xs text-sl-muted mt-1">{t("war.tactical.trackSub")}</p>
              </div>
            </div>
            <HistoryTab historyRows={historyRows} />
          </div>
        </section>
      }
      panelOutlier={
        <section className="sl-section">
          <div className="glass-card sl-radar-outlier-sheath p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="sl-label text-[9px] !text-blue-200 tracking-[0.16em]">{t("terminal.lexicon.outlierCatch")}</p>
                <p className="text-xs text-sl-sub mt-1">{t("war.tactical.outlierSub")}</p>
              </div>
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-[10px] font-mono text-blue-100">
                {outliers.length}/4
              </span>
            </div>
            {outliers.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {outliers.map((row) => (
                  <div
                    key={row.mint}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectMint?.(row.mint, { src: row.source === "HOT" ? "hot" : "live", tr: Math.round(row.score), sw: null })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectMint?.(row.mint, { src: row.source === "HOT" ? "hot" : "live", tr: Math.round(row.score), sw: null });
                      }
                    }}
                    className="border border-white/[0.08] bg-black/25 p-3 text-left hover:border-blue-400/45 hover:bg-blue-500/[0.06] transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <TokenCardAvatar
                          tokenLike={row.tokenLike}
                          mint={row.mint}
                          size={34}
                          variant={row.source === "HOT" ? "hot" : "live"}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-sl-text">{row.label}</p>
                          <p className="font-mono text-[10px] text-sl-muted">{row.mint.slice(0, 5)}…{row.mint.slice(-5)}</p>
                        </div>
                        <HomeCardSparkline
                          mint={row.mint}
                          change24h={row.tokenLike?.change ?? row.tokenLike?.priceChange24h ?? row.tokenLike?.spotChange24h}
                          change5m={row.tokenLike?.priceChange5m}
                          compact
                        />
                      </div>
                      <span className="rounded border border-sl-border bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-mono text-sl-sub">
                        {row.source}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-blue-200">LOCK {Math.round(row.score)}</span>
                      <TerminalActionIcons mint={row.mint} className="scale-90 origin-right" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-sl-muted">{t("war.tactical.outlierEmpty")}</p>
            )}
          </div>
        </section>
      }
      panelLive={
        <LiveTab
          liveExpanded={liveExpanded}
          onToggleLiveExpanded={onToggleLiveExpanded}
          liveSignalsForGrid={liveSignalsForGrid}
          liveSignalPool={liveFeedPool ?? liveSignalPool}
          isProFeed={isProFeed}
          signalsFeedIsError={signalsFeedIsError}
          signalsFeedIsDegraded={signalsFeedIsDegraded}
          signalsFeedIsLoading={signalsFeedIsLoading}
          signalsAgeSec={signalsAgeSec}
          isWarMode={isWarMode}
          useVirtualizedLayout={liveUseVirtualizedLayout}
          liveVirtuosoRows={liveVirtuosoRows}
          entryCountdownByMint={entryCountdownByMint}
          strategyMode={strategyMode}
          signalCursor={signalCursor}
          signalsRankDeltas={signalsRankDeltas}
          tickerByMint={tickerByMint}
          quotesPricesFetching={quotesPricesFetching}
          selectedMint={selectedMint}
          deskCoordination={deskCoordination}
          onSelectMint={onSelectMint}
        />
      }
      panelHot={
        <HotTab
          heatExpanded={heatExpanded}
          onToggleHeatExpanded={onToggleHeatExpanded}
          heatTokensForGrid={heatTokensForGrid}
          heatTokenPool={heatTokenPool}
          feedStatus={feedStatus}
          feedIsLive={feedIsLive}
          feedLabel={feedLabel}
          feedAgeSec={feedAgeSec}
          isWarMode={isWarMode}
          trendingMinLiquidityUsd={trendingMinLiquidityUsd}
          strategyMode={strategyMode}
          signalCursor={signalCursor}
          entryCountdownByMint={entryCountdownByMint}
          trendingRankDeltas={trendingRankDeltas}
          tickerByMint={tickerByMint}
          quotesPricesFetching={quotesPricesFetching}
          selectedMint={selectedMint}
          deskCoordination={deskCoordination}
          onSelectMint={onSelectMint}
        />
      }
    />
  );
}
