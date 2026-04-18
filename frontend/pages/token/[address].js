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
import { BarChart3, CandlestickChart, Radar, ShieldAlert, Users, Activity } from "lucide-react";
import { formatUsdWhole } from "../../lib/formatStable";
import { Ticker } from "../../components/layout/Ticker";
import { FinancialDisclaimer } from "../../components/layout/FinancialDisclaimer";
import { PageHead } from "../../components/seo/PageHead";

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

export default function TokenPage() {
  const router = useRouter();
  const address = normalizeAddress(router.query);
  const query = useTokenData(address);
  const proStatus = useProStatus();
  const { transactions, isConnected, connectionState } = useWebSocket(address || undefined);
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
        <PageHead
          title="Token — Sentinel Ledger"
          description="Open a Solana mint to see grades, liquidity, smart money flow, and deployer intel."
        />
      <div className="max-w-xl mx-auto px-4 py-20">
        <div className="glass-card p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Invalid token URL</h2>
          <p className="text-gray-400 text-sm">
            Use a full Solana mint in the path (for example <span className="mono text-gray-300">/token/&lt;mint&gt;</span>).
          </p>
        </div>
      </div>
      </>
    );
  }

  if (query.isPending) return <TokenSkeleton />;

  if (query.isError) {
    return (
      <>
        <PageHead
          title={`${shortMint(address)} — Sentinel Ledger`}
          description="Token intelligence for this Solana mint. Retry if data is temporarily unavailable."
        />
      <div className="max-w-xl mx-auto px-4 py-20">
        <div className="glass-card p-8 text-center">
          <h2 className="text-xl font-semibold text-red-300 mb-2">Data unavailable</h2>
          <p className="text-gray-400 text-sm">We could not fetch token data right now. Please retry in a moment.</p>
        </div>
      </div>
      </>
    );
  }

  if (!token) {
    return (
      <>
        <PageHead
          title={`${shortMint(address)} — Sentinel Ledger`}
          description="Token intelligence for this Solana mint on Sentinel Ledger."
        />
      <div className="max-w-xl mx-auto px-4 py-20">
        <div className="glass-card p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">No data available</h2>
          <p className="text-gray-400 text-sm">This token could not be resolved or has no market data yet.</p>
        </div>
      </div>
      </>
    );
  }

  if (!token.market || !token.analysis) return <TokenSkeleton />;

  const { market, analysis, private: privateData } = token;
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
      ? "Connected"
      : connectionState === "reconnecting"
        ? "Reconnecting"
        : "Disconnected";

  return (
    <>
      <PageHead
        title={`${market.symbol} (${shortMint(address)}) — Sentinel Ledger`}
        description={`Live grade, liquidity, smart money flow, and deployer intel for ${market.symbol} on Solana. Not financial advice.`}
      />
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 pb-28 lg:pb-10">
      <Ticker />
      <WalletThreatBanner walletIntel={token.walletIntel} />
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
            {soundEnabled ? "🔊 Sound On" : "🔈 Sound Off"}
          </button>
          <WatchlistButton tokenAddress={address} isWatchlisted={isWatchlisted} />
          {proStatusReady && (
            <>
              {hasToken && hasProAccess ? (
                <Link
                  href="/alerts"
                  className="px-2.5 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-xs text-cyan-200 hover:bg-cyan-500/20 transition"
                >
                  Telegram alerts
                </Link>
              ) : null}
              {hasToken && !hasProAccess ? (
                <Link
                  href="/pricing"
                  className="px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 text-xs text-gray-200 hover:bg-white/10 transition"
                >
                  PRO · alerts
                </Link>
              ) : null}
              {!hasToken ? (
                <Link
                  href="/pricing"
                  className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/10 transition"
                >
                  PRO alerts
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card sl-inset flex flex-col gap-2 min-h-[88px] justify-center">
          <div className="sl-label">Liquidity</div>
          <div className="text-lg font-semibold text-white tracking-tight">${formatUsdWhole(market.liquidity)}</div>
        </div>
        <div className="glass-card sl-inset flex flex-col gap-2 min-h-[88px] justify-center">
          <div className="sl-label">24h volume</div>
          <div className="text-lg font-semibold text-white tracking-tight">${formatUsdWhole(market.volume24h)}</div>
        </div>
        <div className="glass-card sl-inset flex flex-col gap-2 min-h-[88px] justify-center">
          <div className="sl-label">FDV</div>
          <div className="text-lg font-semibold text-white tracking-tight">${formatUsdWhole(market.marketCap)}</div>
        </div>
        <div className="glass-card sl-inset flex flex-col gap-2 min-h-[88px] justify-center">
          <div className="sl-label inline-flex items-center gap-2">
            <Activity size={14} className="text-gray-500" />
            Live feed
          </div>
          <div className={`text-lg font-semibold ${isConnected ? "text-emerald-300" : "text-amber-300"}`}>
            {isConnected ? "Connected" : "Reconnecting"}
          </div>
        </div>
      </div>

      <TradeReadinessPanel
        analysis={analysis}
        market={market}
        holders={token?.holders}
        deployer={token?.deployer}
      />

      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6">
        <section id="chart" className="lg:col-span-2 space-y-6">
          <ChartPanel address={address} />
          <DecisionPanel analysis={analysis} />
          <ExpandablePanel title="⚡ Momentum" icon={BarChart3} defaultOpen={false}>
            <MomentumPanel market={market} />
          </ExpandablePanel>

          <ExpandablePanel title="👥 Holders Distribution" icon={Users} defaultOpen={false}>
            <HoldersPanel holders={token?.holders} />
          </ExpandablePanel>

          <ExpandablePanel title="🔍 Deployer Intelligence" icon={ShieldAlert} defaultOpen={false}>
            <DeployerPanel deployer={token?.deployer} />
          </ExpandablePanel>
        </section>

        <section id="flow" className="space-y-4">
          <ExpandablePanel
            title="📡 Live Transactions"
            icon={CandlestickChart}
            defaultOpen={true}
            badge={recentTransactions.length ? `${recentTransactions.length} tx` : null}
          >
            <LiveFlowPanel transactions={recentTransactions} tokenPriceUsd={market.price} />
          </ExpandablePanel>

          <ExpandablePanel title="🧠 Smart Money Activity" icon={Radar} defaultOpen={true} badge="intel">
            <SmartMoneyPanel tokenAddress={address} flaggedWallets={flaggedWallets} />
          </ExpandablePanel>
        </section>
      </div>

      <ActionBar tokenAddress={address} symbol={market.symbol} />

      {hasToken && <NotesPanel tokenAddress={address} initialNote={note} />}

      <div className="pt-4 pb-8 border-t border-gray-800/60 mt-8">
        <FinancialDisclaimer />
      </div>

      <div className="fixed safe-bottom-offset left-1/2 -translate-x-1/2 z-40 xl:hidden">
        <div className="glass-card px-2 py-1 flex items-center gap-1">
          <a href="#chart" className="px-3 h-8 rounded-lg text-xs inline-flex items-center bg-white/5 hover:bg-white/10">
            Chart
          </a>
          <a href="#intel" className="px-3 h-8 rounded-lg text-xs inline-flex items-center bg-white/5 hover:bg-white/10">
            Intel
          </a>
          <a href="#flow" className="px-3 h-8 rounded-lg text-xs inline-flex items-center bg-white/5 hover:bg-white/10">
            Flow
          </a>
        </div>
      </div>
    </div>
    </>
  );
}
