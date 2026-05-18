import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronsDown, ChevronsUp, Info, Inbox, Loader2, Sparkles, WifiOff } from "lucide-react";
import { Virtuoso } from "react-virtuoso";
import { UI_CONFIG } from "@/constants/homeData";
import { useLocale } from "../../../../contexts/LocaleContext";
import { useWarMode } from "../../../../contexts/WarModeContext";
import { useIngestionPulse } from "../../../../hooks/useIngestionPulse";
import { useAccessTier } from "../../../../hooks/useAccessTier";
import { LiveFreeDelayNotice } from "../../../../components/access/LiveFreeDelayNotice";
import { LiveSignalCard } from "../LiveSignalCard";

/**
 * War Home — Live tab (grid / Virtuoso). Parent `index.js` controls merge + hysteresis; this file only renders.
 * — Do not reintroduce `useRankingSnapshot` in the parent merge, a delayed `visibleTrending` for hot-fill, or a
 *   single-threshold Grid↔Virtuoso switch (see `index.js` + `check-home-live-invariants.cjs` + PR template).
 * — `data-testid` on section/cards: keeps optional E2E / grep-smoke stable; do not remove without updating the check script.
 */

export function LiveTab({
  liveExpanded,
  onToggleLiveExpanded,
  liveSignalsForGrid,
  liveSignalPool,
  signalsFeedIsError,
  signalsFeedIsDegraded = false,
  signalsFeedIsLoading = false,
  signalsAgeSec,
  useVirtualizedLayout = false,
  liveVirtuosoRows,
  entryCountdownByMint,
  strategyMode,
  signalCursor,
  signalsRankDeltas,
  tickerByMint = {},
  quotesPricesFetching = false,
  selectedMint,
  /** Latest coordination:red-signal for the desk mint (?t=); null when no token focused. */
  deskCoordination = null,
  onSelectMint
}) {
  const { t } = useLocale();
  const { isPro } = useAccessTier();
  const [stalkerUnread, setStalkerUnread] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setStalkerUnread(Number(localStorage.getItem("walletStalkerUnread") || 0));
    refresh();
    window.addEventListener("wallet-stalker-update", refresh);
    return () => window.removeEventListener("wallet-stalker-update", refresh);
  }, []);

  const { isWarMode } = useWarMode();
  const ingestionPulse = useIngestionPulse(isWarMode ? 8000 : 12000);
  const lastEventAgeMs =
    ingestionPulse.data && typeof ingestionPulse.data.lastEventAgeMs === "number"
      ? ingestionPulse.data.lastEventAgeMs
      : null;
  const ingestLive = !ingestionPulse.isError && lastEventAgeMs != null && lastEventAgeMs < 5000;
  const ingestLabel = ingestionPulse.isError
    ? t("war.live.ingestUnknown")
    : lastEventAgeMs == null
      ? t("war.live.ingestUnknown")
      : ingestLive
        ? t("war.live.ingestLive")
        : t("war.live.ingestQuiet");
  const getScore = (item) => item?.score ?? item?.sentinelScore ?? item?.unified_score ?? 0;

  const warGrid = useMemo(
    () => (isWarMode ? liveSignalsForGrid.slice(0, 6) : liveSignalsForGrid),
    [isWarMode, liveSignalsForGrid]
  );

  const displaySignals = useMemo(() => {
    if (!isWarMode) return warGrid;
    return [...warGrid].sort((a, b) => getScore(b) - getScore(a));
  }, [warGrid, isWarMode]);

  const displayVirtuosoRows = useMemo(() => {
    if (!isWarMode) return liveVirtuosoRows;
    const cols = UI_CONFIG.VIRTUOSO_COLUMNS;
    const rows = [];
    for (let i = 0; i < displaySignals.length; i += cols) {
      rows.push(displaySignals.slice(i, i + cols));
    }
    return rows;
  }, [displaySignals, liveVirtuosoRows, isWarMode]);

  const dbSignalCount = liveSignalPool.filter((s) => s._liveSource !== "hot_fill").length;
  const heatFillCount = liveSignalPool.filter((s) => s._liveSource === "hot_fill").length;

  return (
    <section
      data-testid="sl-war-live-section"
      translate="no"
      className={`sl-section${isWarMode ? " war-mode-active" : ""}`}
    >
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="sl-label text-[9px] inline-flex items-center gap-1.5 !text-sl-muted">
              <Sparkles size={12} className="text-emerald-400/95 shrink-0" aria-hidden />
              <span className="tracking-[0.14em]">{t("war.live.decisionFeedLabel")}</span>
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-semibold text-sl-text tracking-tight leading-tight">
                {t("war.live.liveTitle")}
              </h2>
              <button
                type="button"
                onClick={onToggleLiveExpanded}
                aria-expanded={liveExpanded}
                aria-label={liveExpanded ? t("war.live.collapseAria") : t("war.live.expandAria")}
                title={liveExpanded ? t("war.live.collapseTitle") : t("war.live.expandTitle")}
                className="group relative flex h-9 w-9 shrink-0 items-center justify-center border border-[rgba(209,213,219,0.16)] bg-gradient-to-b from-white/[0.05] to-sl-card text-[#d1d5db] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:border-[rgba(250,204,21,0.5)] hover:from-[rgba(250,204,21,0.10)] hover:to-[rgba(250,204,21,0.04)] hover:text-[#fef08a] hover:shadow-[0_0_22px_rgba(250,204,21,0.20)] active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(250,204,21,0.5)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]"
              >
                {liveExpanded ? (
                  <ChevronsUp className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                ) : (
                  <ChevronsDown className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                )}
              </button>
            </div>
            <p className="text-[10px] text-sl-muted mt-0.5 leading-snug max-w-[min(100%,28rem)]">
              {t("war.live.poolLine", {
                db: dbSignalCount,
                heat: heatFillCount,
                vis: displaySignals.length,
                pool: liveSignalPool.length
              })}
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-1">
            <div className="flex flex-wrap items-center gap-1">
              <Link
                href="/wallet-stalker"
                className="sl-glow-info w-[5cm] max-w-[62vw] h-7 px-2 border border-blue-500/30 bg-blue-500/[0.08] text-blue-100 no-underline inline-flex items-center justify-between gap-1"
              >
                <span className="text-[10px] uppercase tracking-wide truncate">{t("war.live.walletActivity")}</span>
                <span className="text-[10px] font-mono shrink-0">{stalkerUnread > 0 ? `+${stalkerUnread}` : "0"}</span>
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-start md:justify-end gap-1">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 border inline-flex items-center gap-1 ${
                signalsFeedIsError || signalsFeedIsDegraded
                  ? "bg-amber-500/15 text-amber-200 border-amber-500/30"
                  : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  signalsFeedIsError || signalsFeedIsDegraded ? "bg-amber-400" : "bg-emerald-400 animate-pulse"
                }`}
              />
              {signalsFeedIsError || signalsFeedIsDegraded ? t("war.live.statusDegraded") : t("war.live.statusLive")}
            </span>
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 border inline-flex items-center gap-1 ${
                ingestLive ? "bg-emerald-950/40 text-emerald-200 border-emerald-600/35" : "bg-zinc-800/80 text-zinc-400 border-zinc-600/30"
              }`}
              title="Helius webhook ingestion (/health/ingestion)"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${ingestLive ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
              {ingestLabel}
            </span>
            </div>
            <span className="text-[10px] text-sl-muted inline-flex items-center gap-0.5">
              <Info size={11} />
              {signalsAgeSec === null
                ? t("war.live.syncing")
                : signalsAgeSec <= 2
                  ? t("war.live.justNow")
                  : t("war.live.secondsAgo", { sec: signalsAgeSec })}
              {" · "}
              {isWarMode ? t("war.live.pollWar") : t("war.live.pollNormal")}
            </span>
          </div>
        </div>
        {displaySignals.length === 0 ? (
          <div className="border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-transparent px-4 py-5 text-[12px] text-sl-sub leading-relaxed max-w-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            {signalsFeedIsLoading ? (
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-blue-500/25 bg-blue-500/10">
                  <Loader2 className="h-4 w-4 text-blue-300 animate-spin" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold text-sl-text/95">{t("war.live.empty.loadingTitle")}</p>
                  <p className="mt-1 text-sl-sub text-[11px]">{t("war.live.empty.loadingBody")}</p>
                </div>
              </div>
            ) : signalsFeedIsError ? (
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-amber-500/30 bg-amber-500/10">
                  <WifiOff className="h-4 w-4 text-amber-200" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold text-amber-100/95">{t("war.live.empty.errorTitle")}</p>
                  <p className="mt-1 text-sl-sub text-[11px]">{t("war.live.empty.errorBody")}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-sl-border bg-white/[0.03]">
                  <Inbox className="h-4 w-4 text-sl-sub" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold text-sl-text/90">{t("war.live.empty.inboxTitle")}</p>
                  <p className="mt-1 text-sl-sub text-[11px]">{t("war.live.empty.inboxBody")}</p>
                </div>
              </div>
            )}
          </div>
        ) : null}
        {selectedMint && deskCoordination?.redSignal ? (
          <div className="border border-rose-500/35 bg-rose-500/[0.12] px-2.5 py-2 text-[10px] text-rose-100/95 leading-snug w-full max-w-3xl">
            <p className="font-semibold uppercase tracking-wide text-rose-200/90 text-[9px]">{t("war.live.coordTitle")}</p>
            <p className="mt-0.5">
              <span className="font-mono">{String(deskCoordination.redSignal).replace(/_/g, " ")}</span>
              {deskCoordination.meta?.priorClusterAlertsWithVerifiedPumps != null ? (
                <span className="text-rose-100/85">
                  {" "}
                  {t("war.live.coordMeta", { n: deskCoordination.meta.priorClusterAlertsWithVerifiedPumps })}
                </span>
              ) : null}
            </p>
            <p className="text-[9px] text-rose-200/75 mt-0.5">
              <Link href={`/token/${selectedMint}`} className="underline underline-offset-2 hover:text-rose-50">
                {t("war.live.tokenSheetLink")}
              </Link>
            </p>
          </div>
        ) : null}
      </div>
      {displaySignals.length === 0 ? null : useVirtualizedLayout && displayVirtuosoRows.length > 0 ? (
        <div className="min-h-[min(72dvh,920px)] w-full">
          <Virtuoso
            style={{ height: "min(72dvh, 920px)" }}
            totalCount={displayVirtuosoRows.length}
            defaultItemHeight={260}
            increaseViewportBy={{ bottom: 400, top: 100 }}
            itemContent={(rowIndex) => (
              <div className={`${UI_CONFIG.LIVE_HOT_GRID_CLASS} pb-1.5`}>
                {displayVirtuosoRows[rowIndex].map((sig, j) => {
                  const idx = rowIndex * UI_CONFIG.VIRTUOSO_COLUMNS + j;
                  return (
                    <Fragment key={`${sig.mint}-${idx}`}>
                      <LiveSignalCard
                        sig={sig}
                        idx={idx}
                        strategyMode={strategyMode}
                        signalCursor={signalCursor}
                        displaySignalCount={displaySignals.length}
                        selectedMint={selectedMint}
                        deskCoordination={deskCoordination}
                        signalsRankDeltas={signalsRankDeltas}
                        tickerByMint={tickerByMint}
                        entryCountdownByMint={entryCountdownByMint}
                        onSelectMint={onSelectMint}
                        quotesPricesFetching={quotesPricesFetching}
                        isWarMode={isWarMode}
                      />
                    </Fragment>
                  );
                })}
              </div>
            )}
          />
        </div>
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
                signalsRankDeltas={signalsRankDeltas}
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
      {!isPro ? <LiveFreeDelayNotice /> : null}
    </section>
  );
}
