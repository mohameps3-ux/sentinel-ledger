import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useTokenData } from "../../hooks/useTokenData";
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

export default function TokenPage() {
  const router = useRouter();
  const { address } = router.query;
  const { data, isLoading, error } = useTokenData(address);
  const { transactions, isConnected } = useWebSocket(address);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    setHasToken(typeof window !== "undefined" && !!localStorage.getItem("token"));
  }, []);

  const token = useMemo(() => data?.data, [data]);
  const walletIntel = token?.walletIntel;
  const flaggedWallets = useMemo(() => {
    const set = new Set();
    for (const s of walletIntel?.signals || []) {
      if (s?.wallet) set.add(s.wallet);
    }
    return set;
  }, [walletIntel]);

  if (isLoading) return <TokenSkeleton />;
  if (error)
    return (
      <div className="max-w-xl mx-auto px-4 py-20">
        <div className="glass-card p-8 text-center">
          <h2 className="text-xl font-semibold text-red-300 mb-2">Data unavailable</h2>
          <p className="text-gray-400 text-sm">We could not fetch token data right now. Please retry in a moment.</p>
        </div>
      </div>
    );
  if (!token)
    return (
      <div className="max-w-xl mx-auto px-4 py-20">
        <div className="glass-card p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">No data available</h2>
          <p className="text-gray-400 text-sm">This token could not be resolved or has no market data yet.</p>
        </div>
      </div>
    );

  const { market, analysis, private: privateData } = token;
  const isWatchlisted = privateData?.isWatchlist || false;
  const note = privateData?.notes || "";

  return (
    <div className="sl-container sl-container-wide py-8 md:py-10 space-y-8">
      <WalletThreatBanner walletIntel={token.walletIntel} />
      <div className="flex flex-wrap justify-between items-start gap-6">
        <HeroSection
          symbol={market.symbol}
          price={market.price}
          priceChange={market.priceChange24h}
          grade={analysis.grade}
          confidence={analysis.confidence}
          tokenAddress={address}
        />
        <WatchlistButton tokenAddress={address} isWatchlisted={isWatchlisted} />
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

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        <section id="chart" className="xl:col-span-5 space-y-6 xl:sticky xl:top-28 h-fit">
          <ChartPanel address={address} />
        </section>

        <section id="intel" className="xl:col-span-4 space-y-4">
          <DecisionPanel analysis={analysis} />

          <ExpandablePanel title="Momentum Indicators" icon={BarChart3} defaultOpen={false}>
            <MomentumPanel market={market} />
          </ExpandablePanel>

          <ExpandablePanel title="Holders Distribution" icon={Users} defaultOpen={false}>
            <HoldersPanel holders={token?.holders} />
          </ExpandablePanel>

          <ExpandablePanel title="Deployer Intelligence" icon={ShieldAlert} defaultOpen={false}>
            <DeployerPanel deployer={token?.deployer} />
          </ExpandablePanel>
        </section>

        <section id="flow" className="xl:col-span-3 space-y-4 xl:sticky xl:top-28 h-fit">
          <ExpandablePanel
            title="Live Transactions"
            icon={CandlestickChart}
            defaultOpen={true}
            badge={transactions.length ? `${transactions.length} new tx` : null}
          >
            <LiveFlowPanel transactions={transactions} tokenPriceUsd={market.price} />
          </ExpandablePanel>

          <ExpandablePanel title="Smart Money Activity" icon={Radar} defaultOpen={true} badge="intel">
            <SmartMoneyPanel tokenAddress={address} flaggedWallets={flaggedWallets} />
          </ExpandablePanel>
        </section>
      </div>

      <ActionBar tokenAddress={address} symbol={market.symbol} />

      {hasToken && <NotesPanel tokenAddress={address} initialNote={note} />}

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 xl:hidden">
        <div className="glass-card px-2 py-1 flex items-center gap-1">
          <a href="#chart" className="px-3 h-8 rounded-lg text-xs inline-flex items-center bg-white/5 hover:bg-white/10">Chart</a>
          <a href="#intel" className="px-3 h-8 rounded-lg text-xs inline-flex items-center bg-white/5 hover:bg-white/10">Intel</a>
          <a href="#flow" className="px-3 h-8 rounded-lg text-xs inline-flex items-center bg-white/5 hover:bg-white/10">Flow</a>
        </div>
      </div>
    </div>
  );
}

