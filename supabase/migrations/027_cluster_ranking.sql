ALTER TABLE cluster_intel
  ADD COLUMN IF NOT EXISTS rank_score      FLOAT       DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS decay_score     FLOAT       DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS last_ranked_at  TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS active_wallets  INT         DEFAULT 0;

COMMENT ON COLUMN cluster_intel.rank_score IS
  'Dynamic rank 0-100 based on hit rate, performance, recency, failures';
COMMENT ON COLUMN cluster_intel.decay_score IS
  'Inverse of rank_score — higher = more decayed/stale';
COMMENT ON COLUMN cluster_intel.tags IS
  'Labels including blacklisted when consecutive_failures >= 3';
