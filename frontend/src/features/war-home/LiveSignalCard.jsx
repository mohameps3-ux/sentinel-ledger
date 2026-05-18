import { useCallback } from "react";
import Link from "next/link";
import { narrativeFromData } from "@/lib/narrativeFromData";
import {
  confidenceTone,
  entryWindowFromCountdown,
  feedDecisionPillClass,
  scoreBarGradient,
  suggestedAction,
  whyNowBulletLines
} from "@/lib/signalUtils";
import { redFlagsForSignal } from "@/lib/redFlags";
import { LiveCardOverlay } from "../../../components/home/LiveCardOverlay";
import { TokenCardAvatar } from "../../../components/home/TokenCardAvatar";
import { HomeCardSparkline } from "../../../components/home/HomeCardSparkline";
import { RealtimeTokenCardShell } from "../../../components/home/RealtimeTokenCardShell";
import { RulePerformanceBadge } from "../../../components/signals/RulePerformanceBadge";
import { buildJupiterSwapUrl, EXTERNAL_ANCHOR_REL } from "../../../lib/terminalLinks";
import { isProbableSolanaMint } from "../../../lib/solanaMint.mjs";
import { RankBadge, RankDeltaChip } from "./tabs/RankIndicators";
import { AnimatedNumber } from "../../../components/ui/AnimatedNumber";
import { useLocale } from "../../../contexts/LocaleContext";
import { deriveApexState } from "../../../components/apex";
import { cockpitCardClickTargetIsInteractive } from "../../../lib/cockpitCardClick.mjs";
import { formatUsdWhole, formatTokenPrice } from "../../../lib/formatStable";

/** Engine/heuristic RED lines — not shown on Trending (volume-only) cards. */
function isEngineDerivedRedFlag(line) {
  const s = String(line);
  return /sentinel score below conviction/i.test(s) || /cluster conviction low/i.test(s);
}

/** Market-fact RED flags only (Trending / hot_fill). */
function redFlagsForTrendingFill(sig) {
  const api = sig?._api;
  if (Array.isArray(api?.redFlags) && api.redFlags.length) {
    return api.redFlags.filter((line) => !isEngineDerivedRedFlag(line));
  }
  const token = sig?.token || {};
  const out = [];
  const liq = Number(sig?.liquidityUsd ?? token?.liquidity ?? sig?.liquidity ?? 0);
  if (liq > 0 && liq < 50000) out.push(`Low liquidity: $${formatUsdWhole(Math.round(liq))}`);
  else if (Number(token?.liquidity || 0) > 0 && Number(token?.liquidity || 0) < 50000) out.push("⚠️ Low liquidity");
  const chg = Number(sig?.priceChange24h ?? token?.change ?? 0);
  if (Number.isFinite(chg) && chg < 0) out.push("⚠️ Momentum fading");
  return out;
}

function TrendingSwapLinks({ sig }) {
  return (
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
            className="btn-ghost-sm"
          >
            {size} SOL
          </a>
        );
      })}
      {sig.mint && isProbableSolanaMint(sig.mint) ? (
        <Link href={`/token/${sig.mint}`} className="btn-ghost-sm ml-auto" title="Open Token Intel">
          Token Intel
        </Link>
      ) : null}
    </div>
  );
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

function warActionBadgeClass(safeAction) {
  const a = String(safeAction ?? "").trim().toUpperCase();
  if (a === "BUY" || a === "ENTER NOW" || a === "ENTER_NOW" || a === "SCALP") return "war-action-buy";
  if (a === "WATCH" || a === "PREPARE") return "war-action-watch";
  return "war-action-avoid";
}

/** Parsed emission time from signals/latest card (`_api` is the raw API row). */
function signalCardEmittedMs(sig) {
  const raw = sig?._api?.createdAt ?? sig?._api?.signalAt ?? null;
  if (raw == null || raw === "") return null;
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : null;
}

