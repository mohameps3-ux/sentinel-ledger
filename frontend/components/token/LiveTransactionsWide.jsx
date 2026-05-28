import dynamic from "next/dynamic";

const LiveFlowPanel = dynamic(
  () => import("./LiveFlowPanel").then((mod) => mod.LiveFlowPanel),
  {
    ssr: false,
    loading: () => (
      <div className="border border-white/[0.06] bg-sl-card p-4 text-sm text-sl-muted">Loading live flow…</div>
    )
  }
);

/**
 * Full-width live transaction feed (below the 3-col terminal grid).
 * Presentational only — data wired from TokenTerminalPage (single WS/REST subscription).
 */
export function LiveTransactionsWide({ recentTransactions = [], tokenPriceUsd = 0 }) {
  return (
    <section className="tpt-tx-wide" aria-label="Live transactions">
      <div className="tpt-tx-wide-hdr">
        <span className="tpt-tx-wide-title">LIVE TRANSACTIONS</span>
        <span className="tpt-tx-wide-filter">FILTER: &gt;0.1 SOL</span>
        <span className="tpt-tx-wide-rate">● LIVE</span>
      </div>

      <div
        id="flow"
        className="tpt-tx-wide-body scroll-mt-[calc(var(--sl-nav-actual,52px)+var(--sl-token-section-nav-h,2.75rem))]"
      >
        <LiveFlowPanel
          transactions={recentTransactions}
          tokenPriceUsd={tokenPriceUsd}
          isLive={recentTransactions.length > 0}
        />
      </div>

      <div className="tpt-tx-wide-view-all">VIEW ALL TRANSACTIONS →</div>
    </section>
  );
}
