import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTokenData } from "../../hooks/useTokenData";
import { useProStatus } from "../../hooks/useProStatus";
import { useWebSocket } from "../../hooks/useWebSocket";
import { HeroSection } from "../../components/token/HeroSection";
import { DecisionPanel } from "../../components/token/DecisionPanel";
import { TokenSkeleton } from "../../components/token/TokenSkeleton";
import { ChartPanel } from "../../components/token/ChartPanel";
import { MomentumPanel } from "../../components/token/MomentumPanel";
import { SmartMoneyPanel } from "../../components/token/SmartMoneyPanel";
import { HoldersPanel } from "../../components/token/HoldersPanel";
import { DeployerPanel } from "../../components/token/DeployerPanel";
import { LiveFlowPanel } from "../../components/token/LiveFlowPanel";
import { WatchlistButton } from "../../components/token/WatchlistButton";
import { NotesPanel } from "../../components/token/NotesPanel";
import { ExpandablePanel } from "../../components/token/ExpandablePanel";
import { ActionBar } from "../../components/token/ActionBar";
import { TradeReadinessPanel } from "../../components/token/TradeReadinessPanel";
import { WalletThreatBanner } from "../../components/token/WalletThreatBanner";
import { TokenIntelDeck } from "../../components/token/TokenIntelDeck";
import { ScoreTerminalCard } from "../../components/token/ScoreTerminalCard";
import { BarChart3, CandlestickChart, Radar, ShieldAlert, Users, Activity } from "lucide-react";
import { formatUsdWhole } from "../../lib/formatStable";
import { Ticker } from "../../components/layout/Ticker";
import { FinancialDisclaimer } from "../../components/layout/FinancialDisclaimer";
import { PageHead } from "../../components/seo/PageHead";
import { useLocale } from "../../contexts/LocaleContext";

function shortMint(addr) {
  if (!addr || typeof addr !== "string" || addr.length < 12) return addr || "";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

/** SSR this route so `router.query` matches the URL (avoids static shell + wrong “no data” / hydration issues). */
export async function getServerSideProps() {
  return { props: {} };
}

function normalizeAddress(query) {
  const raw = query?.address;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw[0]) return raw[0];
  return "";
}

function usdOrNA(value, naLabel) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return naLabel;
  return `$${formatUsdWhole(n)}`;
}

