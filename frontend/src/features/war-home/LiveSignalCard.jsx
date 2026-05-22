import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { HomeCardSparkline } from "../../../components/home/HomeCardSparkline";
import { RealtimeTokenCardShell } from "../../../components/home/RealtimeTokenCardShell";
import { TokenCardAvatar } from "../../../components/home/TokenCardAvatar";
import { buildJupiterSwapUrl, EXTERNAL_ANCHOR_REL } from "../../../lib/terminalLinks";
import { isProbableSolanaMint } from "../../../lib/solanaMint.mjs";
import { useLocale } from "../../../contexts/LocaleContext";
import { deriveApexState } from "../../../components/apex";
import { cockpitCardClickTargetIsInteractive } from "../../../lib/cockpitCardClick.mjs";
import { formatUsdWhole, formatTokenPrice } from "../../../lib/formatStable";

/** Engine/heuristic RED lines - not shown on Trending (volume-only) cards. */
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
  else if (Number(token?.liquidity || 0) > 0 && Number(token?.liquidity || 0) < 50000) out.push("Low liquidity");
  const chg = Number(sig?.priceChange24h ?? token?.change ?? 0);
  if (Number.isFinite(chg) && chg < 0) out.push("Momentum fading");
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
  if (["ACCUMULATE", "ENTER NOW", "ENTER_NOW", "BUY", "LONG"].includes(raw)) return "BUY";
  if (["WATCH", "PREPARE"].includes(raw)) return "WATCH";
  if (["TOO_LATE", "TOO LATE", "STAY OUT", "STAY_OUT", "AVOID", "MARKET_ONLY"].includes(raw)) return "AVOID";
  return raw || "WATCH";
}

function accentForType(label, score) {
  const text = String(label || "").toUpperCase();
  const n = Number(score) || 0;
  if (text.includes("STRONG") || n >= 95) {
    return {
      border: "border-emerald-400/55",
      softBorder: "border-emerald-500/25",
      bg: "bg-emerald-500/10",
      text: "text-emerald-100",
      dot: "bg-emerald-400",
      glow: "shadow-[0_0_30px_rgba(16,185,129,0.18)]",
      cardBg: "from-emerald-500/[0.18] via-cyan-500/[0.06] to-transparent",
      bar: "from-emerald-500 via-emerald-300 to-cyan-200",
      ring: "ring-emerald-400/20",
      hover: "hover:border-emerald-400/50 hover:bg-emerald-500/10"
    };
  }
  if (text.includes("BUILD") || n >= 80) {
    return {
      border: "border-cyan-400/50",
      softBorder: "border-cyan-500/25",
      bg: "bg-cyan-500/10",
      text: "text-cyan-100",
      dot: "bg-cyan-300",
      glow: "shadow-[0_0_30px_rgba(34,211,238,0.15)]",
      cardBg: "from-cyan-500/[0.16] via-emerald-500/[0.05] to-transparent",
      bar: "from-blue-500 via-cyan-300 to-emerald-200",
      ring: "ring-cyan-400/20",
      hover: "hover:border-cyan-400/45 hover:bg-cyan-500/10"
    };
  }
  if (n <= 25) {
    return {
      border: "border-rose-400/45",
      softBorder: "border-rose-500/25",
      bg: "bg-rose-500/10",
      text: "text-rose-100",
      dot: "bg-rose-300",
      glow: "shadow-[0_0_30px_rgba(244,63,94,0.14)]",
      cardBg: "from-rose-500/[0.16] via-orange-500/[0.05] to-transparent",
      bar: "from-rose-500 via-orange-400 to-amber-200",
      ring: "ring-rose-400/20",
      hover: "hover:border-rose-400/45 hover:bg-rose-500/10"
    };
  }
  return {
    border: "border-amber-400/50",
    softBorder: "border-amber-500/25",
    bg: "bg-amber-500/10",
    text: "text-amber-100",
    dot: "bg-amber-300",
    glow: "shadow-[0_0_30px_rgba(245,158,11,0.14)]",
    cardBg: "from-amber-500/[0.16] via-orange-500/[0.05] to-transparent",
    bar: "from-amber-500 via-orange-400 to-red-300",
    ring: "ring-amber-400/20",
    hover: "hover:border-amber-400/45 hover:bg-amber-500/10"
  };
}

