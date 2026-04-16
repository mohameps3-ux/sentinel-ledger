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
import { BarChart3, CandlestickChart, Radar, ShieldAlert, Users } from "lucide-react";

export default function TokenPage() {
  const router = useRouter();
  const { address } = router.query;
  const { data, isLoading, error } = useTokenData(address);
  const { transactions } = useWebSocket(address);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    setHasToken(typeof window !== "undefined" && !!localStorage.getItem("token"));
  }, []);

  const token = useMemo(() => data?.data, [data]);

  if (isLoading) return <TokenSkeleton />;
  if (error)
    return (
      <div className="p-8 text-red-500 text-center">Error: {error.message}</div>
    );
  if (!token)
    return <div className="p-8 text-center text-gray-400">Token not found</div>;

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

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <section className="xl:col-span-5 space-y-6">
          <ChartPanel address={address} />
        </section>

        <section className="xl:col-span-4 space-y-4">
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

        <section className="xl:col-span-3 space-y-4">
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
    </div>
  );
}

