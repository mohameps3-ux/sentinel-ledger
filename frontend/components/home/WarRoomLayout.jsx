import { Fragment, useMemo } from "react";
import { Zap } from "lucide-react";
import { UI_CONFIG } from "@/constants/homeData";
import { mapTrendRowToLiveSignal } from "@/lib/signalUtils";
import { useLocale } from "../../contexts/LocaleContext";
import { LiveSignalCard } from "@/features/war-home/LiveSignalCard";
import { SmartMoneyFlow } from "./SmartMoneyFlow";
import { RecentSignalsPanel } from "./RecentSignalsPanel";

function tokenMint(tok) {
  return tok?.mint ?? tok?.address ?? tok?.tokenAddress ?? "";
}

/** Velocity tab panel inside TacticalFeed. Hot/Live/Velocity discovery rails live in `HomeRailsBoard` (index.js). */
export function WarRoomLayout({
  velocityTokens = [],
  strategyMode,
  signalCursor,
  velocityRankDeltas,
  tickerByMint = {},
  quotesPricesFetching = false,
  entryCountdownByMint,
  selectedMint,
  deskCoordination = null,
  isWarMode = false,
  onSelectMint
}) {
  const { t } = useLocale();
  const velocityContext = t("home.context.heat");

  const displaySignals = useMemo(() => {
    let list = (velocityTokens || [])
      .map((row) =>
        mapTrendRowToLiveSignal(row, velocityContext, { velocityIntent: true })
      )
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
  }, [velocityTokens, velocityContext, isWarMode]);

  const activeVelocityToken = useMemo(() => {
    const list = (velocityTokens || []).filter((tok) => tokenMint(tok));
    if (!list.length) return null;
    if (selectedMint) {
      const selected = list.find((tok) => tokenMint(tok) === selectedMint);
      if (selected) return selected;
    }
    return list[0];
  }, [velocityTokens, selectedMint]);

  return (
    <section className={`sl-section${isWarMode ? " war-mode-active" : ""}`}>
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="sl-label text-[9px] inline-flex items-center gap-1.5 !text-sl-muted">
              <Zap size={12} className="text-violet-300/90 shrink-0" aria-hidden />
              <span className="tracking-[0.14em]">{t("war.tactical.tabVelocity")}</span>
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-semibold text-sl-text tracking-tight leading-tight">
                {t("war.tactical.tabVelocity")}
              </h2>
            </div>
            <p className="text-[10px] text-sl-muted mt-0.5 leading-snug max-w-[min(100%,28rem)]">
              {displaySignals.length} visible · sorted by intent score
            </p>
          </div>
        </div>
      </div>

      {displaySignals.length === 0 ? (
        <p className="text-sm text-sl-muted py-6">No velocity signals in the current window.</p>
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
                signalsRankDeltas={velocityRankDeltas}
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

      <SmartMoneyFlow token={activeVelocityToken} />
      <RecentSignalsPanel
        tokens={velocityTokens}
        selectedMint={selectedMint}
        onSelectMint={onSelectMint}
      />
    </section>
  );
}
