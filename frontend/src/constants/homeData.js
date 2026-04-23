/**
 * UI configuration constants for the war cockpit home.
 * No imports — safe to tree-shake and snapshot in tests.
 */

export const TACTICAL_TAB_LS_KEY = "sentinel.cockpit.tacticalTab";

/**
 * Cockpit timing & layout knobs (single source of truth for Phase 4+ polish).
 * Keep aligned with `useRankingSnapshot`, React Query intervals, and Virtuoso.
 */
export const UI_CONFIG = Object.freeze({
  RANKING_FLUSH_WAR_MS: 5000,
  RANKING_FLUSH_NORMAL_MS: 8000,
  SIGNAL_FEED_REFETCH_WAR_MS: 4000,
  SIGNAL_FEED_REFETCH_NORMAL_MS: 8000,
  TRENDING_REFETCH_WAR_MS: 4000,
  TRENDING_REFETCH_NORMAL_MS: 7000,
  GRID_EXPANDED_MAX_CARDS: 56,
  GRID_COMPACT_CARDS: 15,
  /** Keep ≤ backend `SIGNAL_FEED_MAX_CARDS` (default 64) for expanded feed. */
  SIGNAL_API_LIMIT_EXPANDED: 56,
  SIGNAL_API_LIMIT_COMPACT: 24,
  TRENDING_API_LIMIT_EXPANDED: 56,
  TRENDING_API_LIMIT_COMPACT: 24,
  /** Use Virtuoso when visible live cards exceed this count. */
  VIRTUOSO_ROW_THRESHOLD: 50,
  /** Cards per Virtuoso row; keep equal to max column count in `LIVE_HOT_GRID_CLASS`. */
  VIRTUOSO_COLUMNS: 5,
  /**
   * LIVE + HOT card grids: more, smaller cards per row on wide viewports.
   * Must stay in sync with `VIRTUOSO` row chunking.
   */
  LIVE_HOT_GRID_CLASS:
    "grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5"
});
