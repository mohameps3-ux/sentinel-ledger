/**
 * Static demo / fallback payloads for the war cockpit home.
 * No imports — safe to tree-shake and snapshot in tests.
 */

export const TACTICAL_TAB_LS_KEY = "sentinel.cockpit.tacticalTab";

export const FALLBACK_TRENDING = Object.freeze([
  {
    symbol: "BONK",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    grade: "B",
    price: 0.000028,
    change: 12.1,
    volume24h: 2100000,
    flowLabel: "Buy pressure",
    liquidity: 240000,
    alphaSpeedMins: 8,
    whyTrade: Object.freeze([
      "Early whale accumulation in first liquidity window.",
      "Healthy depth for entries without extreme slippage.",
      "Volume expansion confirms participation."
    ])
  },
  {
    symbol: "WIF",
    mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    grade: "A",
    price: 2.13,
    change: 8.6,
    volume24h: 48000000,
    flowLabel: "Smart inflow",
    liquidity: 820000,
    alphaSpeedMins: 5,
    whyTrade: Object.freeze([
      "Smart wallets continue to add on momentum.",
      "Deep liquidity supports larger position sizing.",
      "Sustained turnover keeps execution clean."
    ])
  },
  {
    symbol: "JUP",
    mint: "JUPyiwrYJFksjQVdKWvHJHGzS76nqbwsjZBM74fATFc",
    grade: "A+",
    price: 1.22,
    change: 5.3,
    volume24h: 31000000,
    flowLabel: "Liquidity deep",
    liquidity: 560000,
    alphaSpeedMins: 6,
    whyTrade: Object.freeze([
      "Balanced trend with strong market structure.",
      "Volume confirms persistent demand.",
      "Quality liquidity reduces trap risk."
    ])
  },
  {
    symbol: "POPCAT",
    mint: "7GCihgDB8fe6KNjn2MYtkzZcRjXd3ngw7tF5RbwimQyg",
    grade: "C",
    price: 0.65,
    change: -3.1,
    volume24h: 890000,
    flowLabel: "Mixed flow",
    liquidity: 110000,
    alphaSpeedMins: 14,
    whyTrade: Object.freeze([
      "Potential mean-reversion setup after pullback.",
      "Still inside tradable liquidity band.",
      "Flow remains mixed, favor tighter risk management."
    ])
  }
]);

export const TOP_SMART_WALLETS = Object.freeze([
  {
    wallet: "9xAb...L3kP",
    address: "7YqvBxbp5XJvYzX1Q2f7pN8mQ3uQmY9mQb8Qxqj2mT8x",
    winRate: 91.4,
    earlyEntry: 88,
    cluster: 84,
    consistency: 89,
    signalStrength: 90,
    pnl30d: 38420,
    tooltip: "Big win: +$12.4k on BONK breakout."
  },
  {
    wallet: "5KmQ...T8uD",
    address: "4g3b6PqvT2n8mM9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q",
    winRate: 87.2,
    earlyEntry: 81,
    cluster: 79,
    consistency: 86,
    signalStrength: 84,
    pnl30d: 22790,
    tooltip: "Big win: +$8.1k on WIF momentum add."
  },
  {
    wallet: "Dx2n...Qz7M",
    address: "9mQx2sJ1pK8pQ9xY7uV2cR5bN1mX3q4g3b6PqvT2n8m",
    winRate: 85.8,
    earlyEntry: 78,
    cluster: 82,
    consistency: 80,
    signalStrength: 82,
    pnl30d: 19860,
    tooltip: "Big win: +$6.3k on JUP rotation."
  },
  {
    wallet: "A7rP...mV4x",
    address: "5tK9pQxY7uV2cR5bN1mX3q4g3b6PqvT2n8mM9mQx2sJ",
    winRate: 83.6,
    earlyEntry: 76,
    cluster: 73,
    consistency: 79,
    signalStrength: 78,
    pnl30d: 14550,
    tooltip: "Big win: +$5.4k on POPCAT reclaim."
  }
]);

export const RECENT_SIGNAL_OUTCOMES = Object.freeze([
  Object.freeze({ symbol: "WIF", signal: 91, outcomePct: 63, horizon: "2h" }),
  Object.freeze({ symbol: "BONK", signal: 87, outcomePct: 41, horizon: "1h" }),
  Object.freeze({ symbol: "XYZ", signal: 78, outcomePct: -12, horizon: "4h" })
]);

/**
 * Cockpit timing & layout knobs (single source of truth for Phase 4+ polish).
 * Keep aligned with `useRankingSnapshot`, React Query intervals, and Virtuoso.
 */
export const UI_CONFIG = Object.freeze({
  RANKING_FLUSH_WAR_MS: 5000,
  RANKING_FLUSH_NORMAL_MS: 15000,
  SIGNAL_FEED_REFETCH_WAR_MS: 5000,
  SIGNAL_FEED_REFETCH_NORMAL_MS: 15000,
  TRENDING_REFETCH_WAR_MS: 5000,
  TRENDING_REFETCH_NORMAL_MS: 25000,
  GRID_EXPANDED_MAX_CARDS: 56,
  GRID_COMPACT_CARDS: 12,
  SIGNAL_API_LIMIT_EXPANDED: 56,
  SIGNAL_API_LIMIT_COMPACT: 24,
  TRENDING_API_LIMIT_EXPANDED: 56,
  TRENDING_API_LIMIT_COMPACT: 24,
  /** Use Virtuoso when visible live cards exceed this count. */
  VIRTUOSO_ROW_THRESHOLD: 50,
  /** Cards per row in the Virtuoso path (2-col responsive band). */
  VIRTUOSO_COLUMNS: 2
});
