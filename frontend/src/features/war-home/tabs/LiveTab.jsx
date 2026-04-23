import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Info, Sparkles } from "lucide-react";
import { Virtuoso } from "react-virtuoso";
import { UI_CONFIG } from "@/constants/homeData";
import {
  confidenceLabel,
  confidenceTone,
  entryWindowFromCountdown,
  entryWindowVisual,
  evidenceChipsForSig,
  feedDecisionPillClass,
  scoreBarGradient,
  suggestedAction,
  whyNowBulletLines
} from "@/lib/signalUtils";
import { redFlagsForSignal } from "@/lib/redFlags";
import { LiveCardOverlay } from "../../../../components/home/LiveCardOverlay";
import { WatchedCardShell } from "../../../../components/home/WatchedCardShell";
import { buildJupiterSwapUrl } from "../../../../lib/jupiterSwap";
import { isProbableSolanaMint } from "../../../../lib/solanaMint";
import { RankBadge, RankDeltaChip } from "./RankIndicators";

function cockpitCardClickTargetIsInteractive(e) {
  const el = e?.target;
  if (!el || typeof el.closest !== "function") return true;
  return Boolean(el.closest("a, button"));
}

export function LiveTab({
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
  /** Latest coordination:red-signal for the desk mint (?t=); null when no token focused. */
  deskCoordination = null,
  onSelectMint
}) {
  const [stalkerUnread, setStalkerUnread] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setStalkerUnread(Number(localStorage.getItem("walletStalkerUnread") || 0));
    refresh();
    window.addEventListener("wallet-stalker-update", refresh);
    return () => window.removeEventListener("wallet-stalker-update", refresh);
  }, []);

  function renderLiveGridItem(sig, idx) {
    const sec = entryCountdownByMint[sig.mint] || 0;
    const win = sig._api
      ? {
          label: sig._api.entryWindow || "OPEN",
          detail:
            sig._api.entryWindowMinutesLeft != null ? `${sig._api.entryWindowMinutesLeft} min left (server)` : "—",
          tone:
            sig._api.entryWindow === "OPEN"
              ? "text-emerald-300"
              : sig._api.entryWindow === "CLOSING"
                ? "text-amber-300"
                : "text-red-300"
        }
      : entryWindowFromCountdown(sec);
    const vis = sig._api
      ? entryWindowVisual(Math.max(0, (Number(sig._api.entryWindowMinutesLeft) || 0) * 45))
      : entryWindowVisual(sec);
    const action = sig._api?.decision || suggestedAction(sig.signalStrength, strategyMode, "feed");
    const hot = idx === signalCursor % Math.max(1, liveSignalsForGrid.length);
    const coordOnCard =
      selectedMint && sig.mint === selectedMint && deskCoordination?.redSignal ? deskCoordination.redSignal : null;
    const whyLines = whyNowBulletLines(sig);
    const rankInfo = signalsRankDeltas.get(sig.mint) || { rank: idx + 1, delta: 0, isNew: false };
    return (
      <WatchedCardShell
        mint={sig.mint}
        title={sig.mint && isProbableSolanaMint(sig.mint) ? "Click to show on desk (?t=)" : undefined}
        onClick={(e) => {
          if (!sig.mint || !isProbableSolanaMint(sig.mint)) return;
          if (cockpitCardClickTargetIsInteractive(e)) return;
          e.preventDefault();
          onSelectMint(sig.mint);
        }}
        baseClassName={`sl-glow-live rounded-md border border-white/10 bg-white/[0.02] p-1.5 sm:p-2 space-y-1 touch-manipulation transition-all duration-300 hover:-translate-y-[1px] hover:border-emerald-400/45 hover:shadow-[0_0_18px_rgba(16,185,129,0.22)] ${
          hot ? "ring-1 ring-emerald-500/35" : ""
        } ${sig.mint && isProbableSolanaMint(sig.mint) ? "cursor-pointer" : ""} ${
          selectedMint && sig.mint === selectedMint ? "ring-2 ring-cyan-500/40" : ""
        }`}
        watchedClassName="!border-emerald-500/35 ring-1 ring-emerald-500/50 shadow-[0_0_18px_rgba(16,185,129,0.18)]"
      >
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1 mb-0">
              <RankBadge rank={rankInfo.rank} />
              <RankDeltaChip delta={rankInfo.delta} isNew={rankInfo.isNew} />
            </div>
            <p className="text-xs font-bold text-white tracking-tight truncate leading-tight">${sig.symbol}</p>
            <p className="text-[8px] text-cyan-200/85 font-mono mt-0.5 leading-tight">{sig.smartWallets} w · live</p>
          </div>
          <span
            className={`shrink-0 text-[7px] max-w-[4.25rem] text-right leading-tight px-0.5 py-0.5 rounded border line-clamp-2 ${confidenceTone(sig.signalStrength)}`}
            title={confidenceLabel(sig.signalStrength)}
          >
            {confidenceLabel(sig.signalStrength)}
          </span>
        </div>

        <div className="space-y-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[7px] uppercase tracking-[0.12em] text-gray-500 font-semibold">Score</p>
            <span className="text-[7px] text-gray-500 font-mono">/ 100</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-black tabular-nums font-mono text-white leading-none tracking-tight">
              {sig.signalStrength}
            </span>
            <div className="flex-1 h-0.5 sm:h-1 rounded-full bg-gray-900 overflow-hidden ring-1 ring-white/8 mb-0.5 min-w-0">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${scoreBarGradient(sig.signalStrength)}`}
                style={{ width: `${sig.signalStrength}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-0.5">
          <span className={`inline-flex items-center justify-center ${feedDecisionPillClass(action, sig.signalStrength)}`}>
            {action === "ENTER NOW" ? "🟢 " : action === "PREPARE" ? "🟡 " : "🔴 "}
            {action}
          </span>
          {coordOnCard ? (
            <span className="text-[8px] px-1 py-0.5 rounded border border-rose-500/40 bg-rose-500/15 text-rose-200 font-mono" title="Wallet cluster coordination (same as token page)">
              {String(coordOnCard).replace(/_/g, " ")}
            </span>
          ) : null}
          {sig._api?.confluence || (!sig._api && sig.signalStrength >= 88) ? (
            <span className="text-[9px] text-violet-200 bg-violet-500/10 border border-violet-500/25 rounded px-1 py-0.5 font-mono">
              🧬 multi
            </span>
          ) : null}
        </div>

        <div className="rounded border border-white/8 bg-black/30 px-1.5 py-1">
          <p className="text-[7px] text-gray-500 uppercase tracking-wide font-semibold">Why now</p>
          <ul className="text-[8px] text-gray-200 mt-0.5 space-y-0 leading-snug">
            {whyLines.slice(0, 3).map((line, li) => (
              <li key={li} className="flex gap-1">
                <span className="text-emerald-500/80 shrink-0">•</span>
                <span className="truncate">{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <LiveCardOverlay mint={sig.mint} />

        <div className="flex flex-wrap gap-0.5">
          {evidenceChipsForSig(sig).slice(0, 4).map((chip) => (
            <span
              key={chip + idx}
              className="text-[9px] px-1 py-0.5 rounded border border-white/10 bg-white/[0.02] text-gray-300"
              title="Evidence"
            >
              {chip}
            </span>
          ))}
        </div>

        {redFlagsForSignal(sig).length ? (
          <p className="text-[9px] text-red-200/95 truncate leading-tight">RED: {redFlagsForSignal(sig).join(" · ")}</p>
        ) : null}

        <div className="space-y-0.5">
          <p className={`text-[9px] font-mono ${vis.text} leading-tight`}>
            ENTRY · {win.label} · {win.detail}
          </p>
          <div className="h-0.5 rounded-full bg-gray-900 overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${vis.gradient}`}
              style={{ width: `${Math.min(100, (sec / 420) * 100)}%` }}
            />
          </div>
        </div>

        <p className="text-[9px] text-cyan-200/85 font-mono truncate">
          {sig._api?.timeAdvantage || `Earlier than ${Math.max(72, Math.min(96, sig.signalStrength))}% of traders`}
        </p>
        {sig._api?.signalDecay ? (
          <p className="text-[9px] text-gray-500 font-mono truncate" title="Server-side recency adjustment for the displayed score">
            {sig._api.signalDecay}
          </p>
        ) : null}
        {sig._api?.poolAgeLabel ? (
          <p className="text-[9px] text-slate-400 font-mono truncate" title="Approximate DEX pair age when upstream provides pairCreatedAt">
            {sig._api.poolAgeLabel}
          </p>
        ) : null}
        {sig._api?.signalQuality &&
        (sig._api.signalQuality.baseSentinelScore != null || sig._api.signalQuality.stack != null) ? (
          <div className="rounded border border-white/[0.06] bg-white/[0.02] px-1.5 py-1 space-y-0.5">
            <p className="text-[8px] text-gray-500 uppercase tracking-wide font-semibold">Signal quality</p>
            <p className="text-[9px] text-gray-400 font-mono leading-snug">
              base {sig._api.signalQuality.baseSentinelScore ?? "—"} → adj {sig.signalStrength}
              {" · "}
              perf×{sig._api.signalQuality.performanceWeight ?? "—"} rec×{sig._api.signalQuality.recencyWeight ?? "—"}
              {" · "}
              stack {sig._api.signalQuality.stack ?? "—"}
            </p>
          </div>
        ) : null}
        {sig._api?.walletBehavior ? (
          <div className="rounded border border-violet-500/20 bg-violet-500/[0.06] px-1.5 py-1 space-y-0.5">
            <p className="text-[8px] text-violet-200 uppercase tracking-wide font-semibold">Wallet behavior</p>
            <p className="text-[9px] text-violet-100/90 font-mono leading-snug">
              style {sig._api.walletBehavior.styleLabel || "—"}
              {" · "}
              WR {sig._api.walletBehavior.winRateReal ?? "—"}%
              {" · "}
              latency {sig._api.walletBehavior.avgLatencyPostDeployMin ?? "—"}m
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-0.5 pt-0.5 border-t border-white/[0.04] mt-0.5">
          {[0.5, 1, 5].map((size) => {
            const canSwap = sig.mint && isProbableSolanaMint(sig.mint);
            return (
              <a
                key={size}
                href={canSwap ? buildJupiterSwapUrl(sig.mint, size) : "#"}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!canSwap}
                onClick={(e) => {
                  if (!canSwap) e.preventDefault();
                }}
                className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${
                  canSwap
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
                    : "border-white/10 bg-white/[0.03] text-gray-600 cursor-not-allowed pointer-events-none"
                }`}
              >
                {size} SOL
              </a>
            );
          })}
        </div>
      </WatchedCardShell>
    );
  }

  return (
    <section translate="no" className="sl-section">
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-gray-500 font-semibold inline-flex items-center gap-1.5">
              <Sparkles size={12} className="text-emerald-400" />
              Decision Feed
            </p>
            <button
              type="button"
              onClick={onToggleLiveExpanded}
              className="text-base sm:text-lg font-semibold text-white mt-0.5 text-left hover:text-emerald-200 transition-colors leading-tight"
            >
              Live Smart Money {liveExpanded ? "[-]" : "[+]"} {liveExpanded ? "(50+)" : ""}
            </button>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {liveSignalsForGrid.length} vis · {liveSignalPool.length} tracked
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-1">
            <div className="flex flex-wrap items-center gap-1">
              <Link
                href="/wallet-stalker"
                className="sl-glow-info w-[5cm] max-w-[62vw] h-7 px-2 rounded-md border border-cyan-500/30 bg-cyan-500/[0.08] text-cyan-100 no-underline inline-flex items-center justify-between gap-1"
              >
                <span className="text-[10px] uppercase tracking-wide truncate">Wallet activity</span>
                <span className="text-[10px] font-mono shrink-0">{stalkerUnread > 0 ? `+${stalkerUnread}` : "0"}</span>
              </Link>
              <button
                type="button"
                onClick={onToggleLiveExpanded}
                className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border border-cyan-500/35 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
              >
                {liveExpanded ? "Compact" : "Expand feed (50+)"}
              </button>
            </div>
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border inline-flex items-center gap-1 ${
                signalsFeedIsError
                  ? "bg-amber-500/15 text-amber-200 border-amber-500/30"
                  : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${signalsFeedIsError ? "bg-amber-400" : "bg-emerald-400 animate-pulse"}`} />
              {signalsFeedIsError ? "Delayed" : "Live"}
            </span>
            <span className="text-[10px] text-gray-500 inline-flex items-center gap-0.5">
              <Info size={11} />
              {signalsAgeSec === null ? "syncing…" : signalsAgeSec <= 2 ? "just now" : `updated ${signalsAgeSec}s ago`}
              {" · "}
              {isWarMode ? "5s" : "15s"}
            </span>
          </div>
        </div>
        {selectedMint && deskCoordination?.redSignal ? (
          <div className="rounded-md border border-rose-500/35 bg-rose-500/[0.12] px-2.5 py-2 text-[10px] text-rose-100/95 leading-snug w-full max-w-3xl">
            <p className="font-semibold uppercase tracking-wide text-rose-200/90 text-[9px]">Coordination (desk)</p>
            <p className="mt-0.5">
              <span className="font-mono">{String(deskCoordination.redSignal).replace(/_/g, " ")}</span>
              {deskCoordination.meta?.priorClusterAlertsWithVerifiedPumps != null ? (
                <span className="text-rose-100/85">
                  {" "}
                  · prior verified (T+N / legacy): {deskCoordination.meta.priorClusterAlertsWithVerifiedPumps} cluster alerts
                </span>
              ) : null}
            </p>
            <p className="text-[9px] text-rose-200/75 mt-0.5">
              <Link href={`/token/${selectedMint}`} className="underline underline-offset-2 hover:text-rose-50">
                Ficha del token →
              </Link>
            </p>
          </div>
        ) : null}
      </div>
      {liveSignalsForGrid.length > UI_CONFIG.VIRTUOSO_ROW_THRESHOLD ? (
        <div className="min-h-[min(72dvh,920px)] w-full">
          <Virtuoso
            style={{ height: "min(72dvh, 920px)" }}
            totalCount={liveVirtuosoRows.length}
            defaultItemHeight={260}
            increaseViewportBy={{ bottom: 400, top: 100 }}
            itemContent={(rowIndex) => (
              <div className={`${UI_CONFIG.LIVE_HOT_GRID_CLASS} pb-1.5`}>
                {liveVirtuosoRows[rowIndex].map((sig, j) => {
                  const idx = rowIndex * UI_CONFIG.VIRTUOSO_COLUMNS + j;
                  return <Fragment key={`${sig.mint}-${idx}`}>{renderLiveGridItem(sig, idx)}</Fragment>;
                })}
              </div>
            )}
          />
        </div>
      ) : (
        <div className={UI_CONFIG.LIVE_HOT_GRID_CLASS}>
          {liveSignalsForGrid.map((sig, idx) => (
            <Fragment key={`${sig.mint}-${idx}`}>{renderLiveGridItem(sig, idx)}</Fragment>
          ))}
        </div>
      )}
    </section>
  );
}