export default function TokenPage() {
  const router = useRouter();
  const { t } = useLocale();
  const address = normalizeAddress(router.query);
  const query = useTokenData(address);
  const proStatus = useProStatus();
  const { transactions, isConnected, connectionState, convergence: liveConvergence, coordination } = useWebSocket(
    address || undefined
  );
  const [hasToken, setHasToken] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const prevTopTxRef = useRef(null);

  useEffect(() => {
    try {
      setHasToken(!!localStorage.getItem("token"));
      setSoundEnabled(localStorage.getItem("sentinel-sound-enabled") === "1");
    } catch {
      setHasToken(false);
      setSoundEnabled(false);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("sentinel-sound-enabled", soundEnabled ? "1" : "0");
    } catch {}
  }, [soundEnabled]);

  const token = useMemo(() => query.data?.data, [query.data]);
  const walletIntel = token?.walletIntel;
  const flaggedWallets = useMemo(() => {
    const set = new Set();
    for (const s of walletIntel?.signals || []) {
      if (s?.wallet) set.add(s.wallet);
    }
    return set;
  }, [walletIntel]);
  const recentTransactions = useMemo(() => transactions.slice(0, 30), [transactions]);

  useEffect(() => {
    if (!soundEnabled) return;
    const topTx = recentTransactions[0];
    if (!topTx || !topTx.shouldNotify) return;
    const signature = topTx.signature || `${topTx.wallet}-${topTx.timestamp}`;
    if (prevTopTxRef.current === signature) return;
    prevTopTxRef.current = signature;
    if (typeof window === "undefined") return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.start(now);
    osc.stop(now + 0.1);
    const t = setTimeout(() => ctx.close(), 140);
    return () => clearTimeout(t);
  }, [recentTransactions, soundEnabled]);

  if (!router.isReady) return <TokenSkeleton />;

  if (!address || address.length < 32) {
    return (
      <>
        <PageHead title={t("token.pageTitleShort")} description={t("token.pageDescMint")} />
      <div className="max-w-xl mx-auto px-4 py-20">
        <div className="glass-card p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">{t("token.invalidTitle")}</h2>
          <p className="text-gray-400 text-sm">{t("token.invalidBody")}</p>
        </div>
      </div>
      </>
    );
  }

  if (query.isPending) return <TokenSkeleton />;

  if (query.isError) {
    return (
      <>
        <PageHead title={`${shortMint(address)} — Sentinel Ledger`} description={t("token.pageDescRetry")} />
      <div className="max-w-xl mx-auto px-4 py-20">
        <div className="glass-card p-8 text-center">
          <h2 className="text-xl font-semibold text-red-300 mb-2">{t("token.errorTitle")}</h2>
          <p className="text-gray-400 text-sm">{t("token.errorBody")}</p>
        </div>
      </div>
      </>
    );
  }

  if (!token) {
    return (
      <>
        <PageHead title={`${shortMint(address)} — Sentinel Ledger`} description={t("token.pageDescMint")} />
      <div className="max-w-xl mx-auto px-4 py-20">
        <div className="glass-card p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">{t("token.noDataTitle")}</h2>
          <p className="text-gray-400 text-sm">{t("token.noDataBody")}</p>
        </div>
      </div>
      </>
    );
  }

  if (!token.market || !token.analysis) {
    return (
      <>
        <PageHead title={`${shortMint(address)} — Sentinel Ledger`} description={t("token.pageDescMint")} />
        <div className="max-w-xl mx-auto px-4 py-20">
          <div className="glass-card p-8 text-center space-y-4">
            <h2 className="text-xl font-semibold text-amber-200">{t("token.incompleteTitle")}</h2>
            <p className="text-gray-400 text-sm leading-relaxed">{t("token.incompleteBody")}</p>
            <button
              type="button"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/[0.06] text-sm text-gray-100 hover:bg-white/10 disabled:opacity-50"
            >
              {query.isFetching ? t("token.retrying") : t("token.retry")}
            </button>
            <p className="text-[11px] text-gray-600 font-mono break-all">{address}</p>
          </div>
        </div>
      </>
    );
  }

  const { market, analysis, private: privateData } = token;
  const convergence = liveConvergence?.detected ? liveConvergence : token?.convergence;
  const redSig = coordination?.redSignal;
  const coordMeta = coordination?.meta;
  const isWatchlisted = privateData?.isWatchlist || false;
  const note = privateData?.notes || "";
  const hasProAccess = proStatus.data?.data?.hasProAccess === true;
  const proStatusReady = !hasToken || proStatus.isSuccess || proStatus.isError;
  const statusTone =
    connectionState === "connected"
      ? "bg-emerald-400"
      : connectionState === "reconnecting"
        ? "bg-amber-300"
        : "bg-red-400";
  const statusLabel =
    connectionState === "connected"
      ? t("token.status.connected")
      : connectionState === "reconnecting"
        ? t("token.status.reconnecting")
        : t("token.status.disconnected");

  return (
    <>
      <PageHead
        title={`${market.symbol} (${shortMint(address)}) — Sentinel Ledger`}
        description={t("token.pageDescLive", { symbol: market.symbol })}
      />
    <div className="sl-container py-6 space-y-6 pb-28 lg:pb-10">
      <Ticker />
      <WalletThreatBanner walletIntel={token.walletIntel} />
      {convergence?.detected ? (
        <div className="glass-card border border-emerald-500/35 bg-emerald-500/10 px-4 py-3">
          <p className="text-xs uppercase tracking-wider text-emerald-200 font-semibold">{t("token.conv.title")}</p>
          <p className="text-sm text-gray-200 mt-1">
            {t("token.conv.body", {
              count: Math.max(3, Number(convergence?.wallets?.length || 0)),
              minutes: Number(convergence?.windowMinutes || 10)
            })}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {(convergence?.wallets || []).slice(0, 8).map((w) => (
              <span
                key={w}
                className="mono text-[11px] px-2 py-1 rounded border border-white/15 bg-white/5 text-emerald-200"
              >
                {w.slice(0, 4)}...{w.slice(-4)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {redSig ? (
        <div
          className={`glass-card border px-4 py-3 ${
            redSig === "RED_CONFIRM"
              ? "border-red-500/45 bg-red-500/10"
              : redSig === "RED_PREPARE"
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-slate-500/40 bg-slate-500/5"
          }`}
        >
          <p className="text-xs uppercase tracking-wider font-semibold text-gray-200">
            {t("token.red.walletCoord")} — {redSig.replace(/_/g, " ")}
          </p>
          {coordMeta && typeof coordMeta === "object" && (
            <p className="text-[12px] text-gray-300 mt-2 leading-relaxed">
              {coordMeta.priorClusterAlerts != null
                ? t("token.red.priorIntro", {
                    a: String(coordMeta.priorClusterAlerts),
                    suffix:
                      coordMeta.uniqueMintsWithPriorClusterAlerts != null
                        ? t("token.red.priorSuffixMints", { m: coordMeta.uniqueMintsWithPriorClusterAlerts })
                        : ""
                  })
                : null}{" "}
              {coordMeta.meanCoordinationLeadSecPrior != null
                ? t("token.red.meanLeadPrior", { s: coordMeta.meanCoordinationLeadSecPrior })
                : null}
              {coordMeta.coordinationLeadSec != null
                ? t("token.red.windowLead", { s: coordMeta.coordinationLeadSec })
                : null}
              {coordMeta.meanScorePriorClusterAlerts != null
                ? t("token.red.priorMeanScore", { s: coordMeta.meanScorePriorClusterAlerts })
                : null}
            </p>
          )}
          {coordMeta && typeof coordMeta === "object" &&
            (coordMeta.priorClusterAlertsWithVerifiedPumps != null ||
              coordMeta.meanSignalOutcomePctPriorVerified != null) && (
            <p className="text-[12px] text-cyan-200/90 mt-2 leading-relaxed border-t border-white/10 pt-2">
              {coordMeta.priorClusterAlertsWithVerifiedPumps != null
                ? t("token.red.verifiedIntro", {
                    pct:
                      coordMeta.pumpMinMarketOutcomePct != null
                        ? coordMeta.pumpMinMarketOutcomePct
                        : coordMeta.pumpMinOutcomePctThreshold != null
                          ? coordMeta.pumpMinOutcomePctThreshold
                          : "…",
                    pump: coordMeta.priorClusterAlertsWithVerifiedPumps,
                    mintPart:
                      coordMeta.uniqueMintsWithVerifiedPumps != null
                        ? t("token.red.verifiedMints", { n: coordMeta.uniqueMintsWithVerifiedPumps })
                        : ""
                  })
                : ""}
              {coordMeta.meanSignalOutcomePctPriorVerified != null
                ? t("token.red.meanOutcome", { v: coordMeta.meanSignalOutcomePctPriorVerified })
                : null}
              {coordMeta.meanCoordinationLeadSecPriorVerified != null
                ? t("token.red.meanLeadVerified", { s: coordMeta.meanCoordinationLeadSecPriorVerified })
                : null}
            </p>
          )}
          {redSig === "RED_ABORT" && (
            <p className="text-[12px] text-slate-300 mt-1">{t("token.red.abortNote")}</p>
          )}
        </div>
      ) : null}
      <div className="flex flex-wrap justify-between items-start gap-3">
        <HeroSection
          symbol={market.symbol}
          price={market.price}
          priceChange={market.priceChange24h}
          grade={analysis.grade}
          confidence={analysis.confidence}
          tokenAddress={address}
          market={market}
        />
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs">
            <span className={`h-2.5 w-2.5 rounded-full ${statusTone}`} />
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={() => setSoundEnabled((v) => !v)}
            className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs hover:bg-white/10 transition-transform hover:scale-105"
          >
            {soundEnabled ? t("token.soundOn") : t("token.soundOff")}
          </button>
          <WatchlistButton tokenAddress={address} isWatchlisted={isWatchlisted} />
          {proStatusReady && (
            <>
              {hasToken && hasProAccess ? (
                <Link
                  href="/alerts"
                  className="px-2.5 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-xs text-cyan-200 hover:bg-cyan-500/20 transition"
                >
                  {t("token.link.tgAlerts")}
                </Link>
              ) : null}
              {hasToken && !hasProAccess ? (
                <Link
                  href="/pricing"
                  className="px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 text-xs text-gray-200 hover:bg-white/10 transition"
                >
                  {t("token.link.proAlerts")}
                </Link>
              ) : null}
              {!hasToken ? (
                <Link
                  href="/pricing"
                  className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/10 transition"
                >
                  {t("token.link.proAlertsShort")}
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card sl-inset flex flex-col gap-2 min-h-[88px] justify-center">
          <div className="sl-label">{t("token.stat.liq")}</div>
          <div className="text-lg font-semibold text-white tracking-tight">{usdOrNA(market.liquidity, t("token.stat.na"))}</div>
        </div>
        <div className="glass-card sl-inset flex flex-col gap-2 min-h-[88px] justify-center">
          <div className="sl-label">{t("token.stat.vol24")}</div>
          <div className="text-lg font-semibold text-white tracking-tight">{usdOrNA(market.volume24h, t("token.stat.na"))}</div>
        </div>
        <div className="glass-card sl-inset flex flex-col gap-2 min-h-[88px] justify-center">
          <div className="sl-label">{t("token.stat.fdv")}</div>
          <div className="text-lg font-semibold text-white tracking-tight">{usdOrNA(market.marketCap, t("token.stat.na"))}</div>
        </div>
        <div className="glass-card sl-inset flex flex-col gap-2 min-h-[88px] justify-center">
          <div className="sl-label inline-flex items-center gap-2">
            <Activity size={14} className="text-gray-500" />
            {t("token.stat.liveFeed")}
          </div>
          <div className={`text-lg font-semibold ${isConnected ? "text-emerald-300" : "text-amber-300"}`}>
            {isConnected ? t("token.status.connected") : t("token.status.reconnecting")}
          </div>
        </div>
      </div>

      <ActionBar tokenAddress={address} symbol={market.symbol} market={market} />

      <TradeReadinessPanel
        analysis={analysis}
        market={market}
        holders={token?.holders}
        deployer={token?.deployer}
      />

      <ScoreTerminalCard asset={address} />

      <TokenIntelDeck
        address={address}
        market={market}
        security={token?.security}
        terminal={token?.terminal}
        smartMoneyForToken={token?.smartMoneyForToken}
        deployer={token?.deployer}
      />

      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6">
        <section id="chart" className="lg:col-span-2 space-y-6">
          <ChartPanel address={address} />
          <DecisionPanel analysis={analysis} />
          <ExpandablePanel title={t("token.panel.momentum")} icon={BarChart3} defaultOpen={false}>
            <MomentumPanel market={market} />
          </ExpandablePanel>

          <ExpandablePanel title={t("token.panel.holders")} icon={Users} defaultOpen={false}>
            <HoldersPanel holders={token?.holders} />
          </ExpandablePanel>

          <ExpandablePanel title={t("token.panel.deployer")} icon={ShieldAlert} defaultOpen={false}>
            <DeployerPanel deployer={token?.deployer} />
          </ExpandablePanel>
        </section>

        <section id="flow" className="space-y-4">
          <ExpandablePanel
            title={t("token.panel.liveTx")}
            icon={CandlestickChart}
            defaultOpen={true}
            badge={recentTransactions.length ? t("token.panel.badgeTx", { n: recentTransactions.length }) : null}
          >
            <LiveFlowPanel transactions={recentTransactions} tokenPriceUsd={market.price} />
          </ExpandablePanel>

          <ExpandablePanel
            title={t("token.panel.smartMoney")}
            icon={Radar}
            defaultOpen={true}
            badge={t("token.panel.badgeIntel")}
          >
            <SmartMoneyPanel tokenAddress={address} flaggedWallets={flaggedWallets} />
          </ExpandablePanel>
        </section>
      </div>
      {hasToken && <NotesPanel tokenAddress={address} initialNote={note} />}

      <div className="pt-4 pb-8 border-t border-gray-800/60 mt-8">
        <FinancialDisclaimer />
      </div>

      <div className="fixed safe-bottom-offset left-1/2 -translate-x-1/2 z-40 xl:hidden">
        <div className="glass-card px-2 py-1 flex items-center gap-1">
          <a href="#chart" className="px-3 h-8 rounded-lg text-xs inline-flex items-center bg-white/5 hover:bg-white/10">
            {t("token.nav.chart")}
          </a>
          <a href="#intel" className="px-3 h-8 rounded-lg text-xs inline-flex items-center bg-white/5 hover:bg-white/10">
            {t("token.nav.intel")}
          </a>
          <a href="#flow" className="px-3 h-8 rounded-lg text-xs inline-flex items-center bg-white/5 hover:bg-white/10">
            {t("token.nav.flow")}
          </a>
        </div>
      </div>
    </div>
    </>
  );
}
