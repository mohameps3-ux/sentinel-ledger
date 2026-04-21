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
  signalsAgeSec,
  isWarMode,
  liveVirtuosoRows,
  entryCountdownByMint,
  strategyMode,
  signalCursor,
  signalsRankDeltas,
  selectedMint,
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
          signalsAgeSec={signalsAgeSec}
          isWarMode={isWarMode}
          liveVirtuosoRows={liveVirtuosoRows}
          entryCountdownByMint={entryCountdownByMint}
          strategyMode={strategyMode}
          signalCursor={signalCursor}
          signalsRankDeltas={signalsRankDeltas}
          selectedMint={selectedMint}
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
