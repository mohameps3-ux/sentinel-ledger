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
import { BarChart3, CandlestickChart, Radar, ShieldAlert, Users, Activity } from "lucide-react";

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
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-3">
          <div className="text-xs text-gray-500">Liquidity</div>
          <div className="font-semibold">${Number(market.liquidity || 0).toLocaleString()}</div>
        </div>
        <div className="glass-card p-3">
          <div className="text-xs text-gray-500">24h Volume</div>
          <div className="font-semibold">${Number(market.volume24h || 0).toLocaleString()}</div>
        </div>
        <div className="glass-card p-3">
          <div className="text-xs text-gray-500">FDV</div>
          <div className="font-semibold">${Number(market.marketCap || 0).toLocaleString()}</div>
        </div>
        <div className="glass-card p-3">
          <div className="text-xs text-gray-500 inline-flex items-center gap-1"><Activity size={12} /> Live feed</div>
          <div className={`font-semibold ${isConnected ? "text-emerald-300" : "text-amber-300"}`}>
            {isConnected ? "Connected" : "Reconnecting"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
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
            <LiveFlowPanel transactions={transactions} />
          </ExpandablePanel>

          <ExpandablePanel title="Smart Money Activity" icon={Radar} defaultOpen={true} badge="intel">
            <SmartMoneyPanel tokenAddress={address} />
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

