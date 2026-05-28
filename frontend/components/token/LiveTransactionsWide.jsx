import dynamic from "next/dynamic";
import { useMemo } from "react";

const LiveFlowPanel = dynamic(
  () => import("./LiveFlowPanel").then((mod) => mod.LiveFlowPanel),
  {
    ssr: false,
    loading: () => (
      <div className="border border-white/[0.06] bg-sl-card p-4 text-sm text-sl-muted">Loading live flow…</div>
    )
  }
);

const LIVE_WINDOW_MS = 60_000;

function hasRecentTransaction(transactions, windowMs = LIVE_WINDOW_MS) {
  const now = Date.now();
  return transactions.some((tx) => {
    const t = Date.parse(tx?.timestamp);
    return Number.isFinite(t) && now - t <= windowMs;
  });
}

function resolveFeedStatus({ isConnected, connectionState, isLive }) {
  if (isLive) {
    return { label: "● LIVE", className: "tpt-tx-wide-rate tpt-tx-wide-rate--live" };
  }
  if (connectionState === "reconnecting" || (!isConnected && connectionState !== "disconnected")) {
    return { label: "Reconnecting…", className: "tpt-tx-wide-rate tpt-tx-wide-rate--reconnecting" };
  }
  if (!isConnected) {
    return { label: "Reconnecting…", className: "tpt-tx-wide-rate tpt-tx-wide-rate--reconnecting" };
  }
  return { label: "Stale", className: "tpt-tx-wide-rate tpt-tx-wide-rate--stale" };
}

/**
 * Full-width live transaction feed (below the 3-col terminal grid).
 * Presentational only — data wired from TokenTerminalPage (single WS/REST subscription).
 */
export function LiveTransactionsWide({
  recentTransactions = [],
  tokenPriceUsd = 0,
  isConnected = false,
  connectionState = "disconnected"
}) {
  const isLive = useMemo(
    () => isConnected && hasRecentTransaction(recentTransactions),
    [isConnected, recentTransactions]
  );
  const feedStatus = useMemo(
    () => resolveFeedStatus({ isConnected, connectionState, isLive }),
    [isConnected, connectionState, isLive]
  );

  return (
    <section className="tpt-tx-wide" aria-label="Live transactions">
      <div className="tpt-tx-wide-hdr">
        <span className="tpt-tx-wide-title">LIVE TRANSACTIONS</span>
        <span className={feedStatus.className}>{feedStatus.label}</span>
      </div>

      <div
        id="flow"
        className="tpt-tx-wide-body scroll-mt-[calc(var(--sl-nav-actual,52px)+var(--sl-token-section-nav-h,2.75rem))]"
      >
        <LiveFlowPanel
          transactions={recentTransactions}
          tokenPriceUsd={tokenPriceUsd}
          isConnected={isConnected}
          connectionState={connectionState}
          isLive={isLive}
        />
      </div>

      <div className="tpt-tx-wide-view-all">VIEW ALL TRANSACTIONS →</div>
    </section>
  );
}
