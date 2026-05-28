import { useMemo, useState } from "react";
import Link from "next/link";
import { HomeCardSparkline } from "../../../components/home/HomeCardSparkline";
import { RealtimeTokenCardShell } from "../../../components/home/RealtimeTokenCardShell";
import { isProbableSolanaMint } from "../../../lib/solanaMint.mjs";
import { deriveApexState } from "../../../components/apex";
import { cockpitCardClickTargetIsInteractive } from "../../../lib/cockpitCardClick.mjs";
import { formatTokenPrice } from "../../../lib/formatStable";
import { getMarketCap } from "@/lib/tokenCardData";
import { useMarketStore, scoreSnapshot } from "@/lib/store/marketStore";
import { getLiveSignalEmittedAtMs } from "../../../lib/liveFeedAccess";
import { pairCreatedRawToUnixMs, poolAgeMinutesFromCreatedMs } from "@/lib/pairTime";
import { resolveTokenStateChip } from "@/lib/tokenStateChip.mjs";
import { TokenStateChip } from "../../../components/cockpit/TokenStateChip";
import { SignalEdgeTag } from "../../../components/token/SignalEdgeTag";
import { resolveDominantRule } from "../../../lib/ruleTagMap.mjs";
import { buildJupiterSwapUrl, EXTERNAL_ANCHOR_REL } from "../../../lib/terminalLinks";

function normalizeSignalDecision(action) {
  const raw = String(action || "").trim().toUpperCase();
  if (["ACCUMULATE", "ENTER NOW", "ENTER_NOW", "BUY", "LONG", "BUILD"].includes(raw)) return "BUILD";
  if (["WATCH", "PREPARE", "MONITOR"].includes(raw)) return "WATCH";
  if (["TOO_LATE", "TOO LATE", "STAY OUT", "STAY_OUT", "AVOID", "MARKET_ONLY"].includes(raw)) return "LOW EDGE";
  return raw || "WATCH";
}