export function LiveSignalCard({
  sig,
  idx,
  strategyMode,
  signalCursor,
  displaySignalCount,
  selectedMint,
  deskCoordination,
  signalsRankDeltas,
  tickerByMint,
  entryCountdownByMint,
  onSelectMint,
  quotesPricesFetching,
  isWarMode
}) {
  const { t } = useLocale();

  const confidenceTr = useCallback(
    (signalStrength) => {
      if (signalStrength >= 95) return t("war.live.confidence.strong");
      if (signalStrength >= 80) return t("war.live.confidence.build");
      return t("war.live.confidence.low");
    },
    [t]
  );

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
  const decision = normalizeSignalDecision(actionKey);
  const accentColor = accentColorForDecision(decision, sig.signalStrength);
  const timeLeft = sig._api?.entryWindowMinutesLeft != null ? Math.max(0, Math.round(Number(sig._api.entryWindowMinutesLeft) || 0)) : Math.max(0, Math.ceil(sec / 60));
  const hot = idx === signalCursor % Math.max(1, displaySignalCount);
  const emittedMs = signalCardEmittedMs(sig);
  const isStaleCard = !isHeatFill && emittedMs != null && Date.now() - emittedMs > 60_000;
  const coordOnCard =
    selectedMint && sig.mint === selectedMint && deskCoordination?.redSignal ? deskCoordination.redSignal : null;
  const whyLines = whyNowBulletLines(sig);
  const rankInfo = signalsRankDeltas.get(sig.mint) || { rank: idx + 1, delta: 0, isNew: false };
  const tick = sig.mint ? tickerByMint[sig.mint] : null;
  const px = Number(tick?.price ?? sig.token?.price);
  const chg = Number(tick?.priceChange24h ?? sig.token?.change);
  const hasPx = Number.isFinite(px) && px > 0;
  const hasChg = Number.isFinite(chg);
  const sparkCh24 = Number(tick?.priceChange24h ?? sig.token?.change ?? sig._api?.spotChange24h);
  const sparkCh5 = Number(sig._api?.priceChange5m);
  const apexState = isHeatFill ? "active" : deriveApexState(sig.signalStrength);

  return (
    <RealtimeTokenCardShell
      data-testid="sl-war-live-card"
      data-apex-state={apexState}
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
      hideExecutionBar={isWarMode}
      baseClassName={`apex-card terminal-card-interactive group mb-2 relative ${isWarMode ? "feed-card-enter" : ""} ${
        isHeatFill
          ? "sl-home-card-compact sl-terminal-shell sl-terminal-shell--heat bg-gradient-to-b from-amber-950/25 to-sl-card p-1.5 sm:p-2 space-y-1 touch-manipulation transition-all duration-300 hover:max-h-none hover:-translate-y-[1px] hover:shadow-[0_0_18px_rgba(250,204,21,0.18)]"
          : "sl-home-card-compact sl-terminal-shell sl-terminal-shell--live bg-sl-card p-1.5 sm:p-2 space-y-1 touch-manipulation transition-all duration-300 hover:max-h-none hover:-translate-y-[1px] hover:shadow-[0_0_18px_rgba(250,204,21,0.14)]"
      } ${hot ? "ring-1 ring-[rgba(250,204,21,0.32)]" : ""} ${
        sig.mint && isProbableSolanaMint(sig.mint) ? "cursor-pointer" : ""
      } ${selectedMint && sig.mint === selectedMint ? "ring-2 ring-[rgba(250,204,21,0.5)]" : ""}`}
      style={
        isWarMode
          ? { transition: "all 150ms ease" }
          : { borderLeft: `3px solid ${accentColor}`, transition: `all ${isWarMode ? 150 : 300}ms ease` }
      }
      watchedClassName={
        isHeatFill
          ? "ring-1 ring-amber-500/45 shadow-[0_0_16px_rgba(250,204,21,0.16)]"
          : "ring-1 ring-amber-500/40 shadow-[0_0_18px_rgba(250,204,21,0.16)]"
      }
    >
      {({ displayScore, smartMoneyCount, narrative }) => {
        const toneScore = Number.isFinite(Number(displayScore)) ? Number(displayScore) : Number(sig.signalStrength) || 0;
        const safeScore = Number.isFinite(Number(displayScore)) ? Math.round(Number(displayScore)) : "--";
        const safeAction = String(sig._api?.decision ?? sig.decision ?? actionKey ?? "WATCH");
        const safeLiq = sig.liquidityUsd ?? sig.token?.liquidity ?? sig.liquidity ?? null;
        const safeWallets = sig.smartMoneyCount ?? sig.smartWallets ?? 0;
        const safeChange = sig.priceChange24h ?? sig.change24h ?? sig.token?.change ?? null;
        const safePoolAge = sig.poolAge ?? sig.pairCreatedAt ?? null;
        const symbolMetaTitle =
          [safeLiq != null && `Liq ${safeLiq}`, safeChange != null && `Δ24h ${safeChange}%`, safePoolAge && `Pool ${safePoolAge}`]
            .filter(Boolean)
            .join(" · ") || undefined;
        const displayNarrative =
          narrative?.message
            ?? sig.whyNowBulletLines?.[0]
            ?? whyLines?.[0]
            ?? narrativeFromData({
                ...sig,
                _currentScore: sig._currentScore ?? sig.sentinelScore ?? 0
              });
        const severityClass =
          narrative?.severity === "URGENT"
            ? "narrative-urgent"
            : narrative?.severity === "ANOMALY"
              ? "narrative-anomaly"
              : narrative?.severity === "TACTICAL"
                ? "narrative-tactical"
                : "narrative-default";

        if (isHeatFill) {
          const trendingFlags = redFlagsForTrendingFill(sig);
          const vol24 = Number(sig?.token?.volume24h ?? sig?.volume24h ?? sig?._api?.volume24h ?? 0);
          const liqNum = Number(safeLiq ?? sig?.token?.liquidity ?? 0);
          const hasVol = Number.isFinite(vol24) && vol24 > 0;
          const hasLiq = Number.isFinite(liqNum) && liqNum > 0;
          const avatarSize = isWarMode ? 28 : 32;

          const trendingMarketRow = (
            <div
              className={`grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono leading-tight ${
                quotesPricesFetching ? "opacity-90" : ""
              }`}
            >
              <div className="min-w-0">
                <span className="text-[9px] uppercase tracking-wide text-sl-muted/80">Price </span>
                <span className="text-sl-text tabular-nums">{hasPx ? `$${formatTokenPrice(px)}` : "—"}</span>
              </div>
              <div className="min-w-0 text-right">
                <span className="text-[9px] uppercase tracking-wide text-sl-muted/80">24h </span>
                <span className={`tabular-nums ${hasChg ? (chg >= 0 ? "text-emerald-400" : "text-red-400") : "text-sl-muted"}`}>
                  {hasChg ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "—"}
                </span>
              </div>
              <div className="min-w-0">
                <span className="text-[9px] uppercase tracking-wide text-sl-muted/80">Vol 24h </span>
                <span className="text-sl-text tabular-nums">{hasVol ? `$${formatUsdWhole(vol24)}` : "—"}</span>
              </div>
              <div className="min-w-0 text-right">
                <span className="text-[9px] uppercase tracking-wide text-sl-muted/80">Liq </span>
                <span className="text-sl-text tabular-nums">{hasLiq ? `$${formatUsdWhole(liqNum)}` : "—"}</span>
              </div>
            </div>
          );

          const trendingDisclaimer = (
            <p className="text-[10px] text-sl-muted/70 leading-snug pt-1">{t("war.live.trendingDisclaimer")}</p>
          );

          if (isWarMode) {
            return (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <TokenCardAvatar tokenLike={{ ...sig, ...sig._api }} mint={sig.mint} size={avatarSize} variant="heat" />
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <p
                        className="text-xs font-bold text-sl-text tracking-tight truncate leading-tight min-w-0 flex-1"
                        title={symbolMetaTitle}
                      >
                        ${sig.symbol}
                      </p>
                      <HomeCardSparkline mint={sig.mint} change24h={sparkCh24} change5m={sparkCh5} compact />
                    </div>
                  </div>
                  <span className="text-[6px] font-bold uppercase tracking-wider px-1 py-px rounded border border-amber-500/45 bg-amber-500/15 text-amber-100/95 war-badge shrink-0">
                    {t("war.live.badgeHeat")}
                  </span>
                </div>
                {trendingMarketRow}
                {trendingFlags.length ? (
                  <p className="text-[9px] text-red-200/95 truncate leading-tight">RED: {trendingFlags.join(" · ")}</p>
                ) : null}
                <TrendingSwapLinks sig={sig} />
                {trendingDisclaimer}
              </>
            );
          }

          return (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <TokenCardAvatar tokenLike={{ ...sig, ...sig._api }} mint={sig.mint} size={avatarSize} variant="heat" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 mb-0 flex-wrap">
                      <span className="text-[6px] font-bold uppercase tracking-wider px-1 py-px rounded border border-amber-500/45 bg-amber-500/15 text-amber-100/95">
                        {t("war.live.badgeHeat")}
                      </span>
                    </div>
                    <p
                      className="text-xs font-bold text-sl-text tracking-tight truncate leading-tight"
                      title={symbolMetaTitle}
                    >
                      ${sig.symbol}
                    </p>
                  </div>
                  <HomeCardSparkline mint={sig.mint} change24h={sparkCh24} change5m={sparkCh5} />
                </div>
              </div>
              {trendingMarketRow}
              {trendingFlags.length ? (
                <p className="text-[9px] text-red-200/95 truncate leading-tight">RED: {trendingFlags.join(" · ")}</p>
              ) : null}
              <TrendingSwapLinks sig={sig} />
              {trendingDisclaimer}
            </>
          );
        }

        if (isWarMode) {
          const warAc = warActionBadgeClass(safeAction);
          return (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <TokenCardAvatar
                    tokenLike={{ ...sig, ...sig._api }}
                    mint={sig.mint}
                    size={28}
                    variant="live"
                  />
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <p
                      className="text-xs font-bold text-sl-text tracking-tight truncate leading-tight min-w-0 flex-1"
                      title={symbolMetaTitle}
                    >
                      ${sig.symbol}
                    </p>
                    <HomeCardSparkline mint={sig.mint} change24h={sparkCh24} change5m={sparkCh5} compact />
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                  <span className="text-[6px] font-bold uppercase tracking-wider px-1 py-px rounded border border-emerald-500/45 bg-emerald-500/12 text-emerald-100/95 war-badge">
                    {t("war.live.badgeSignal")}
                  </span>
                  {isStaleCard ? (
                    <span
                      className="text-[6px] font-bold uppercase tracking-wider px-1 py-px rounded border border-rose-500/40 bg-rose-500/12 text-rose-100/90 war-badge"
                      title={t("war.live.staleSignal")}
                    >
                      {t("war.live.staleSignal")}
                    </span>
                  ) : null}
                </div>
              </div>
              <span className={`war-action-badge ${warAc}`}>{safeAction}</span>
              {displayNarrative ? <div className="war-narrative-hero">{displayNarrative}</div> : null}
              <span className="war-score-secondary">{safeScore} confidence</span>
            </>
          );
        }

        return (
          <>
            {displayNarrative ? (
              <div className={`sentinel-narrative ${severityClass}`}>{displayNarrative}</div>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <TokenCardAvatar
                  tokenLike={{ ...sig, ...sig._api }}
                  mint={sig.mint}
                  size={32}
                  variant="live"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 mb-0 flex-wrap">
                    <RankBadge rank={rankInfo.rank} />
                    <RankDeltaChip delta={rankInfo.delta} isNew={rankInfo.isNew} />
                    <span className="text-[6px] font-bold uppercase tracking-wider px-1 py-px rounded border border-emerald-500/45 bg-emerald-500/12 text-emerald-100/95">
                      {t("war.live.badgeSignal")}
                    </span>
                    {isStaleCard ? (
                      <span
                        className="text-[6px] font-bold uppercase tracking-wider px-1 py-px rounded border border-rose-500/40 bg-rose-500/12 text-rose-100/90"
                        title={t("war.live.staleSignal")}
                      >
                        {t("war.live.staleSignal")}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className="text-xs font-bold text-sl-text tracking-tight truncate leading-tight"
                    title={symbolMetaTitle}
                  >
                    ${sig.symbol}
                  </p>
                  {hasPx || hasChg ? (
                    <div
                      className={`mt-0.5 flex items-baseline justify-between gap-2 text-[10px] font-mono leading-tight ${
                        quotesPricesFetching ? "opacity-90" : ""
                      }`}
                    >
                      <span className="text-sl-text/95 tabular-nums truncate min-w-0">
                        {hasPx ? (
                          <AnimatedNumber value={px} prefix="$" decimalPlaces={px < 0.01 ? 8 : 6} />
                        ) : (
                          <span className="text-sl-muted">—</span>
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
                <HomeCardSparkline mint={sig.mint} change24h={sparkCh24} change5m={sparkCh5} />
              </div>
              <span
                className={`shrink-0 self-start text-[8px] max-w-[4.75rem] text-right leading-tight px-1.5 py-0.5 rounded border line-clamp-1 ${confidenceTone(toneScore)}`}
                title={confidenceTr(toneScore)}
              >
                {confidenceTr(toneScore)}
              </span>
            </div>

            <div className="space-y-1">
              <div className="h-1 rounded-full bg-sl-card overflow-hidden ring-1 ring-white/8">
                <div className={`h-full rounded-full bg-gradient-to-r ${scoreBarGradient(toneScore)}`} style={{ width: `${displayScore}%` }} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-bold tabular-nums text-sl-text">{safeScore}/100</span>
                <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-sl-muted">{confidenceTr(toneScore)}</span>
              </div>
              <div className="score-track mx-3 mb-2">
                <div
                  className={displayScore >= 60 ? "score-fill-high" : displayScore >= 40 ? "score-fill-mid" : "score-fill-low"}
                  style={{ width: `${Math.min(displayScore, 100)}%` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-0.5">
              <span className={`inline-flex items-center justify-center ${feedDecisionPillClass(actionKey, toneScore)}`}>
                {decisionEmoji}
                {actionLabel}
              </span>
              <>
                {coordOnCard ? (
                  <span className="text-[8px] px-1 py-0.5 rounded border border-rose-500/40 bg-rose-500/15 text-rose-200 font-mono" title="Wallet cluster coordination (same as token page)">
                    {String(coordOnCard).replace(/_/g, " ")}
                  </span>
                ) : null}
                {(sig._api?.confluence || (!sig._api && toneScore >= 88)) ? (
                  <span className="text-[8px] text-blue-200 bg-blue-500/10 border border-blue-500/25 rounded px-1 py-0.5 font-mono">
                    multi
                  </span>
                ) : null}
                {safeWallets > 0 ? (
                  <span className="text-[8px] px-1 py-0.5 rounded border border-indigo-400/40 bg-indigo-500/12 text-indigo-100 font-mono font-bold">
                    {safeWallets} SM
                  </span>
                ) : null}
                <RulePerformanceBadge performance={sig._api?.rulePerformance} compact />
              </>
            </div>

            <LiveCardOverlay mint={sig.mint} />

            {redFlagsForSignal(sig).length ? (
              <p className="text-[9px] text-red-200/95 truncate leading-tight">RED: {redFlagsForSignal(sig).join(" · ")}</p>
            ) : null}

            <span className="font-mono text-2xs text-sl-muted">
              {win.label === "CLOSED" || timeLeft <= 0 ? "CLOSED" : `${timeLeft}m`}
            </span>

            <details className="border-t border-sl-border">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 w-full font-mono text-2xs text-sl-muted hover:text-sl-sub transition-colors duration-150">
                <span>WHY NOW</span>
                <span className="ml-auto">▼</span>
              </summary>
              <div className="px-3 pb-3 space-y-1">
                {whyLines.slice(0, 3).map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-blue-200 font-mono text-xs mt-0.5">›</span>
                    <span className="font-ui text-xs text-sl-sub">{r}</span>
                  </div>
                ))}
              </div>
            </details>

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
                    className="btn-ghost-sm"
                  >
                    {size} SOL
                  </a>
                );
              })}
              {sig.mint && isProbableSolanaMint(sig.mint) ? (
                <Link
                  href={`/token/${sig.mint}`}
                  className="btn-ghost-sm ml-auto"
                  title="Open Token Intel"
                >
                  Token Intel
                </Link>
              ) : null}
            </div>
          </>
        );
      }}
    </RealtimeTokenCardShell>
  );
}