/** Parsed emission time from signals/latest card (`_api` is the raw API row). */
function signalCardEmittedMs(sig) {
  const raw = sig?._api?.createdAt ?? sig?._api?.signalAt ?? null;
  if (raw == null || raw === "") return null;
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : null;
}

function formatAgo(ms) {
  if (!Number.isFinite(ms)) return null;
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatUsdCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function formatPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function firstFinite(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function verdictForSignal({ decision, score, stale }) {
  if (stale) return score >= 70 ? "Monitor" : "Wait";
  if (decision === "BUY" || score >= 80) return "Build position";
  if (decision === "AVOID" || score < 30) return "Wait";
  if (score >= 55) return "Watchlist";
  return "Monitor";
}

function buildInsight({ walletCount, liquidity, chg24, chg5, stale, score, flags }) {
  if (stale) {
    return score < 40
      ? "Stale market data. Wait for fresh confirmation before acting."
      : "Signal is aging; verify fresh flow before acting."
  }
  if (Array.isArray(flags) && flags.length) {
    const text = String(flags[0] || "").replace(/\.$/, "");
    return `${text}. Use tighter risk controls.`;
  }
  const liqLabel = formatUsdCompact(liquidity) || "unknown liquidity";
  const wallets = walletCount > 0 ? `${walletCount} smart wallets` : "Smart-money activity";
  if (Number.isFinite(chg5) && chg5 > 1) return `${wallets} active; liquidity ${liqLabel}; 5m momentum rising.`;
  if (Number.isFinite(chg24) && chg24 > 0) return `${wallets} detected; liquidity ${liqLabel}; positive 24h tape.`;
  if (Number.isFinite(chg24) && chg24 < -20) return `${wallets} detected, but 24h trend is under pressure.`;
  return `${wallets} detected; liquidity ${liqLabel}; awaiting stronger confirmation.`;
}

function SignalAvatar({ tokenLike, symbol, accent }) {
  const url = tokenLike?.token?.imageUrl || tokenLike?.imageUrl || tokenLike?._api?.imageUrl || null;
  const [broken, setBroken] = useState(false);
  const letter = String(symbol || "T").replace(/^\$/, "").trim().charAt(0).toUpperCase() || "T";

  if (!url || broken) {
    return (
      <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border ${accent?.softBorder || "border-white/10"} bg-gradient-to-br from-white/[0.12] to-white/[0.03] text-2xl font-black text-zinc-100 ring-1 ring-white/[0.05]`}>
        {letter}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      width={64}
      height={64}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      className={`h-16 w-16 shrink-0 rounded-2xl border ${accent?.softBorder || "border-white/10"} bg-zinc-800 object-cover ring-1 ring-white/[0.05] shadow-[0_0_22px_rgba(16,185,129,0.14)]`}
    />
  );
}

function ScoreGauge({ value, accent }) {
  const score = Math.max(0, Math.min(100, Number(value) || 0));
  const deg = Math.round(score * 3.6);

  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
      <div
        className={`absolute inset-0 rounded-full blur-sm opacity-60 ${accent.text}`}
        style={{ background: `conic-gradient(currentColor ${deg}deg, transparent 0deg)` }}
      />
      <div
        className={`relative flex h-14 w-14 items-center justify-center rounded-full ${accent.text}`}
        style={{ background: `conic-gradient(currentColor ${deg}deg, rgba(255,255,255,0.08) 0deg)` }}
      >
        <div className="flex h-10 w-10 flex-col items-center justify-center rounded-full bg-zinc-950/95 text-center ring-1 ring-white/[0.06]">
          <span className="font-mono text-sm font-black leading-none text-zinc-50 tabular-nums">{Math.round(score)}</span>
          <span className="mt-0.5 text-[6px] font-bold uppercase tracking-[0.18em] text-zinc-500">score</span>
        </div>
      </div>
    </div>
  );
}

export function LiveSignalCard({
  sig,
  idx,
  signalCursor,
  displaySignalCount,
  selectedMint,
  signalsRankDeltas,
  tickerByMint,
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
  const rawScore = Number(sig.signalStrength ?? sig.sentinelScore ?? 0);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;
  const rawDecision = sig._api?.decision;
  const actionKey = rawDecision === "MERCADO" ? "MARKET_ONLY" : rawDecision || (score >= 80 ? "WATCH" : "AVOID");
  const normalizedDecision = normalizeSignalDecision(actionKey);
  const hot = idx === signalCursor % Math.max(1, displaySignalCount);
  const emittedMs = signalCardEmittedMs(sig);
  const ago = formatAgo(emittedMs);
  const isStaleCard = !isHeatFill && emittedMs != null && Date.now() - emittedMs > 60_000;
  const rankInfo = signalsRankDeltas.get(sig.mint) || { rank: idx + 1, delta: 0, isNew: false };
  const tick = sig.mint ? tickerByMint[sig.mint] : null;
  const px = Number(tick?.price ?? sig.token?.price);
  const chg = Number(tick?.priceChange24h ?? sig.token?.change);
  const hasPx = Number.isFinite(px) && px > 0;
  const hasChg = Number.isFinite(chg);
  const sparkCh24 = Number(tick?.priceChange24h ?? sig.token?.change ?? sig._api?.spotChange24h);
  const sparkCh5 = Number(sig._api?.priceChange5m);
  const hasSparkCh5 = Number.isFinite(sparkCh5);
  const safeLiq = firstFinite(tick?.liquidity, sig.liquidityUsd, sig.token?.liquidity, sig._api?.liquidityUsd);
  const hasLiq = safeLiq != null && safeLiq > 0;
  const vol24 = firstFinite(tick?.volume24h, sig.token?.volume24h, sig._api?.volume24h);
  const hasVol24 = vol24 != null && vol24 > 0;
  const walletCount = Math.max(0, Math.round(Number(sig.smartWallets ?? sig.smartMoneyCount ?? 0) || 0));
  const typeLabel = confidenceTr(score);
  const accent = accentForType(typeLabel, score);
  const apexState = isHeatFill ? "active" : deriveApexState(score);
  const symbol = String(sig.symbol || sig.token?.symbol || sig._api?.token || "TOKEN").replace(/^\$/, "").trim() || "TOKEN";
  const validMint = Boolean(sig.mint && isProbableSolanaMint(sig.mint));
  const redFlags = Array.isArray(sig._api?.redFlags) ? sig._api.redFlags.filter(Boolean).slice(0, 2) : [];
  const reportHref = validMint ? `/token/${sig.mint}` : "#";
  const verdict = verdictForSignal({ decision: normalizedDecision, score, stale: isStaleCard });
  const insight = useMemo(
    () => buildInsight({ walletCount, liquidity: safeLiq, chg24: chg, chg5: sparkCh5, stale: isStaleCard, score, flags: redFlags }),
    [walletCount, safeLiq, chg, sparkCh5, isStaleCard, score, redFlags]
  );

  return (
    <RealtimeTokenCardShell
      data-testid="sl-war-live-card"
      data-apex-state={apexState}
      mint={sig.mint}
      staticScore={score}
      actionKey={actionKey}
      smartMoneyCount={walletCount}
      title={
        sig.mint && isProbableSolanaMint(sig.mint)
          ? isHeatFill
            ? t("war.live.titleHintHeat")
            : t("war.live.titleHintDb")
          : undefined
      }
      onClick={(e) => {
        if (!validMint) return;
        if (cockpitCardClickTargetIsInteractive(e)) return;
        e.preventDefault();
        onSelectMint(sig.mint, {
          src: isHeatFill ? "heat" : "live",
          tr: score,
          sw: walletCount
        });
      }}
      hideExecutionBar={isWarMode}
      baseClassName={`terminal-card-interactive group mb-3 relative overflow-hidden rounded-xl border ${accent.border} bg-zinc-950/90 p-0 text-zinc-100 ${accent.glow} shadow-[0_18px_48px_rgba(0,0,0,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:border-white/25 hover:bg-zinc-900 ${
        isHeatFill ? "sl-terminal-shell--heat" : "sl-terminal-shell--live"
      } ${hot ? `ring-1 ${accent.ring}` : ""} ${validMint ? "cursor-pointer" : ""} ${
        selectedMint && sig.mint === selectedMint ? `ring-2 ${accent.ring}` : ""
      }`}
      style={{ minHeight: 280, maxHeight: 340 }}
      watchedClassName={`ring-1 ${accent.ring} shadow-[0_0_22px_rgba(255,255,255,0.10)]`}
    >
      {({ displayScore }) => {
        const displayScoreSafe = Number.isFinite(Number(displayScore))
          ? Math.max(0, Math.min(100, Math.round(Number(displayScore))))
          : score;

        if (isHeatFill) {
          const trendingFlags = redFlagsForTrendingFill(sig);
          const vol24 = Number(sig?.token?.volume24h ?? sig?.volume24h ?? sig?._api?.volume24h ?? 0);
          const liqNum = Number(sig?.liquidityUsd ?? sig?.token?.liquidity ?? sig?.liquidity ?? 0);
          const hasVol = Number.isFinite(vol24) && vol24 > 0;
          const hasTrendLiq = Number.isFinite(liqNum) && liqNum > 0;
          const avatarSize = isWarMode ? 28 : 32;
          const symbolMetaTitle =
            [hasTrendLiq && `Liq ${liqNum}`, hasChg && `24h ${chg}%`, sig.poolAge && `Pool ${sig.poolAge}`]
              .filter(Boolean)
              .join(" / ") || undefined;

          const trendingMarketRow = (
            <div
              className={`grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] font-mono leading-tight ${
                quotesPricesFetching ? "opacity-90" : ""
              }`}
            >
              <div className="min-w-0">
                <span className="text-[9px] uppercase tracking-wide text-sl-muted/80">Price </span>
                <span className="text-sl-text tabular-nums">{hasPx ? `$${formatTokenPrice(px)}` : "-"}</span>
              </div>
              <div className="min-w-0 text-right">
                <span className="text-[9px] uppercase tracking-wide text-sl-muted/80">24h </span>
                <span className={`tabular-nums ${hasChg ? (chg >= 0 ? "text-emerald-400" : "text-red-400") : "text-sl-muted"}`}>
                  {hasChg ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "-"}
                </span>
              </div>
              <div className="min-w-0">
                <span className="text-[9px] uppercase tracking-wide text-sl-muted/80">Vol 24h </span>
                <span className="text-sl-text tabular-nums">{hasVol ? `$${formatUsdWhole(vol24)}` : "-"}</span>
              </div>
              <div className="min-w-0 text-right">
                <span className="text-[9px] uppercase tracking-wide text-sl-muted/80">Liq </span>
                <span className="text-sl-text tabular-nums">{hasTrendLiq ? `$${formatUsdWhole(liqNum)}` : "-"}</span>
              </div>
            </div>
          );

          const trendingDisclaimer = (
            <p className="text-[10px] text-sl-muted/70 leading-snug pt-1">{t("war.live.trendingDisclaimer")}</p>
          );

          if (isWarMode) {
            return (
              <div className="space-y-2 p-3">
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
                  <span className="text-[6px] font-bold uppercase px-1 py-px rounded border border-amber-500/45 bg-amber-500/15 text-amber-100/95 war-badge shrink-0">
                    {t("war.live.badgeHeat")}
                  </span>
                </div>
                {trendingMarketRow}
                {trendingFlags.length ? (
                  <p className="text-[9px] text-red-200/95 truncate leading-tight">RED: {trendingFlags.join(" / ")}</p>
                ) : null}
                <TrendingSwapLinks sig={sig} />
                {trendingDisclaimer}
              </div>
            );
          }

          return (
            <div className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <TokenCardAvatar tokenLike={{ ...sig, ...sig._api }} mint={sig.mint} size={avatarSize} variant="heat" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 mb-0 flex-wrap">
                      <span className="text-[6px] font-bold uppercase px-1 py-px rounded border border-amber-500/45 bg-amber-500/15 text-amber-100/95">
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
                <p className="text-[9px] text-red-200/95 truncate leading-tight">RED: {trendingFlags.join(" / ")}</p>
              ) : null}
              <TrendingSwapLinks sig={sig} />
              {trendingDisclaimer}
            </div>
          );
        }

        return (
          <div className="relative flex h-full min-h-[320px] flex-col p-4 sm:p-5">
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${accent.cardBg}`} aria-hidden />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" aria-hidden />
            <div className="relative flex items-start justify-between gap-3 border-b border-white/[0.08] pb-3">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1 font-mono text-[10px] font-semibold text-zinc-300">
                  #{rankInfo.rank || idx + 1}
                </span>
                <span className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-100">
                  Signal
                </span>
                {isStaleCard ? (
                  <span className="rounded-md border border-rose-500/35 bg-rose-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-rose-100">
                    Stale data
                  </span>
                ) : null}
                <span className={`rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${accent.border} ${accent.bg} ${accent.text}`}>
                  {typeLabel}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400">
                  {walletCount > 0 ? <span>{walletCount} wallets</span> : null}
                  {ago ? <span>{ago}</span> : null}
                  <span className={`h-2 w-2 rounded-full ${accent.dot} shadow-[0_0_10px_currentColor]`} aria-hidden />
                </div>
              </div>
            </div>

            <div className="relative flex min-w-0 items-center gap-4 pt-4">
              <SignalAvatar tokenLike={{ ...sig, token: sig.token, _api: sig._api }} symbol={symbol} accent={accent} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-2xl font-black tracking-tight text-zinc-50" title={`$${symbol}`}>
                  ${symbol}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                  {sig.token?.name || sig._api?.name || sig._api?.tokenName || symbol}
                </p>
                <div className={`mt-2 min-w-0 font-mono text-sm ${quotesPricesFetching ? "opacity-80" : ""}`}>
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-lg font-black text-zinc-100 tabular-nums">
                      {hasPx ? `$${formatTokenPrice(px)}` : "Price unavailable"}
                    </span>
                    {hasChg ? (
                      <span className={`text-sm font-bold tabular-nums ${chg >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {formatPct(chg)} <span className="text-[9px] font-semibold uppercase text-zinc-500">24h</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-center gap-1">
                <ScoreGauge value={displayScoreSafe} accent={accent} />
              </div>
            </div>

            <div className="relative mt-4 grid grid-cols-3 overflow-hidden rounded-lg border border-white/10 bg-black/25 shadow-inner shadow-black/40">
              <div className="border-r border-white/[0.06] px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">Liquidity</p>
                <p className="mt-1 font-mono text-sm font-black text-zinc-100">{hasLiq ? formatUsdCompact(safeLiq) : "—"}</p>
              </div>
              <div className="border-r border-white/[0.06] px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">5m change</p>
                <p className={`mt-1 font-mono text-sm font-black ${hasSparkCh5 ? (sparkCh5 >= 0 ? "text-emerald-300" : "text-rose-300") : "text-zinc-500"}`}>
                  {hasSparkCh5 ? formatPct(sparkCh5) : "—"}
                </p>
              </div>
              <div className="px-3 py-2">
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">24h volume</p>
                <p className="mt-1 font-mono text-sm font-black text-zinc-100">{hasVol24 ? formatUsdCompact(vol24) : "—"}</p>
              </div>
            </div>

            <div className="relative mt-3 overflow-hidden rounded-lg border border-white/[0.08] bg-black/25 p-3">
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 h-6 w-6 shrink-0 rounded-md border ${accent.softBorder} ${accent.bg}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500">Readout</p>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-300">{insight}</p>
                </div>
              </div>
            </div>

            <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-md border px-2 py-1 text-[10px] font-black ${accent.border} ${accent.bg} ${accent.text}`}>
                {verdict}
              </span>
              {redFlags.map((flag, flagIdx) => (
                <span
                  key={`${flag}-${flagIdx}`}
                  className="rounded-md border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold text-rose-100"
                >
                  {String(flag)}
                </span>
              ))}
            </div>

            <div className="relative mt-auto flex items-center gap-2 pt-4">
              <button
                type="button"
                disabled={!validMint}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!validMint) return;
                  onSelectMint(sig.mint, { src: "live", tr: displayScoreSafe, sw: walletCount });
                }}
                className={`flex h-9 flex-1 items-center justify-center rounded-md border px-3 text-[11px] font-black uppercase tracking-[0.06em] transition ${
                  validMint
                    ? `border-white/10 bg-white/[0.06] text-zinc-100 ${accent.hover}`
                    : "cursor-not-allowed border-white/5 bg-white/[0.02] text-zinc-600"
                }`}
              >
                Open Intel
              </button>
              <Link
                href={reportHref}
                aria-disabled={!validMint}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!validMint) e.preventDefault();
                }}
                className={`flex h-9 flex-1 items-center justify-center rounded-md border px-3 text-[11px] font-black uppercase tracking-[0.06em] no-underline transition ${
                  validMint
                    ? `${accent.border} ${accent.bg} ${accent.text} hover:bg-white/[0.08]`
                    : "pointer-events-none cursor-not-allowed border-white/5 bg-white/[0.02] text-zinc-600"
                }`}
              >
                View Chart
              </Link>
            </div>
          </div>
        );
      }}
    </RealtimeTokenCardShell>
  );
}