function firstFinite(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function formatUsdCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function formatPct(value) {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function wrColorClass(winRate) {
  const wr = Number(winRate);
  if (!Number.isFinite(wr)) return "text-zinc-400";
  if (wr >= 30) return "text-emerald-300";
  if (wr >= 20) return "text-amber-300";
  return "text-rose-300/90";
}

function regimeBadgeMeta(regime) {
  const key = String(regime || "").trim().toLowerCase();
  if (key === "volatile") {
    return {
      label: "⚡ VOLATILE EDGE",
      cls: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
    };
  }
  if (key === "trending") {
    return {
      label: "📈 TRENDING",
      cls: "border-amber-400/35 bg-amber-500/10 text-amber-200"
    };
  }
  if (key === "calm") {
    return {
      label: "🔇 LOW EDGE",
      cls: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"
    };
  }
  return null;
}

const SCORE_FOOTER_TOOLTIP =
  "Engine score blends rule signal, smart wallet activity, and recency. Pearson correlation to return is near zero; for outcomes prefer rule WR above.";

/** Map signal tag to display label (legacy helper for SignalEdgeTag). */
function ruleLabel(signal, ruleId) {
  const map = {
    cluster_buy:     "R03 · Cluster Buy",
    cluster_probing: "R03 · Cluster Probe",
    whale_accumulation: "R01 · Whale Acc.",
    liquidity_shock: "R02 · Liq. Shock",
    velocity_spike:  "R05 · Velocity"
  };
  if (signal && map[signal]) return map[signal];
  if (ruleId) return ruleId;
  return null;
}

/**
 * Classify the CURRENT market regime from available price/volume/liquidity data.
 * Mirrors the backend classifyMarketRegime logic — volatile ≥12% 24h or vol/liq ≥10.
 */
function classifyCardRegime(chg24, volume24h, liquidity) {
  const absChg = Number.isFinite(Number(chg24)) ? Math.abs(Number(chg24)) : null;
  const vol = Number(volume24h);
  const liq = Number(liquidity);
  const volLiq = Number.isFinite(vol) && Number.isFinite(liq) && liq > 0 ? vol / liq : null;
  if ((absChg != null && absChg >= 12) || (volLiq != null && volLiq >= 10)) return "volatile";
  if (absChg != null && absChg >= 5) return "trending";
  if (absChg != null) return "calm";
  return null;
}

function signalCardEmittedMs(sig) {
  const raw = sig?._api?.createdAt ?? sig?._api?.signalAt ?? sig?.createdAt ?? sig?.signalAt ?? null;
  if (raw == null || raw === "") return null;
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : null;
}

function formatAgo(ms) {
  if (!Number.isFinite(ms)) return null;
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function toneForScore(score) {
  const n = Number(score) || 0;
  if (n >= 80) {
    return {
      name: "BUILD",
      border: "border-emerald-400/55",
      bg: "bg-emerald-500/10",
      text: "text-emerald-300",
      chip: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
      glow: "shadow-[0_0_26px_rgba(16,185,129,0.16)]",
      edge: "from-emerald-400 via-emerald-300 to-cyan-300",
      ring: "text-emerald-300"
    };
  }
  if (n >= 55) {
    return {
      name: "WATCH",
      border: "border-amber-400/45",
      bg: "bg-amber-500/10",
      text: "text-amber-300",
      chip: "border-amber-400/35 bg-amber-500/10 text-amber-200",
      glow: "shadow-[0_0_24px_rgba(245,158,11,0.13)]",
      edge: "from-amber-400 via-yellow-300 to-orange-300",
      ring: "text-amber-300"
    };
  }
  return {
    name: "LOW EDGE",
    border: "border-rose-400/35",
    bg: "bg-rose-500/10",
    text: "text-rose-300",
    chip: "border-rose-400/30 bg-rose-500/10 text-rose-200",
    glow: "shadow-[0_0_22px_rgba(244,63,94,0.12)]",
    edge: "from-rose-500 via-orange-400 to-amber-300",
    ring: "text-rose-300"
  };
}

function TokenAvatar({ sig, symbol, tone }) {
  const url = sig?.token?.imageUrl || sig?.imageUrl || sig?._api?.imageUrl || sig?._api?.logoURI || null;
  const [broken, setBroken] = useState(false);
  const letter = String(symbol || "T").replace(/^\$/, "").trim().charAt(0).toUpperCase() || "T";

  if (!url || broken) {
    return (
      <div className={`flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-2xl border ${tone.border} bg-white/[0.06] text-xl font-black text-zinc-100 ${tone.glow}`}>
        {letter}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      width={58}
      height={58}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      className={`h-[58px] w-[58px] shrink-0 rounded-2xl border ${tone.border} bg-zinc-900 object-cover ${tone.glow}`}
    />
  );
}

function WalletDots({ count }) {
  const n = Math.max(0, Number(count) || 0);
  const visible = Math.min(4, n);
  if (!visible) return <span className="text-zinc-500">—</span>;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: visible }).map((_, i) => (
        <span key={i} className="h-4 w-4 rounded-full border border-white/10 bg-gradient-to-br from-blue-400/80 to-emerald-400/70 shadow-[0_0_8px_rgba(34,211,238,0.18)]" />
      ))}
      {n > visible ? <span className="ml-1 text-[10px] text-zinc-400">+{n - visible}</span> : null}
    </div>
  );
}

function Metric({ label, value, good, valueClassName = "" }) {
  return (
    <div className="min-w-0 border-r border-white/[0.06] last:border-r-0 px-2 py-1.5">
      <p className="text-[8px] uppercase tracking-[0.12em] text-zinc-500">{label}</p>
      <p className={`mt-1 truncate font-mono text-[12px] font-black tabular-nums ${valueClassName || (good === true ? "text-emerald-300" : good === false ? "text-rose-300" : "text-zinc-100")}`}>
        {value}
      </p>
    </div>
  );
}

/**
 * Card risk pill copy. NEVER returns "Delayed feed" — that used to fire for any
 * signal older than 60 s and confused PRO users (their cards looked locked).
 * The free-tier 30 min delay is communicated by the LiveDelayedFeedCard banner
 * above the grid, not by the per-card risk chip.
 */
function riskLabel({ liquidity, score, chg24 }) {
  if (Number(liquidity) > 0 && Number(liquidity) < 15000) return "Thin liquidity";
  if (Number(chg24) < -25) return "Downtrend risk";
  if (score >= 80) return "High conviction";
  if (score < 45) return "Low conviction";
  return "Needs confirmation";
}

