import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronsDown, ChevronsUp, Info, Inbox, Loader2, Sparkles, WifiOff } from "lucide-react";
import { Virtuoso } from "react-virtuoso";
import { UI_CONFIG } from "@/constants/homeData";
import {
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
import { RealtimeTokenCardShell } from "../../../../components/home/RealtimeTokenCardShell";
import { TacticalRegimePill } from "../../../../components/home/TacticalRegimePill";
import { buildJupiterSwapUrl, EXTERNAL_ANCHOR_REL } from "../../../../lib/terminalLinks";
import { isProbableSolanaMint } from "../../../../lib/solanaMint.mjs";
import { RankBadge, RankDeltaChip } from "./RankIndicators";
import { AnimatedNumber } from "../../../../components/ui/AnimatedNumber";
import { useLocale } from "../../../../contexts/LocaleContext";

/**
 * War Home — Live tab (grid / Virtuoso). Parent `index.js` controls merge + hysteresis; this file only renders.
 * — Do not reintroduce `useRankingSnapshot` in the parent merge, a delayed `visibleTrending` for hot-fill, or a
 *   single-threshold Grid↔Virtuoso switch (see `index.js` + `check-home-live-invariants.cjs` + PR template).
 * — `data-testid` on section/cards: keeps optional E2E / grep-smoke stable; do not remove without updating the check script.
 */
function cockpitCardClickTargetIsInteractive(e) {
  const el = e?.target;
  if (!el || typeof el.closest !== "function") return true;
  return Boolean(el.closest("a, button"));
}

function narrativeClass(severity) {
  if (severity === "URGENT") return "border-indigo-300/70 bg-indigo-600/85 text-white shadow-[0_0_18px_rgba(99,102,241,0.35)] animate-pulse";
  if (severity === "TACTICAL") return "border-amber-300/60 bg-amber-500/85 text-black";
  if (severity === "ANOMALY") return "border-red-400/80 bg-red-950/90 text-red-50 shadow-[0_0_16px_rgba(248,113,113,0.25)]";
  return "border-white/15 bg-zinc-950/90 text-zinc-100";
}

function SentinelNarrativeBanner({ narrative }) {
  if (!narrative) return null;
  return (
    <Link
      href={`/token/${encodeURIComponent(narrative.mint)}`}
      className={`mb-1.5 block rounded-md border px-2 py-1.5 text-[10px] font-semibold leading-snug no-underline ${narrativeClass(
        narrative.severity
      )}`}
      title={narrative.cta?.label || "Open token desk"}
    >
      <span className="font-mono text-[8px] uppercase tracking-[0.14em] opacity-80">{narrative.severity}</span>
      <span className="ml-1">{narrative.message}</span>
    </Link>
  );
}

export function LiveTab({
  liveExpanded,
  onToggleLiveExpanded,
  liveSignalsForGrid,
  liveSignalPool,
  signalsFeedIsError,
  signalsFeedIsDegraded = false,
  signalsFeedIsLoading = false,
  signalsAgeSec,
  isWarMode,
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
  const [stalkerUnread, setStalkerUnread] = useState(0);
  const [narratives, setNarratives] = useState([]);

  const confidenceTr = useCallback(
    (signalStrength) => {
      if (signalStrength >= 95) return t("war.live.confidence.strong");
      if (signalStrength >= 80) return t("war.live.confidence.build");
      return t("war.live.confidence.low");
    },
    [t]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setStalkerUnread(Number(localStorage.getItem("walletStalkerUnread") || 0));
    refresh();
    window.addEventListener("wallet-stalker-update", refresh);
    return () => window.removeEventListener("wallet-stalker-update", refresh);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let socket;
    let cancelled = false;
    (async () => {
      try {
        const { io } = await import("socket.io-client");
        const { getPublicWsUrl } = await import("../../../../lib/publicRuntime");
        socket = io(getPublicWsUrl(), { transports: ["websocket", "polling"], autoConnect: true });
        socket.on("sentinel:narrative", (payload) => {
          if (cancelled || !payload?.id || !payload?.mint || !payload?.message) return;
          const expiresAt = payload.expiresAt ? Date.parse(payload.expiresAt) : Date.now() + 30_000;
          setNarratives((prev) =>
            [
              {
                ...payload,
                expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 30_000
              },
              ...prev.filter((n) => n.id !== payload.id && n.mint !== payload.mint)
            ].slice(0, 3)
          );
        });
      } catch (_) {}
    })();
    const sweep = window.setInterval(() => {
      const now = Date.now();
      setNarratives((prev) => prev.filter((n) => Number(n.expiresAt) > now).slice(0, 3));
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(sweep);
      try {
        socket?.disconnect?.();
      } catch (_) {}
    };
  }, []);

  function renderLiveGridItem(sig, idx) {
    const isHeatFill = sig._liveSource === "hot_fill";
    const sec = sig._api
      ? Math.max(0, Math.round(Number(sig._api.entryWindowMinutesLeft || 0) * 60))
      : entryCountdownByMint[sig.mint] || 0;
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
    const rawDecision = sig._api?.decision;
    const actionKey =
      rawDecision === "MERCADO" ? "MARKET_ONLY" : rawDecision || suggestedAction(sig.signalStrength, strategyMode, "feed");
    let actionLabel = actionKey;
    if (actionKey === "MARKET_ONLY") actionLabel = t("war.live.decisionMarketOnly");
    else if (actionKey === "ENTER NOW") actionLabel = t("war.live.decision.enter");
    else if (actionKey === "PREPARE") actionLabel = t("war.live.decision.prepare");
    else if (actionKey === "STAY OUT") actionLabel = t("war.live.decision.stayout");
    const decisionEmoji =
      actionKey === "MARKET_ONLY" ? "" : actionKey === "ENTER NOW" ? "🟢 " : actionKey === "PREPARE" ? "🟡 " : "🔴 ";
    const hot = idx === signalCursor % Math.max(1, liveSignalsForGrid.length);
    const coordOnCard =
      selectedMint && sig.mint === selectedMint && deskCoordination?.redSignal ? deskCoordination.redSignal : null;
    const narrative = narratives.find((n) => n.mint === sig.mint) || null;
    const whyLines = whyNowBulletLines(sig);
    const rankInfo = signalsRankDeltas.get(sig.mint) || { rank: idx + 1, delta: 0, isNew: false };
    const tick = sig.mint ? tickerByMint[sig.mint] : null;
    const px = Number(tick?.price ?? sig.token?.price);
    const chg = Number(tick?.priceChange24h ?? sig.token?.change);
    const hasPx = Number.isFinite(px) && px > 0;
    const hasChg = Number.isFinite(chg);
    return (
      <RealtimeTokenCardShell
        data-testid="sl-war-live-card"
        mint={sig.mint}
        staticScore={sig.signalStrength}
        actionKey={actionKey}
        smartMoneyCount={sig.smartWallets}
        title={
          sig.mint && isProbableSolanaMint(sig.mint)
            ? isHeatFill
              ? t("war.live.titleHintHeat")
              : t("war.live.titleHintDb")
            : undefined
        }
        onClick={(e) => {
          if (!sig.mint || !isProbableSolanaMint(sig.mint)) return;
          if (cockpitCardClickTargetIsInteractive(e)) return;
          e.preventDefault();
          onSelectMint(sig.mint, {
            src: isHeatFill ? "heat" : "live",
            tr: sig.signalStrength,
            sw: Math.max(0, Math.round(Number(sig?.smartWallets || 0)))
          });
        }}
        baseClassName={`${
          isHeatFill
            ? "sl-terminal-shell sl-terminal-shell--heat rounded-md border border-amber-500/25 bg-gradient-to-b from-amber-950/25 to-white/[0.02] p-1.5 sm:p-2 space-y-1 touch-manipulation transition-all duration-300 hover:-translate-y-[1px] hover:border-amber-400/45 hover:shadow-[0_0_18px_rgba(245,158,11,0.14)]"
            : "sl-terminal-shell sl-terminal-shell--live sl-glow-live rounded-md border border-white/10 bg-white/[0.02] p-1.5 sm:p-2 space-y-1 touch-manipulation transition-all duration-300 hover:-translate-y-[1px] hover:border-emerald-400/45 hover:shadow-[0_0_18px_rgba(16,185,129,0.22)]"
        } ${hot ? (isHeatFill ? "ring-1 ring-amber-500/30" : "ring-1 ring-emerald-500/35") : ""} ${
          sig.mint && isProbableSolanaMint(sig.mint) ? "cursor-pointer" : ""
        } ${selectedMint && sig.mint === selectedMint ? "ring-2 ring-cyan-500/40" : ""}`}
        watchedClassName={
          isHeatFill
            ? "!border-amber-500/40 ring-1 ring-amber-500/45 shadow-[0_0_16px_rgba(245,158,11,0.16)]"
            : "!border-emerald-500/35 ring-1 ring-emerald-500/50 shadow-[0_0_18px_rgba(16,185,129,0.18)]"
        }
      >
        {({ displayScore, smartMoneyCount }) => (
          <>
        <SentinelNarrativeBanner narrative={narrative} />
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1 mb-0 flex-wrap">
              <RankBadge rank={rankInfo.rank} />
              <RankDeltaChip delta={rankInfo.delta} isNew={rankInfo.isNew} />
              {isHeatFill ? (
                <span className="text-[6px] font-bold uppercase tracking-wider px-1 py-px rounded border border-amber-500/45 bg-amber-500/15 text-amber-100/95">
                  {t("war.live.badgeHeat")}
                </span>
              ) : (
                <span className="text-[6px] font-bold uppercase tracking-wider px-1 py-px rounded border border-emerald-500/45 bg-emerald-500/12 text-emerald-100/95">
                  {t("war.live.badgeSignal")}
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-white tracking-tight truncate leading-tight">${sig.symbol}</p>
            <p className="text-[8px] text-cyan-200/85 font-mono mt-0.5 leading-tight">
              {sig._liveSource === "hot_fill"
                ? `${sig.signalStrength}/100 · heat`
                : `${sig.smartWallets} w · live`}
            </p>
            {hasPx || hasChg ? (
              <div
                className={`mt-0.5 flex items-baseline justify-between gap-2 text-[10px] font-mono leading-tight ${
                  quotesPricesFetching ? "opacity-90" : ""
                }`}
              >
                <span className="text-white/95 tabular-nums truncate min-w-0">
                  {hasPx ? (
                    <AnimatedNumber value={px} prefix="$" decimalPlaces={px < 0.01 ? 8 : 6} />
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </span>
                {hasChg ? (
                  <span className={`shrink-0 tabular-nums ${chg >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    <AnimatedNumber value={chg} decimalPlaces={2} prefix={chg >= 0 ? "+" : ""} suffix="%" />
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <span
            className={`shrink-0 text-[7px] max-w-[4.25rem] text-right leading-tight px-0.5 py-0.5 rounded border line-clamp-2 ${confidenceTone(sig.signalStrength)}`}
            title={confidenceTr(sig.signalStrength)}
          >
            {confidenceTr(sig.signalStrength)}
          </span>
        </div>

        <div className="space-y-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[7px] uppercase tracking-[0.12em] text-gray-500 font-semibold">{t("war.combat.thScore")}</p>
            <span className="text-[7px] text-gray-500 font-mono">/ 100</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-black tabular-nums font-mono text-white leading-none tracking-tight">
              <AnimatedNumber value={displayScore} decimalPlaces={0} />
            </span>
            <div className="flex-1 h-0.5 sm:h-1 rounded-full bg-gray-900 overflow-hidden ring-1 ring-white/8 mb-0.5 min-w-0">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${scoreBarGradient(sig.signalStrength)}`}
                style={{ width: `${displayScore}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-0.5">
          <span className={`inline-flex items-center justify-center ${feedDecisionPillClass(actionKey, sig.signalStrength)}`}>
            {decisionEmoji}
            {actionLabel}
          </span>
          {coordOnCard ? (
            <span className="text-[8px] px-1 py-0.5 rounded border border-rose-500/40 bg-rose-500/15 text-rose-200 font-mono" title="Wallet cluster coordination (same as token page)">
              {String(coordOnCard).replace(/_/g, " ")}
            </span>
          ) : null}
          <TacticalRegimePill
            signalStrength={sig.signalStrength}
            token={sig.token}
            priceChange24h={Number(tick?.priceChange24h ?? sig.token?.change) || 0}
          />
          {!isHeatFill && (sig._api?.confluence || (!sig._api && sig.signalStrength >= 88)) ? (
            <span className="text-[9px] text-violet-200 bg-violet-500/10 border border-violet-500/25 rounded px-1 py-0.5 font-mono">
              🧬 multi
            </span>
          ) : null}
          {smartMoneyCount > 0 ? (
            <span className="text-[8px] px-1 py-0.5 rounded border border-indigo-400/40 bg-indigo-500/12 text-indigo-100 font-mono font-bold">
              {smartMoneyCount} SM
            </span>
          ) : null}
        </div>

        <div className="rounded border border-white/8 bg-black/30 px-1.5 py-1">
          <p className="text-[7px] text-gray-500 uppercase tracking-wide font-semibold">
            {isHeatFill ? t("war.live.metricsMarket") : t("war.live.whyNow")}
          </p>
          <ul className="text-[8px] text-gray-200 mt-0.5 space-y-0 leading-snug">
            {whyLines.slice(0, 3).map((line, li) => (
              <li key={li} className="flex gap-1">
                <span className={`shrink-0 ${isHeatFill ? "text-amber-400/85" : "text-emerald-500/80"}`}>•</span>
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

        {isHeatFill ? (
          <div className="rounded border border-amber-500/20 bg-amber-500/[0.06] px-1.5 py-1">
            <p className="text-[8px] text-amber-100/90 font-mono leading-snug">{t("war.live.heatNoEntry")}</p>
          </div>
        ) : (
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
        )}

        {!isHeatFill ? (
          <p className="text-[9px] text-cyan-200/85 font-mono truncate">
            {sig._api?.timeAdvantage || `Earlier than ${Math.max(72, Math.min(96, sig.signalStrength))}% of traders`}
          </p>
        ) : null}
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
                rel={EXTERNAL_ANCHOR_REL}
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
          </>
        )}
      </RealtimeTokenCardShell>
    );
  }

  const dbSignalCount = liveSignalPool.filter((s) => s._liveSource !== "hot_fill").length;
  const heatFillCount = liveSignalPool.filter((s) => s._liveSource === "hot_fill").length;

  return (
    <section data-testid="sl-war-live-section" translate="no" className="sl-section">
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="sl-label text-[9px] inline-flex items-center gap-1.5 !text-gray-500">
              <Sparkles size={12} className="text-emerald-400/95 shrink-0" aria-hidden />
              <span className="tracking-[0.14em]">{t("war.live.decisionFeedLabel")}</span>
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                {t("war.live.liveTitle")}
              </h2>
              <button
                type="button"
                onClick={onToggleLiveExpanded}
                aria-expanded={liveExpanded}
                aria-label={liveExpanded ? t("war.live.collapseAria") : t("war.live.expandAria")}
                title={liveExpanded ? t("war.live.collapseTitle") : t("war.live.expandTitle")}
                className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.12] bg-gradient-to-b from-white/[0.07] to-white/[0.02] text-cyan-200/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all hover:border-cyan-400/45 hover:from-cyan-500/18 hover:to-cyan-950/25 hover:text-cyan-50 hover:shadow-[0_0_22px_rgba(34,211,238,0.18)] active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050a0f]"
              >
                {liveExpanded ? (
                  <ChevronsUp className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                ) : (
                  <ChevronsDown className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
                )}
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5 leading-snug max-w-[min(100%,28rem)]">
              {t("war.live.poolLine", {
                db: dbSignalCount,
                heat: heatFillCount,
                vis: liveSignalsForGrid.length,
                pool: liveSignalPool.length
              })}
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-1">
            <div className="flex flex-wrap items-center gap-1">
              <Link
                href="/wallet-stalker"
                className="sl-glow-info w-[5cm] max-w-[62vw] h-7 px-2 rounded-md border border-cyan-500/30 bg-cyan-500/[0.08] text-cyan-100 no-underline inline-flex items-center justify-between gap-1"
              >
                <span className="text-[10px] uppercase tracking-wide truncate">{t("war.live.walletActivity")}</span>
                <span className="text-[10px] font-mono shrink-0">{stalkerUnread > 0 ? `+${stalkerUnread}` : "0"}</span>
              </Link>
            </div>
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border inline-flex items-center gap-1 ${
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
            <span className="text-[10px] text-gray-500 inline-flex items-center gap-0.5">
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
        {liveSignalsForGrid.length === 0 ? (
          <div className="rounded-lg border border-white/[0.08] bg-gradient-to-br from-white/[0.04] to-transparent px-4 py-5 text-[12px] text-gray-300 leading-relaxed max-w-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            {signalsFeedIsLoading ? (
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/10">
                  <Loader2 className="h-4 w-4 text-cyan-300 animate-spin" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold text-white/95">{t("war.live.empty.loadingTitle")}</p>
                  <p className="mt-1 text-gray-400 text-[11px]">{t("war.live.empty.loadingBody")}</p>
                </div>
              </div>
            ) : signalsFeedIsError ? (
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
                  <WifiOff className="h-4 w-4 text-amber-200" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold text-amber-100/95">{t("war.live.empty.errorTitle")}</p>
                  <p className="mt-1 text-gray-400 text-[11px]">{t("war.live.empty.errorBody")}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
                  <Inbox className="h-4 w-4 text-gray-400" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold text-white/90">{t("war.live.empty.inboxTitle")}</p>
                  <p className="mt-1 text-gray-400 text-[11px]">{t("war.live.empty.inboxBody")}</p>
                </div>
              </div>
            )}
          </div>
        ) : null}
        {selectedMint && deskCoordination?.redSignal ? (
          <div className="rounded-md border border-rose-500/35 bg-rose-500/[0.12] px-2.5 py-2 text-[10px] text-rose-100/95 leading-snug w-full max-w-3xl">
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
      {liveSignalsForGrid.length === 0 ? null : useVirtualizedLayout && liveVirtuosoRows.length > 0 ? (
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
