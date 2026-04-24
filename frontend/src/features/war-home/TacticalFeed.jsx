import { TacticalTabs } from "../../../components/cockpit/TacticalTabs";
import { HistoryTab } from "./tabs/HistoryTab";
import { HotTab } from "./tabs/HotTab";
import { LiveTab } from "./tabs/LiveTab";

export default function TacticalFeed({
  tacticalTab,
  onTabChange,
  historyRows,
  liveExpanded,
  onToggleLiveExpanded,
  liveSignalsForGrid,
  liveSignalPool,
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
  return (
    <TacticalTabs
      activeTab={tacticalTab}
      onTabChange={onTabChange}
      panelHistory={<HistoryTab historyRows={historyRows} />}
      panelLive={
        <LiveTab
          liveExpanded={liveExpanded}
          onToggleLiveExpanded={onToggleLiveExpanded}
          liveSignalsForGrid={liveSignalsForGrid}
          liveSignalPool={liveSignalPool}
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
          entryCountdownByMint={entryCountdownByMint}
          trendingRankDeltas={trendingRankDeltas}
          selectedMint={selectedMint}
          onSelectMint={onSelectMint}
        />
      }
    />
  );
}