function buildReason({ score, walletCount, liquidity, chg5, chg24, redFlags }) {
  const firstFlag = Array.isArray(redFlags) && redFlags.length ? String(redFlags[0]) : "";
  if (firstFlag) return `Risk flag: ${firstFlag}`.slice(0, 80);
  if (Number(liquidity) > 0 && Number(liquidity) < 15000) {
    return "Thin liquidity — high slippage risk";
  }
  if (Number(walletCount) >= 3 && Number(liquidity) >= 25000 && Number(chg5) > 0) {
    return "Smart wallet cluster + liquidity + momentum";
  }
  if (Number(walletCount) >= 3 && Number(chg5) <= 0) {
    return "Smart wallets accumulating despite 5m weakness";
  }
  if (Number(walletCount) < 3 && Number(chg24) > 50) {
    return "Strong 24h move, weak smart wallet confirmation";
  }
  return `Score ${score} — see desk for full intel`;
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
  const rawScore = Number(sig.signalStrength ?? sig.sentinelScore ?? sig.heatScore ?? 0);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;
  const tone = toneForScore(score);
  const actionKey = sig._api?.decision || (score >= 80 ? "BUILD" : score >= 55 ? "WATCH" : "LOW_EDGE");
  const normalizedDecision = normalizeSignalDecision(actionKey);
  const hot = idx === signalCursor % Math.max(1, displaySignalCount);
  const emittedMs = signalCardEmittedMs(sig);
  const ago = formatAgo(emittedMs);
  const rankInfo = signalsRankDeltas.get(sig.mint) || { rank: idx + 1, delta: 0, isNew: false };
  const tick = sig.mint ? tickerByMint[sig.mint] : null;
  const px = firstFinite(tick?.price, sig.token?.price, sig.price);
  const chg24 = firstFinite(tick?.priceChange24h, sig.token?.change, sig.change, sig.priceChange24h, sig._api?.spotChange24h);
  const chg5 = firstFinite(sig._api?.priceChange5m, sig.priceChange5m, tick?.priceChange5m);
  const chg15 = firstFinite(sig._api?.outcome_15m, sig._api?.priceChange15m, sig.priceChange15m);
  const chg60 = firstFinite(tick?.priceChange1h, sig._api?.priceChange1h, sig._api?.outcome_60m, sig._api?.priceChange60m, sig.priceChange60m);
  const liquidity = firstFinite(tick?.liquidity, sig.liquidityUsd, sig.token?.liquidity, sig._api?.liquidityUsd);
  const volume24h = firstFinite(tick?.volume24h, sig.token?.volume24h, sig._api?.volume24h, sig.volume24h);
  const walletCount = Math.max(0, Math.round(Number(sig.smartWallets ?? sig.smartMoneyCount ?? sig.walletCount ?? 0) || 0));
  const marketCap = getMarketCap(sig);
  const marketCapLabel = marketCap.source === "fdv" ? "FDV" : "MC";
  const redFlags = Array.isArray(sig._api?.redFlags)
    ? sig._api.redFlags
    : Array.isArray(sig.redFlags)
      ? sig.redFlags
      : [];
  const reason = buildReason({ score, walletCount, liquidity, chg5, chg24, redFlags });
  const symbol = String(sig.symbol || sig.token?.symbol || sig._api?.token || "TOKEN").replace(/^\$/, "").trim() || "TOKEN";
  const tokenName = sig.token?.name || sig._api?.name || sig._api?.tokenName || sig.name || symbol;
  const validMint = Boolean(sig.mint && isProbableSolanaMint(sig.mint));
  const reportHref = validMint ? `/token/${sig.mint}` : "#";
  const apexState = deriveApexState(score);
  const delayedRisk = riskLabel({ liquidity, score, chg24 });

  const scoreEntry = useMarketStore((s) => (sig.mint ? s.scores.get(sig.mint) : undefined));
  const liveEngineScore = scoreEntry?.scores ? scoreSnapshot(scoreEntry) : null;

  // Regime classification from current market data (mirrors backend classifyMarketRegime)
  const cardRegime = classifyCardRegime(chg24, volume24h, liquidity);

  const tileGlow = useMemo(() => {
    if (score >= 80) return "hover:shadow-[0_0_34px_rgba(16,185,129,0.20)]";
    if (score >= 55) return "hover:shadow-[0_0_30px_rgba(245,158,11,0.18)]";
    return "hover:shadow-[0_0_26px_rgba(248,113,113,0.16)]";
  }, [score]);

  // Volatile regime gets subtle amber accent border to signal high-edge opportunity
  const regimeBorderAccent = cardRegime === "volatile" ? "shadow-[inset_0_0_0_1px_rgba(251,191,36,0.18)]" : "";

  return (
    <RealtimeTokenCardShell
      data-testid="sl-war-live-card"
      data-apex-state={apexState}
      mint={sig.mint}
      staticScore={score}
      actionKey={actionKey}
      smartMoneyCount={walletCount}
      title={validMint ? "Open token intelligence" : undefined}
      onClick={(e) => {
        if (!validMint) return;
        if (cockpitCardClickTargetIsInteractive(e)) return;
        e.preventDefault();
        onSelectMint(sig.mint, { src: sig._liveSource === "hot_fill" ? "heat" : "live", tr: score, sw: walletCount });
      }}
      hideExecutionBar={isWarMode}
      baseClassName={`terminal-card-interactive group relative mb-3 overflow-hidden rounded-xl border ${tone.border} bg-[#080b10] p-0 text-zinc-100 transition-all duration-200 hover:-translate-y-[1px] ${tileGlow} ${regimeBorderAccent} ${hot ? "ring-1 ring-white/10" : ""} ${selectedMint && sig.mint === selectedMint ? "ring-2 ring-blue-400/35" : ""} ${validMint ? "cursor-pointer" : ""}`}
      style={{ minHeight: 246 }}
      watchedClassName="ring-1 ring-emerald-400/25"
    >
      {({ displayScore }) => {
        const displayScoreSafe = Number.isFinite(Number(displayScore))
          ? Math.max(0, Math.min(100, Math.round(Number(displayScore))))
          : score;
        const liveTone = toneForScore(displayScoreSafe);
        const pairMs = pairCreatedRawToUnixMs(sig._api?.pairCreatedAt ?? sig.token?.pairCreatedAt);
        const poolAgeMinutes = pairMs != null ? poolAgeMinutesFromCreatedMs(pairMs) : null;
        const emittedMs = getLiveSignalEmittedAtMs(sig);
        const signalAgeMinutes =
          emittedMs != null && Number.isFinite(emittedMs)
            ? Math.max(0, Math.floor((Date.now() - emittedMs) / 60_000))
            : null;
        const stateChip = resolveTokenStateChip({
          poolAgeMinutes,
          smartWalletCount: walletCount,
          momentumScore: liveEngineScore?.scores?.momentum ?? null,
          conviction: displayScoreSafe,
          executionScore: null,
          volume5mChangePct: chg5,
          signalAgeMinutes,
          change24hPct: chg24
        });

        // Phase 7: honest signal edge data
        const rulePerf = sig._api?.rulePerformance ?? null;
        const emissionSignals = sig._api?.emissionSignals ?? null;
        const emissionRegimeRaw = sig._api?.emissionRegime ?? null;
        const ruleSamples = rulePerf?.totalSignals != null ? Number(rulePerf.totalSignals) : null;
        const ruleWr =
          ruleSamples != null && ruleSamples > 0 && rulePerf?.successCount60m != null
            ? Number((rulePerf.successCount60m / ruleSamples) * 100)
            : null;
        const ruleAvgReturn = rulePerf?.avgReturn60m != null && Number.isFinite(Number(rulePerf.avgReturn60m))
          ? Number(rulePerf.avgReturn60m) * 100
          : null;
        const ruleCalibrated = ruleSamples != null && ruleSamples >= 80;
        const dominantRule = resolveDominantRule(emissionSignals, rulePerf);
        const edgeLabel = dominantRule.label || ruleLabel(rulePerf?.signal, rulePerf?.ruleId);
        const effectiveRegime = (() => {
          const server = String(emissionRegimeRaw || "").trim().toLowerCase();
          if (server && server !== "unknown") return server;
          return cardRegime;
        })();
        const regimeBadge = regimeBadgeMeta(effectiveRegime);
        const showEdgeTag = edgeLabel != null || effectiveRegime != null;
        const wrLineParts = [];
        if (ruleWr != null) wrLineParts.push(`WR ${Math.round(ruleWr)}%`);
        if (ruleAvgReturn != null) {
          wrLineParts.push(`avg ${ruleAvgReturn >= 0 ? "+" : ""}${ruleAvgReturn.toFixed(1)}%`);
        }
        if (ruleSamples != null && ruleSamples > 0) {
          wrLineParts.push(`n=${Number(ruleSamples).toLocaleString()}`);
        }
        return (
          <div className="relative flex h-full min-h-[246px] flex-col p-3">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.045] via-transparent to-black/20" />
            <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r ${liveTone.edge}`} />

            <div className="relative flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-1 font-mono text-[10px] font-black text-zinc-300">#{rankInfo.rank || idx + 1}</span>
                <span className="shrink-0 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-emerald-300">Signal</span>
                <span className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${liveTone.chip}`}>{normalizedDecision === "BUILD" ? "Build" : liveTone.name}</span>
                {stateChip ? <TokenStateChip state={stateChip} /> : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-1 text-right font-mono text-[10px] text-zinc-400">
                <span>{walletCount || "—"} wallets</span>
                {ago ? <span>{ago}</span> : null}
                <span className={`h-2 w-2 rounded-full ${displayScoreSafe >= 80 ? "bg-emerald-400" : displayScoreSafe >= 55 ? "bg-amber-300" : "bg-rose-400"} shadow-[0_0_10px_currentColor]`} />
              </div>
            </div>

            <div className="relative mt-3 grid grid-cols-[auto_minmax(0,1fr)_68px] items-start gap-3 border-b border-white/[0.07] pb-3">
              <TokenAvatar sig={sig} symbol={symbol} tone={liveTone} />
              <div className="min-w-0">
                <p className="truncate text-xl font-black leading-none tracking-[-0.04em] text-zinc-50" title={`$${symbol}`}>${symbol}</p>
                <p className="mt-1 truncate text-[11px] text-zinc-400" title={tokenName}>{tokenName}</p>
                {edgeLabel ? (
                  <p className="mt-2 truncate text-[12px] font-black uppercase leading-tight tracking-[-0.02em] text-zinc-100">
                    {edgeLabel}
                  </p>
                ) : null}
                {wrLineParts.length > 0 ? (
                  <p className={`mt-1 truncate font-mono text-[11px] font-bold tabular-nums ${wrColorClass(ruleWr)}`}>
                    {wrLineParts.join(" · ")}
                  </p>
                ) : null}
                {regimeBadge ? (
                  <span
                    className={`mt-1.5 inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] ${regimeBadge.cls}`}
                  >
                    {regimeBadge.label}
                  </span>
                ) : null}
                <p
                  className="mt-1.5 truncate text-[9px] font-mono text-zinc-500 tabular-nums"
                  title={SCORE_FOOTER_TOOLTIP}
                >
                  Score {displayScoreSafe} · combines wallets + recency
                </p>
                <div className={`mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 font-mono ${quotesPricesFetching ? "opacity-80" : ""}`}>
                  <span className="text-sm font-black text-zinc-100 tabular-nums">{px != null && px > 0 ? `$${formatTokenPrice(px)}` : "Price —"}</span>
                  <span className={`text-xs font-bold tabular-nums ${Number(chg24) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{formatPct(chg24)}</span>
                </div>
                <p className="mt-1 flex items-baseline gap-1.5 font-mono">
                  <span className="text-[9px] uppercase tracking-[0.14em] text-sl-muted">
                    {marketCapLabel}
                  </span>
                  <span className="text-[11px] font-bold text-zinc-200 tabular-nums">
                    {marketCap.value !== null ? formatUsdCompact(marketCap.value) : "—"}
                  </span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 pt-1">
                <HomeCardSparkline
                  mint={sig.mint}
                  change24h={chg24}
                  change5m={chg5}
                  compact
                  className="!h-10 !w-[68px] rounded bg-transparent ring-0 [&_svg]:!h-10 [&_svg]:!w-[68px]"
                />
              </div>
            </div>

            <div className="relative mt-2 grid grid-cols-3 rounded-xl border border-white/[0.07] bg-black/20">
              <Metric
                label="Hist WR"
                value={ruleWr != null ? `${Math.round(ruleWr)}%` : "—"}
                valueClassName={wrColorClass(ruleWr)}
              />
              <Metric label="Type" value={normalizedDecision === "BUILD" ? "BUILD" : liveTone.name} />
              <div className="min-w-0 px-2 py-1.5">
                <p className="text-[8px] uppercase tracking-[0.12em] text-zinc-500">Hi-win wallets</p>
                <div className="mt-1 flex min-w-0 items-center justify-between gap-1">
                  <WalletDots count={walletCount} />
                </div>
              </div>
            </div>

            <div className="relative mt-2 grid grid-cols-3 gap-0 rounded-xl border border-white/[0.07] bg-black/15 sm:grid-cols-5">
              <Metric label="24h Vol" value={formatUsdCompact(volume24h)} />
              <Metric label="Liquidity" value={formatUsdCompact(liquidity)} />
              <Metric label="5m" value={formatPct(chg5)} good={chg5 == null ? null : Number(chg5) >= 0 ? true : false} />
              <Metric label="15m" value={formatPct(chg15)} good={chg15 == null ? null : Number(chg15) >= 0 ? true : false} />
              <Metric label="1h" value={formatPct(chg60)} good={chg60 == null ? null : Number(chg60) >= 0 ? true : false} />
            </div>

            {showEdgeTag && (
              <div className="relative mt-2">
                <SignalEdgeTag
                  rule={edgeLabel}
                  winRate={ruleWr}
                  samples={ruleSamples}
                  avgReturn={ruleAvgReturn}
                  regime={effectiveRegime}
                  calibrated={ruleCalibrated}
                />
              </div>
            )}

            {sig._api?.topWallet && Number(sig._api.topWallet.winRate) >= 40 && (
              <div className="relative mt-1.5 flex min-w-0 items-center gap-1.5 text-[10px] font-mono">
                <span className="shrink-0 text-[9px] uppercase tracking-[0.1em] text-zinc-500">Top wallet</span>
                <Link
                  href={`/wallet-stalker?w=${encodeURIComponent(sig._api.topWallet.addressFull || "")}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-sky-400/25 bg-sky-500/[0.06] text-sky-200 no-underline transition hover:border-sky-400/50 hover:bg-sky-500/12"
                  title={`Track wallet ${sig._api.topWallet.addressFull}`}
                >
                  <span className="font-bold">{sig._api.topWallet.address}…</span>
                  <span className="text-emerald-300 font-bold">
                    WR {Math.round(Number(sig._api.topWallet.winRate))}%
                  </span>
                  {Number(sig._api.topWallet.trades) > 0 && (
                    <span className="text-zinc-500">n={sig._api.topWallet.trades}</span>
                  )}
                </Link>
              </div>
            )}

            <p className="relative mt-1.5 truncate text-[10px] italic leading-snug text-sl-muted" title={reason}>
              {reason}
            </p>

            {/* Push the action bar to the card bottom so a 6-section card
                and a 9-section card line up identically in a grid. */}
            <div className="relative flex-1" aria-hidden />

            <div className="relative mt-2 flex min-w-0 items-center justify-between gap-2 text-[10px]">
              <span className={`truncate rounded-md border px-2 py-1 font-bold ${liveTone.chip}`}>{delayedRisk}</span>
              <div className="ml-auto flex shrink-0 items-center gap-1.5 opacity-90 transition group-hover:opacity-100">
                <button
                  type="button"
                  disabled={!validMint}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!validMint) return;
                    onSelectMint(sig.mint, { src: "live", tr: displayScoreSafe, sw: walletCount });
                  }}
                  className={`min-h-11 rounded-md border border-white/10 bg-white/[0.05] px-3 text-[9px] font-black uppercase tracking-[0.08em] text-zinc-200 transition ${validMint ? "hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-100" : "cursor-not-allowed opacity-40"}`}
                >
                  Intel
                </button>
                <Link
                  href={reportHref}
                  aria-disabled={!validMint}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!validMint) e.preventDefault();
                  }}
                  className={`flex min-h-11 items-center rounded-md border px-3 text-[9px] font-black uppercase tracking-[0.08em] no-underline transition ${validMint ? `${liveTone.border} ${liveTone.bg} ${liveTone.text} hover:bg-white/[0.08]` : "pointer-events-none opacity-40"}`}
                >
                  Chart
                </Link>
              </div>
            </div>

            {/* Phase 7c — Quick-buy preset chips. Each chip deep-links to
                Jupiter pre-filled. Reduces signal→action friction (HUGE for memecoins)
                — Photon/GMGN have this, we now match it. */}
            {validMint && (
              <div className="relative mt-1.5 flex min-w-0 items-center gap-1.5 text-[10px]">
                <span className="shrink-0 text-[9px] uppercase tracking-[0.1em] text-zinc-500">Quick buy</span>
                {[0.1, 0.5, 1].map((amount) => (
                  <a
                    key={amount}
                    href={buildJupiterSwapUrl(sig.mint, amount)}
                    target="_blank"
                    rel={EXTERNAL_ANCHOR_REL}
                    onClick={(e) => e.stopPropagation()}
                    title={`Buy ${amount} SOL of ${symbol} on Jupiter`}
                    className="min-h-9 px-2.5 py-1 rounded border border-emerald-400/25 bg-emerald-500/[0.08] text-[10px] font-mono font-bold text-emerald-200 no-underline transition hover:border-emerald-400/50 hover:bg-emerald-500/15 hover:text-emerald-100"
                  >
                    {amount} SOL
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      }}
    </RealtimeTokenCardShell>
  );
}
