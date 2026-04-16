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
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <HeroSection
          symbol={market.symbol}
          price={market.price}
          priceChange={market.priceChange24h}
          grade={analysis.grade}
          confidence={analysis.confidence}
        />
        <WatchlistButton tokenAddress={address} isWatchlisted={isWatchlisted} />
      </div>
      <DecisionPanel analysis={analysis} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ChartPanel address={address} />
        <MomentumPanel market={market} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <HoldersPanel holders={{ top10Percentage: 0, totalHolders: 0 }} />
        <DeployerPanel deployer={null} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <LiveFlowPanel transactions={transactions} />
        <SmartMoneyPanel />
      </div>
      {hasToken && <NotesPanel tokenAddress={address} initialNote={note} />}
    </div>
  );
}

